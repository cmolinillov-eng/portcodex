import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const webDir = process.cwd();
const envPath = path.join(webDir, ".env.local");
const port = 3300;
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
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return true;
    } catch {
      // noop
    }
    await sleep(350);
  }
  return false;
}

async function startServer(env) {
  const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: webDir,
    env,
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

  const ready = await waitForServer(baseUrl);
  if (!ready) {
    const lockHint = logs.includes("Unable to acquire lock")
      ? "No se pudo iniciar servidor QA (lock de .next/dev). Cierra cualquier npm run dev y reintenta."
      : "No se pudo iniciar servidor QA para exportaciones.";
    server.kill("SIGTERM");
    await sleep(800);
    throw new Error(lockHint);
  }

  return server;
}

async function stopServer(server) {
  server.kill("SIGTERM");
  await sleep(900);
}

async function exportRequest(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${baseUrl}/api/transactions/export?${query.toString()}`, {
    method: "GET",
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function createPortfolio(supabase, ownerId, label) {
  const created = await supabase
    .from("portfolios")
    .insert({
      name: `${label} ${new Date().toISOString()}`,
      owner_id: ownerId,
      manager_id: null,
    })
    .select("id")
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(`No se pudo crear portfolio QA export (${label}): ${created.error?.message ?? "sin id"}`);
  }
  return created.data.id;
}

async function insertTransactions(supabase, rows) {
  let insert = await supabase.from("transactions").insert(rows);
  if (insert.error && insert.error.message.toLowerCase().includes("operation_group_id")) {
    const fallbackRows = rows.map((row) => {
      const clone = { ...row };
      delete clone.operation_group_id;
      return clone;
    });
    insert = await supabase.from("transactions").insert(fallbackRows);
  }
  if (insert.error) {
    throw new Error(`No se pudieron insertar transacciones QA export: ${insert.error.message}`);
  }
}

async function seedPortfolioRows(supabase, portfolioId, roleKey) {
  const nowIso = new Date().toISOString();
  const basePositionId = `qa-export-${roleKey}-${randomUUID()}`;
  const operationGroupId = randomUUID();
  await insertTransactions(supabase, [
    {
      portfolio_id: portfolioId,
      type: "deposit",
      operation_group_id: operationGroupId,
      token_in_symbol: "USDC",
      token_in_amount: 100,
      token_out_symbol: null,
      token_out_amount: null,
      spot_price: 1,
      fee_amount: 0,
      notes: null,
      transaction_date: nowIso,
      protocol: "Wallet",
      position_id: `${basePositionId}-standard`,
      position_type: "Hold",
      metadata: null,
    },
    {
      portfolio_id: portfolioId,
      type: "deposit",
      operation_group_id: operationGroupId,
      token_in_symbol: "USDC",
      token_in_amount: 12.5,
      token_out_symbol: null,
      token_out_amount: null,
      spot_price: 1,
      fee_amount: 0,
      notes: JSON.stringify({ source: "harvest_reinvest" }),
      transaction_date: nowIso,
      protocol: "Wallet",
      position_id: `${basePositionId}-harvest`,
      position_type: "Hold",
      metadata: { source: "harvest_reinvest" },
    },
  ]);
}

function pickRoleProfiles(profiles, superadminId) {
  const manager =
    profiles.find((row) => row.role === "admin" && row.id !== superadminId) ??
    profiles.find((row) => row.role === "admin");
  const client = profiles.find((row) => row.role === "cliente");
  const autonomo =
    profiles.find((row) => row.role === "autonomo" && row.id !== superadminId) ??
    profiles.find((row) => row.role === "autonomo");

  if (!superadminId || !manager || !client || !autonomo) {
    throw new Error("No hay perfiles suficientes para matriz de exportaciones (superadmin/gestor/cliente/autonomo).");
  }

  return {
    superadmin: { userId: superadminId },
    gestor: { userId: manager.id },
    cliente: { userId: client.id },
    autonomo: { userId: autonomo.id },
  };
}

function getForeignByRole(roleKey, ownByRole) {
  const candidatesByRole = {
    superadmin: ["autonomo", "cliente", "gestor"],
    gestor: ["autonomo", "cliente", "superadmin"],
    cliente: ["autonomo", "gestor", "superadmin"],
    autonomo: ["cliente", "gestor", "superadmin"],
  };
  const candidates = candidatesByRole[roleKey] ?? [];
  for (const key of candidates) {
    const id = ownByRole[key];
    if (id && id !== ownByRole[roleKey]) return id;
  }
  return "";
}

async function runRoleChecks(roleKey, ownPortfolioId, foreignPortfolioId) {
  const results = [];
  const validStart = "2020-01-01";
  const validEnd = "2030-01-01";

  const missingPortfolio = await exportRequest({ startDate: validStart, endDate: validEnd });
  results.push({
    name: "missing_portfolio",
    pass: missingPortfolio.status === 400,
    status: missingPortfolio.status,
    expected: 400,
  });

  const missingDates = await exportRequest({ portfolioId: ownPortfolioId });
  results.push({
    name: "missing_dates",
    pass: missingDates.status === 400,
    status: missingDates.status,
    expected: 400,
  });

  const invalidDate = await exportRequest({
    portfolioId: ownPortfolioId,
    startDate: "2020/01/01",
    endDate: validEnd,
  });
  results.push({
    name: "invalid_date_format",
    pass: invalidDate.status === 400,
    status: invalidDate.status,
    expected: 400,
  });

  const reversedDates = await exportRequest({
    portfolioId: ownPortfolioId,
    startDate: "2030-01-02",
    endDate: "2030-01-01",
  });
  results.push({
    name: "reversed_dates",
    pass: reversedDates.status === 400,
    status: reversedDates.status,
    expected: 400,
  });

  const ownValid = await exportRequest({
    portfolioId: ownPortfolioId,
    startDate: validStart,
    endDate: validEnd,
  });
  const ownRows = Array.isArray(ownValid.json?.rows) ? ownValid.json.rows : [];
  const hasStandard = ownRows.some((row) => row.movement_origin === "Operación estándar");
  const hasHarvestReinvest = ownRows.some((row) => row.movement_origin === "Reinversión de harvest");
  results.push({
    name: "own_valid_export",
    pass: ownValid.status === 200 && ownRows.length >= 2 && hasStandard && hasHarvestReinvest,
    status: ownValid.status,
    expected: 200,
    rows: ownRows.length,
    hasStandard,
    hasHarvestReinvest,
  });

  if (foreignPortfolioId) {
    const foreign = await exportRequest({
      portfolioId: foreignPortfolioId,
      startDate: validStart,
      endDate: validEnd,
    });
    const expected = roleKey === "superadmin" ? 200 : 403;
    results.push({
      name: "foreign_access",
      pass: foreign.status === expected,
      status: foreign.status,
      expected,
    });
  }

  return {
    role: roleKey,
    pass: results.every((item) => item.pass),
    checks: results,
  };
}

async function deletePortfolios(supabase, portfolioIds) {
  if (portfolioIds.length === 0) return;
  const deleted = await supabase.from("portfolios").delete().in("id", portfolioIds);
  if (deleted.error) {
    throw new Error(`No se pudieron limpiar portfolios QA export: ${deleted.error.message}`);
  }
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
  const profilesQuery = await supabase.from("profiles").select("id, role");
  if (profilesQuery.error) {
    throw new Error(`No se pudieron leer profiles: ${profilesQuery.error.message}`);
  }

  const roleProfiles = pickRoleProfiles(profilesQuery.data ?? [], superadminId);
  const roleKeys = ["superadmin", "gestor", "cliente", "autonomo"];
  const createdPortfolioIds = [];
  const ownByRole = {};
  let server = null;

  try {
    for (const roleKey of roleKeys) {
      const ownerId = roleProfiles[roleKey].userId;
      const portfolioId = await createPortfolio(supabase, ownerId, `QA Export ${roleKey}`);
      createdPortfolioIds.push(portfolioId);
      ownByRole[roleKey] = portfolioId;
      await seedPortfolioRows(supabase, portfolioId, roleKey);
    }

    const summary = {
      baseUrl,
      roles: {},
      overallPass: true,
    };

    for (const roleKey of roleKeys) {
      const ownPortfolioId = ownByRole[roleKey];
      const foreignPortfolioId = getForeignByRole(roleKey, ownByRole);
      const roleEnv = {
        ...process.env,
        ...envFromFile,
        ENABLE_DEV_AUTH_FALLBACK: "true",
        DEV_VIEWER_USER_ID: roleProfiles[roleKey].userId,
      };

      server = await startServer(roleEnv);
      const roleResult = await runRoleChecks(roleKey, ownPortfolioId, foreignPortfolioId);
      summary.roles[roleKey] = {
        userId: roleProfiles[roleKey].userId,
        ownPortfolioId,
        foreignPortfolioId,
        ...roleResult,
      };
      summary.overallPass = summary.overallPass && roleResult.pass;
      await stopServer(server);
      server = null;
    }

    console.log("E2E_EXPORT_MATRIX_RESULT");
    console.log(JSON.stringify(summary, null, 2));

    if (!summary.overallPass) {
      throw new Error("La matriz E2E de exportaciones tiene fallos.");
    }
  } finally {
    if (server) {
      await stopServer(server);
    }
    try {
      await deletePortfolios(supabase, createdPortfolioIds);
      console.log("E2E_EXPORT_MATRIX_CLEANUP_OK", createdPortfolioIds);
    } catch (error) {
      console.error(
        "E2E_EXPORT_MATRIX_CLEANUP_WARNING",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

main().catch((error) => {
  console.error(`E2E_EXPORT_MATRIX_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
