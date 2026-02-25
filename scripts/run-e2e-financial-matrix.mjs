import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const webDir = rootDir;
const envPath = path.join(webDir, ".env.local");
const port = 3200;
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseObject(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return true;
    } catch {
      // noop
    }
    await sleep(400);
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
      ? "No se pudo iniciar servidor QA (lock de .next/dev). Cierra cualquier `npm run dev` y reintenta."
      : "No se pudo iniciar servidor QA a tiempo.";
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

async function postJson(route, payload) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
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

function isHarvestReinvest(metadata, notes) {
  const parsed = parseObject(metadata) ?? parseObject(notes) ?? {};
  const source = typeof parsed.source === "string" ? parsed.source : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  return source === "harvest_reinvest" || reason === "harvest_reinvest";
}

function healthStatus(healthFactor) {
  if (!Number.isFinite(healthFactor)) return "na";
  if (healthFactor < 1.5) return "critical";
  if (healthFactor <= 2.2) return "warning";
  return "safe";
}

async function getQaUserId(supabase, envFromFile) {
  const preferred = (envFromFile.DEV_VIEWER_USER_ID ?? "").trim();
  if (preferred) {
    const profile = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", preferred)
      .maybeSingle();
    if (!profile.error && profile.data && profile.data.role !== "cliente") {
      return preferred;
    }
  }

  const superadminId = (envFromFile.SUPERADMIN_USER_ID ?? "").trim();
  const profiles = await supabase
    .from("profiles")
    .select("id, role")
    .order("created_at", { ascending: false });
  if (profiles.error) {
    throw new Error(`No se pudo consultar profiles: ${profiles.error.message}`);
  }

  const candidate =
    (profiles.data ?? []).find((row) => row.role === "autonomo" && row.id !== superadminId) ??
    (profiles.data ?? []).find((row) => row.role === "admin" && row.id !== superadminId);

  if (!candidate?.id) {
    throw new Error("No hay un usuario con permisos de operación para ejecutar QA financiero.");
  }
  return candidate.id;
}

async function fetchPrices(supabase) {
  const query = await supabase.from("cached_prices").select("token_symbol, price, last_updated");
  if (query.error) {
    throw new Error(`No se pudieron leer precios cacheados: ${query.error.message}`);
  }
  return new Map(
    (query.data ?? []).map((row) => [String(row.token_symbol ?? "").toUpperCase(), toNumber(row.price)]),
  );
}

async function createPortfolio(supabase, ownerId, label) {
  const created = await supabase
    .from("portfolios")
    .insert({
      name: `${label} ${new Date().toISOString()}`,
      owner_id: ownerId,
      manager_id: null,
    })
    .select("id, name")
    .single();
  if (created.error || !created.data?.id) {
    throw new Error(`No se pudo crear portfolio QA (${label}): ${created.error?.message ?? "sin id"}`);
  }
  return created.data.id;
}

async function deletePortfolios(supabase, ids) {
  if (ids.length === 0) return;
  const cleanup = await supabase.from("portfolios").delete().in("id", ids);
  if (cleanup.error) {
    throw new Error(`No se pudieron limpiar portfolios QA: ${cleanup.error.message}`);
  }
}

async function runRebalanceScenario({ supabase, portfolioId }) {
  const sourcePositionId = `qa-hold-eth-${randomUUID()}`;
  const targetPositionId = `qa-hold-sol-${randomUUID()}`;

  const seedResponse = await postJson("/api/transactions", {
    operationType: "base_deposit",
    portfolioId,
    protocol: "Wallet",
    positionId: sourcePositionId,
    positionContextType: "Hold",
    tokenSymbol: "ETH",
    amount: 1,
  });

  const rebalanceResponse = await postJson("/api/transactions", {
    operationType: "rebalance",
    portfolioId,
    rebalanceSourcePositionId: sourcePositionId,
    rebalanceSourceProtocol: "Wallet",
    rebalanceSourcePositionType: "Hold",
    rebalanceSourceTokenSymbol: "ETH",
    rebalanceSourceAmount: 0.4,
    rebalanceTargetPositionId: targetPositionId,
    rebalanceTargetProtocol: "Wallet",
    rebalanceTargetPositionType: "Hold",
    rebalanceTargetTokenSymbol: "SOL",
  });

  const txQuery = await supabase
    .from("transactions")
    .select("id, type, token_in_amount, token_out_amount, spot_price, metadata, notes, operation_group_id")
    .eq("portfolio_id", portfolioId)
    .order("transaction_date", { ascending: true });
  if (txQuery.error) {
    throw new Error(`No se pudieron leer transacciones QA rebalance: ${txQuery.error.message}`);
  }

  const rows = txQuery.data ?? [];
  const rebalanceRows = rows.filter((row) => {
    const parsed = parseObject(row.metadata) ?? parseObject(row.notes) ?? {};
    const source = typeof parsed.source === "string" ? parsed.source : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return source === "rebalance_transfer" || reason === "rebalance_transfer";
  });
  const outRows = rebalanceRows.filter((row) => String(row.type).includes("withdraw") || row.type === "withdrawal");
  const inRows = rebalanceRows.filter((row) => !outRows.includes(row));
  const usdOut = outRows.reduce((sum, row) => sum + toNumber(row.token_out_amount) * toNumber(row.spot_price), 0);
  const usdIn = inRows.reduce((sum, row) => sum + toNumber(row.token_in_amount) * toNumber(row.spot_price), 0);
  const groupIds = Array.from(new Set(rebalanceRows.map((row) => row.operation_group_id).filter(Boolean)));
  const missingGroup = rebalanceRows.filter((row) => !row.operation_group_id).length;

  const pass =
    seedResponse.status === 200 &&
    rebalanceResponse.status === 200 &&
    rebalanceRows.length === 2 &&
    outRows.length === 1 &&
    inRows.length === 1 &&
    Math.abs(usdOut - usdIn) <= 0.01 &&
    groupIds.length === 1 &&
    missingGroup === 0;

  return {
    pass,
    seedApiStatus: seedResponse.status,
    rebalanceApiStatus: rebalanceResponse.status,
    rebalanceRows: rebalanceRows.length,
    usdOut,
    usdIn,
    usdDelta: Math.abs(usdOut - usdIn),
    operationGroupIds: groupIds,
    missingOperationGroupRows: missingGroup,
  };
}

async function runHarvestCrossScenario({ supabase, portfolioId }) {
  const sourceLpPositionId = `qa-lp-src-${randomUUID()}`;
  const holdTargetId = `qa-hold-dst-${randomUUID()}`;
  const stakingTargetId = `qa-staking-dst-${randomUUID()}`;
  const lendingTargetId = `qa-lending-dst-${randomUUID()}`;

  const seedLp = await postJson("/api/transactions", {
    operationType: "base_deposit",
    portfolioId,
    protocol: "UniswapV3",
    positionId: sourceLpPositionId,
    positionContextType: "Liquidity Pool",
    tokenSymbol: "ETH",
    amount: 0.5,
    lpTokenSymbolB: "USDC",
    lpAmountB: 500,
    lpRangeLower: 1700,
    lpRangeUpper: 5100,
  });

  const scenarios = [
    {
      name: "lp_to_hold",
      payload: {
        operationType: "harvest",
        portfolioId,
        protocol: "UniswapV3",
        positionId: sourceLpPositionId,
        positionContextType: "Liquidity Pool",
        tokenSymbol: "USDC",
        amount: 30,
        harvestSourcePositionId: sourceLpPositionId,
        harvestSourceProtocol: "UniswapV3",
        harvestTargetPositionId: holdTargetId,
        harvestTargetProtocol: "Wallet",
        harvestTargetPositionType: "Hold",
        harvestTargetTokenSymbol: "SOL",
      },
    },
    {
      name: "lp_to_staking",
      payload: {
        operationType: "harvest",
        portfolioId,
        protocol: "UniswapV3",
        positionId: sourceLpPositionId,
        positionContextType: "Liquidity Pool",
        tokenSymbol: "USDC",
        amount: 25,
        harvestSourcePositionId: sourceLpPositionId,
        harvestSourceProtocol: "UniswapV3",
        harvestTargetPositionId: stakingTargetId,
        harvestTargetProtocol: "Phantom",
        harvestTargetPositionType: "Staking",
        harvestTargetTokenSymbol: "SOL",
      },
    },
    {
      name: "lp_to_lending",
      payload: {
        operationType: "harvest",
        portfolioId,
        protocol: "UniswapV3",
        positionId: sourceLpPositionId,
        positionContextType: "Liquidity Pool",
        tokenSymbol: "USDC",
        amount: 40,
        harvestSourcePositionId: sourceLpPositionId,
        harvestSourceProtocol: "UniswapV3",
        harvestTargetPositionId: lendingTargetId,
        harvestTargetProtocol: "Aave",
        harvestTargetPositionType: "Lending",
        harvestTargetLendingMode: "collateral",
        harvestTargetCollateralToken: "USDC",
      },
    },
  ];

  const apiResults = [];
  for (const scenario of scenarios) {
    const response = await postJson("/api/transactions", scenario.payload);
    apiResults.push({
      name: scenario.name,
      status: response.status,
      inserted: response.json?.inserted ?? null,
    });
  }

  const txQuery = await supabase
    .from("transactions")
    .select("id, type, token_in_amount, token_out_amount, spot_price, metadata, notes, operation_group_id")
    .eq("portfolio_id", portfolioId)
    .order("transaction_date", { ascending: true });
  if (txQuery.error) {
    throw new Error(`No se pudieron leer transacciones QA harvest: ${txQuery.error.message}`);
  }

  const rows = txQuery.data ?? [];
  const byGroup = rows.reduce((acc, row) => {
    const key = row.operation_group_id || `ungrouped-${row.id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const groupsWithHarvest = Object.values(byGroup).filter((groupRows) =>
    groupRows.some((row) => row.type === "harvest"),
  );

  const groupChecks = groupsWithHarvest.map((groupRows) => {
    const harvestRow = groupRows.find((row) => row.type === "harvest");
    const withdrawRows = groupRows.filter(
      (row) => row.type === "withdrawal" && isHarvestReinvest(row.metadata, row.notes),
    );
    const reinvestRows = groupRows.filter((row) => row.type !== "harvest" && row.type !== "withdrawal");

    const harvestUsd = harvestRow
      ? toNumber(harvestRow.token_in_amount) * toNumber(harvestRow.spot_price)
      : 0;
    const withdrawUsd = withdrawRows.reduce(
      (sum, row) => sum + toNumber(row.token_out_amount) * toNumber(row.spot_price),
      0,
    );
    const reinvestUsd = reinvestRows.reduce(
      (sum, row) => sum + toNumber(row.token_in_amount) * toNumber(row.spot_price),
      0,
    );

    return {
      groupId: harvestRow?.operation_group_id ?? null,
      rows: groupRows.length,
      hasSingleHarvest: groupRows.filter((row) => row.type === "harvest").length === 1,
      hasWithdrawReinvest: withdrawRows.length >= 1,
      reinvestCount: reinvestRows.length,
      harvestUsd,
      withdrawUsd,
      reinvestUsd,
      deltaHarvestWithdraw: Math.abs(harvestUsd - withdrawUsd),
      deltaHarvestReinvest: Math.abs(harvestUsd - reinvestUsd),
      missingOperationGroup: groupRows.some((row) => !row.operation_group_id),
    };
  });

  const seedUsd = rows
    .filter((row) => row.type === "lp_deposit" && !isHarvestReinvest(row.metadata, row.notes))
    .reduce((sum, row) => sum + toNumber(row.token_in_amount) * toNumber(row.spot_price), 0);

  const capitalIn = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
  const capitalOut = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
  let totalDepositedUsd = 0;
  for (const row of rows) {
    const type = String(row.type ?? "");
    const harvestReinvest = isHarvestReinvest(row.metadata, row.notes);
    if (capitalIn.has(type) && !harvestReinvest) {
      totalDepositedUsd += toNumber(row.token_in_amount) * toNumber(row.spot_price);
    }
    if (capitalOut.has(type) && !harvestReinvest) {
      totalDepositedUsd -= toNumber(row.token_out_amount) * toNumber(row.spot_price);
    }
  }

  const apiPass = seedLp.status === 200 && apiResults.every((result) => result.status === 200 && result.inserted === 3);
  const groupsPass =
    groupsWithHarvest.length === 3 &&
    groupChecks.every(
      (check) =>
        check.rows === 3 &&
        check.hasSingleHarvest &&
        check.hasWithdrawReinvest &&
        check.reinvestCount === 1 &&
        check.deltaHarvestWithdraw <= 0.01 &&
        check.deltaHarvestReinvest <= 0.01 &&
        !check.missingOperationGroup,
    );
  const depositedPass = Math.abs(totalDepositedUsd - seedUsd) <= 0.01;

  return {
    pass: apiPass && groupsPass && depositedPass,
    seedLpApiStatus: seedLp.status,
    apiResults,
    harvestGroupCount: groupsWithHarvest.length,
    groupChecks,
    totalDepositedUsd,
    seedUsd,
    depositedMatchesSeed: depositedPass,
  };
}

async function runLpRangeScenario({ supabase, portfolioId, pricesBySymbol }) {
  const positionId = `qa-lp-range-${randomUUID()}`;

  const createResponse = await postJson("/api/transactions", {
    operationType: "base_deposit",
    portfolioId,
    protocol: "UniswapV3",
    positionId,
    positionContextType: "Liquidity Pool",
    tokenSymbol: "ETH",
    amount: 0.25,
    lpTokenSymbolB: "USDC",
    lpAmountB: 250,
    lpRangeLower: 100,
    lpRangeUpper: 200,
  });

  const txQuery = await supabase
    .from("transactions")
    .select("metadata, notes, transaction_date")
    .eq("portfolio_id", portfolioId)
    .eq("position_id", positionId)
    .eq("type", "lp_deposit")
    .order("transaction_date", { ascending: false })
    .limit(1);
  if (txQuery.error) {
    throw new Error(`No se pudo leer metadata LP QA: ${txQuery.error.message}`);
  }

  const row = txQuery.data?.[0] ?? null;
  const parsed = parseObject(row?.metadata) ?? parseObject(row?.notes) ?? {};
  const lp = parsed.lp ?? {};
  const lower = toNumber(lp.rangeLower);
  const upper = toNumber(lp.rangeUpper);
  const ratio = (pricesBySymbol.get("ETH") ?? 0) / (pricesBySymbol.get("USDC") ?? 1);
  const outOfRange = ratio < lower || ratio > upper;

  const pass = createResponse.status === 200 && outOfRange;
  return {
    pass,
    createApiStatus: createResponse.status,
    ratio,
    range: [lower, upper],
    outOfRange,
  };
}

async function runHealthFactorScenario({ supabase, portfolioId, pricesBySymbol }) {
  const scenarios = [
    { key: "critical", collateral: 140, debt: 100, expected: "critical" },
    { key: "warning", collateral: 180, debt: 100, expected: "warning" },
    { key: "safe", collateral: 250, debt: 100, expected: "safe" },
  ];

  const apiResults = [];
  const positionIds = [];
  for (const scenario of scenarios) {
    const positionId = `qa-hf-${scenario.key}-${randomUUID()}`;
    positionIds.push(positionId);
    const response = await postJson("/api/transactions", {
      operationType: "base_deposit",
      portfolioId,
      protocol: "Aave",
      positionId,
      positionContextType: "Lending",
      baseDepositLendingMode: "both",
      lendingCollateralToken: "USDC",
      lendingCollateralAmount: scenario.collateral,
      lendingDebtToken: "USDC",
      lendingDebtAmount: scenario.debt,
    });
    apiResults.push({
      key: scenario.key,
      expected: scenario.expected,
      status: response.status,
      inserted: response.json?.inserted ?? null,
      positionId,
    });
  }

  const txQuery = await supabase
    .from("transactions")
    .select("position_id, type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price")
    .eq("portfolio_id", portfolioId)
    .in("position_id", positionIds)
    .in("type", ["lending_supply", "lending_borrow", "lending_withdraw", "withdrawal"]);
  if (txQuery.error) {
    throw new Error(`No se pudieron leer transacciones HF QA: ${txQuery.error.message}`);
  }

  const byPosition = new Map();
  for (const row of txQuery.data ?? []) {
    const key = row.position_id;
    if (!key) continue;
    if (!byPosition.has(key)) {
      byPosition.set(key, { collateralUsd: 0, debtUsd: 0 });
    }
    const agg = byPosition.get(key);
    const type = String(row.type ?? "");
    const inSymbol = String(row.token_in_symbol ?? "").toUpperCase();
    const outSymbol = String(row.token_out_symbol ?? "").toUpperCase();
    const inAmount = toNumber(row.token_in_amount);
    const outAmount = toNumber(row.token_out_amount);
    const inPrice = pricesBySymbol.get(inSymbol) ?? toNumber(row.spot_price);
    const outPrice = pricesBySymbol.get(outSymbol) ?? toNumber(row.spot_price);

    if (type === "lending_supply") {
      if (inSymbol) agg.collateralUsd += inAmount * inPrice;
      if (outSymbol) agg.collateralUsd -= outAmount * outPrice;
    }
    if (type === "lending_borrow") {
      if (inSymbol) agg.debtUsd += inAmount * inPrice;
      if (outSymbol) agg.debtUsd -= outAmount * outPrice;
    }
    if (type === "lending_withdraw" || type === "withdrawal") {
      if (outSymbol) agg.collateralUsd -= outAmount * outPrice;
      if (inSymbol) agg.collateralUsd += inAmount * inPrice;
    }
  }

  const computed = apiResults.map((result) => {
    const row = byPosition.get(result.positionId) ?? { collateralUsd: 0, debtUsd: 0 };
    const hf = row.debtUsd > 0 ? row.collateralUsd / row.debtUsd : NaN;
    return {
      key: result.key,
      expected: result.expected,
      status: healthStatus(hf),
      healthFactor: hf,
      collateralUsd: row.collateralUsd,
      debtUsd: row.debtUsd,
    };
  });

  const apiPass = apiResults.every((result) => result.status === 200 && result.inserted === 2);
  const computedPass = computed.every((row) => row.status === row.expected);

  return {
    pass: apiPass && computedPass,
    apiResults,
    computed,
  };
}

async function main() {
  const envFromFile = loadEnvFile(envPath);
  const supabaseUrl = envFromFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = envFromFile.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const qaUserId = await getQaUserId(supabase, envFromFile);
  const serverEnv = {
    ...process.env,
    ...envFromFile,
    ENABLE_DEV_AUTH_FALLBACK: "true",
    DEV_VIEWER_USER_ID: qaUserId,
  };

  const createdPortfolioIds = [];
  let server = null;

  try {
    server = await startServer(serverEnv);

    const refreshResponse = await postJson("/api/prices/refresh", {});
    const pricesBySymbol = await fetchPrices(supabase);
    if ((pricesBySymbol.get("ETH") ?? 0) <= 0 || (pricesBySymbol.get("USDC") ?? 0) <= 0) {
      throw new Error("Precios insuficientes para QA financiero (ETH/USDC).");
    }

    const rebalancePortfolioId = await createPortfolio(supabase, qaUserId, "QA Rebalance");
    createdPortfolioIds.push(rebalancePortfolioId);
    const harvestPortfolioId = await createPortfolio(supabase, qaUserId, "QA Harvest Cross");
    createdPortfolioIds.push(harvestPortfolioId);
    const lpRangePortfolioId = await createPortfolio(supabase, qaUserId, "QA LP OutRange");
    createdPortfolioIds.push(lpRangePortfolioId);
    const hfPortfolioId = await createPortfolio(supabase, qaUserId, "QA HF Threshold");
    createdPortfolioIds.push(hfPortfolioId);

    const rebalance = await runRebalanceScenario({
      supabase,
      portfolioId: rebalancePortfolioId,
    });
    const harvestCross = await runHarvestCrossScenario({
      supabase,
      portfolioId: harvestPortfolioId,
    });
    const lpRange = await runLpRangeScenario({
      supabase,
      portfolioId: lpRangePortfolioId,
      pricesBySymbol,
    });
    const healthFactor = await runHealthFactorScenario({
      supabase,
      portfolioId: hfPortfolioId,
      pricesBySymbol,
    });

    const summary = {
      refresh: {
        status: refreshResponse.status,
        body: refreshResponse.json ?? refreshResponse.text,
      },
      qaUserId,
      scenarios: {
        rebalance,
        harvestCross,
        lpRange,
        healthFactor,
      },
      overallPass: rebalance.pass && harvestCross.pass && lpRange.pass && healthFactor.pass,
    };

    console.log("E2E_FINANCIAL_MATRIX_RESULT");
    console.log(JSON.stringify(summary, null, 2));

    if (!summary.overallPass) {
      throw new Error("La matriz financiera tiene fallos.");
    }
  } finally {
    if (server) {
      await stopServer(server);
    }
    try {
      await deletePortfolios(supabase, createdPortfolioIds);
      console.log("E2E_FINANCIAL_CLEANUP_OK", createdPortfolioIds);
    } catch (error) {
      console.error(
        "E2E_FINANCIAL_CLEANUP_WARNING",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

main().catch((error) => {
  console.error(`E2E_FINANCIAL_MATRIX_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
