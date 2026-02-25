import { readFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const webDir = process.cwd();
const envPath = path.join(webDir, ".env.local");
const specPath = "tests/e2e/export-ui.spec.ts";
const port = 3301;
const baseUrl = `http://127.0.0.1:${port}`;

function loadEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // noop
    }
    await sleep(350);
  }
  return false;
}

async function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: webDir,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function pickQaUserId(envFromFile) {
  const supabaseUrl = envFromFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = envFromFile.SUPABASE_SERVICE_ROLE_KEY;
  const superadminId = (envFromFile.SUPERADMIN_USER_ID ?? "").trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const preferred = (envFromFile.DEV_VIEWER_USER_ID ?? "").trim();
  if (preferred) {
    const preferredQuery = await supabase.from("profiles").select("id, role").eq("id", preferred).maybeSingle();
    if (
      !preferredQuery.error &&
      preferredQuery.data &&
      preferredQuery.data.role !== "cliente" &&
      preferred !== superadminId
    ) {
      return preferred;
    }
  }

  const profiles = await supabase.from("profiles").select("id, role").order("created_at", { ascending: false });
  if (profiles.error) {
    throw new Error(`No se pudieron leer profiles para UI export smoke: ${profiles.error.message}`);
  }

  const qa =
    (profiles.data ?? []).find((row) => row.role === "autonomo" && row.id !== superadminId) ??
    (profiles.data ?? []).find((row) => row.role === "admin" && row.id !== superadminId);
  if (!qa?.id) {
    throw new Error("No hay usuario operativo (autónomo/gestor) para ejecutar UI export smoke.");
  }
  return qa.id;
}

async function main() {
  const envFromFile = loadEnvFile(envPath);
  const qaUserId = await pickQaUserId(envFromFile);
  const roleEnv = {
    ...process.env,
    ...envFromFile,
    ENABLE_DEV_AUTH_FALLBACK: "true",
    DEV_VIEWER_USER_ID: qaUserId,
    E2E_BASE_URL: baseUrl,
  };

  const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: webDir,
    env: roleEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logs += text;
    process.stdout.write(text);
  });
  server.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logs += text;
    process.stderr.write(text);
  });

  try {
    const ready = await waitForServer(baseUrl);
    if (!ready) {
      const lockHint = logs.includes("Unable to acquire lock")
        ? "No se pudo iniciar servidor QA UI (lock de .next/dev). Cierra cualquier npm run dev y reintenta."
        : "No se pudo iniciar servidor QA UI para exportaciones.";
      throw new Error(lockHint);
    }

    const code = await runCommand(
      "npx",
      ["playwright", "test", specPath, "--project=chromium", "--workers=1"],
      roleEnv,
    );
    if (code !== 0) {
      throw new Error(`UI export smoke falló (exit code ${code}).`);
    }
  } finally {
    server.kill("SIGTERM");
    await sleep(900);
  }
}

main().catch((error) => {
  console.error(`E2E_EXPORT_UI_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
