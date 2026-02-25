import { readFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const webDir = rootDir;
const envPath = path.join(webDir, ".env.local");
const roleSpecPath = "tests/e2e/role-access.spec.ts";
const port = 3100;
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

async function waitForServer(url, timeoutMs = 80_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // noop
    }
    await sleep(400);
  }
  return false;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: webDir,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function runPlaywrightForRole(roleEnv) {
  const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: webDir,
    env: { ...process.env, ...roleEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLogs = "";
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    serverLogs += text;
    process.stdout.write(text);
  });
  server.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    serverLogs += text;
    process.stderr.write(text);
  });

  try {
    const ready = await waitForServer(baseUrl, 90_000);
    if (!ready) {
      const lockHint = serverLogs.includes("Unable to acquire lock")
        ? "Detectado lock de Next dev (.next/dev/lock). Cierra cualquier `npm run dev` abierto y reintenta."
        : "El servidor E2E no respondió a tiempo.";
      throw new Error(lockHint);
    }

    const testCode = await runCommand(
      "npx",
      ["playwright", "test", roleSpecPath, "--project=chromium", "--workers=1"],
      { env: { ...process.env, ...roleEnv } },
    );
    return testCode;
  } finally {
    server.kill("SIGTERM");
    await sleep(900);
  }
}

function pickProfilesAndPortfolios(profiles, portfolios, superadminId) {
  const manager =
    profiles.find((p) => p.role === "admin" && p.id !== superadminId) ??
    profiles.find((p) => p.role === "admin");
  const client = profiles.find((p) => p.role === "cliente");
  const autonomo =
    profiles.find((p) => p.role === "autonomo" && p.id !== superadminId) ??
    profiles.find((p) => p.role === "autonomo");

  if (!manager || !client || !autonomo || !superadminId) {
    throw new Error("No hay usuarios suficientes para la matriz E2E (superadmin/gestor/cliente/autonomo).");
  }

  const managerAssigned = portfolios.find((p) => p.manager_id === manager.id);
  const clientOwn = portfolios.find((p) => p.owner_id === client.id);
  const autonomoOwn = portfolios.find((p) => p.owner_id === autonomo.id);
  const managerForeign =
    portfolios.find((p) => p.owner_id === autonomo.id && p.id !== managerAssigned?.id) ??
    portfolios.find((p) => p.id !== managerAssigned?.id);

  if (!managerAssigned || !clientOwn || !autonomoOwn || !managerForeign) {
    throw new Error("No hay portfolios suficientes para la matriz E2E.");
  }

  const anyPortfolio = portfolios[0];
  if (!anyPortfolio?.id) {
    throw new Error("No hay ningún portfolio disponible para la matriz E2E.");
  }

  const pickForeignPortfolioId = (excludedIds) =>
    (
      portfolios.find((row) => row.id && !excludedIds.includes(row.id))?.id ?? ""
    );

  return {
    managerUserId: manager.id,
    managerAssignedPortfolioId: managerAssigned.id,
    managerForeignPortfolioId: pickForeignPortfolioId([managerAssigned.id]),
    superadmin: {
      userId: superadminId,
      ownPortfolioId: anyPortfolio.id,
      assignedPortfolioId: managerAssigned.id,
      foreignPortfolioId: managerForeign?.id ?? pickForeignPortfolioId([anyPortfolio.id]),
    },
    gestor: {
      userId: manager.id,
      ownPortfolioId: managerAssigned.id,
      assignedPortfolioId: managerAssigned.id,
      foreignPortfolioId: pickForeignPortfolioId([managerAssigned.id]),
    },
    cliente: {
      userId: client.id,
      ownPortfolioId: clientOwn.id,
      assignedPortfolioId: "",
      foreignPortfolioId: pickForeignPortfolioId([clientOwn.id]),
    },
    autonomo: {
      userId: autonomo.id,
      ownPortfolioId: autonomoOwn.id,
      assignedPortfolioId: "",
      foreignPortfolioId: pickForeignPortfolioId([autonomoOwn.id]),
    },
  };
}

async function main() {
  const envFromFile = loadEnvFile(envPath);
  const supabaseUrl = envFromFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = envFromFile.SUPABASE_SERVICE_ROLE_KEY;
  const superadminId = (envFromFile.SUPERADMIN_USER_ID ?? "").trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const [profilesQuery, portfoliosQuery] = await Promise.all([
    supabase.from("profiles").select("id, role"),
    supabase.from("portfolios").select("id, owner_id, manager_id"),
  ]);

  if (profilesQuery.error) throw new Error(`Error leyendo profiles: ${profilesQuery.error.message}`);
  if (portfoliosQuery.error) throw new Error(`Error leyendo portfolios: ${portfoliosQuery.error.message}`);

  const matrix = pickProfilesAndPortfolios(
    profilesQuery.data ?? [],
    portfoliosQuery.data ?? [],
    superadminId,
  );

  const roles = [
    { key: "superadmin", config: matrix.superadmin },
    { key: "gestor", config: matrix.gestor },
    { key: "cliente", config: matrix.cliente },
    { key: "autonomo", config: matrix.autonomo },
  ];

  console.log("== E2E Role Matrix ==");
  console.log(`Base URL: ${baseUrl}`);
  console.log("Ejecutando contra servidor de desarrollo por rol (sin build previo).");

  let failed = 0;
  for (const role of roles) {
    const roleEnv = {
      ...envFromFile,
      E2E_BASE_URL: baseUrl,
      E2E_EXPECTED_ROLE: role.key,
      E2E_OWN_PORTFOLIO_ID: role.config.ownPortfolioId,
      E2E_ASSIGNED_PORTFOLIO_ID: role.config.assignedPortfolioId,
      E2E_FOREIGN_PORTFOLIO_ID: role.config.foreignPortfolioId,
      E2E_MANAGER_USER_ID: matrix.managerUserId,
      E2E_MANAGER_ASSIGNED_PORTFOLIO_ID: matrix.managerAssignedPortfolioId,
      E2E_MANAGER_FOREIGN_PORTFOLIO_ID: matrix.managerForeignPortfolioId,
      ENABLE_DEV_AUTH_FALLBACK: "true",
      DEV_VIEWER_USER_ID: role.config.userId,
    };

    console.log(`\n--- Ejecutando rol: ${role.key} (${role.config.userId.slice(0, 8)}...) ---`);
    const code = await runPlaywrightForRole(roleEnv);
    if (code !== 0) {
      failed += 1;
      console.error(`Rol ${role.key}: FAIL`);
    } else {
      console.log(`Rol ${role.key}: PASS`);
    }
  }

  if (failed > 0) {
    console.error(`\nMatriz E2E finalizada con fallos: ${failed} rol(es).`);
    process.exit(1);
  }

  console.log("\nMatriz E2E finalizada: todos los roles en PASS.");
}

main().catch((error) => {
  console.error(`Error en matriz E2E: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
