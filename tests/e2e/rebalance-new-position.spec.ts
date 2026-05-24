import { test, expect, type APIRequestContext } from "playwright/test";

function optionalEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

const ownPortfolioId = optionalEnv("E2E_OWN_PORTFOLIO_ID");
const hasEnv = ownPortfolioId.length > 0;

async function createSourcePosition(
  request: APIRequestContext,
  portfolioId: string,
  positionId: string,
) {
  return request.post("/api/transactions", {
    data: {
      operationType: "base_deposit",
      portfolioId,
      protocol: "Wallet",
      positionId,
      positionContextType: "Hold",
      tokenSymbol: "USDC",
      amount: 100,
    },
  });
}

async function deletePosition(
  request: APIRequestContext,
  portfolioId: string,
  positionId: string,
  protocol = "Wallet",
) {
  return request.post("/api/positions/delete", {
    data: { portfolioId, protocol, positionId },
  });
}

test.describe("Rebalanceo a nueva posición", () => {
  test.skip(!hasEnv, "Define E2E_OWN_PORTFOLIO_ID para ejecutar esta batería.");

  test("Rebalanceo a Hold nuevo: crea la posición destino con UUID generado", async ({ request }) => {
    const sourceId = `qa-reb-src-${Date.now()}`;

    // Setup: crear posición origen con 100 USDC
    const setup = await createSourcePosition(request, ownPortfolioId, sourceId);
    expect(setup.status()).toBe(200);

    // Rebalancear hacia una posición Hold nueva (USDC → BTC, precio manual)
    const res = await request.post("/api/transactions", {
      data: {
        operationType: "rebalance",
        portfolioId: ownPortfolioId,
        rebalanceSourcePositionId: sourceId,
        rebalanceSourceProtocol: "Wallet",
        rebalanceSourcePositionType: "Hold",
        rebalanceSourceTokenSymbol: "USDC",
        rebalanceSourceAmount: 100,
        rebalanceTargetIsNew: true,
        rebalanceTargetProtocol: "Wallet",
        rebalanceTargetPositionType: "Hold",
        rebalanceTargetTokenSymbol: "BTC",
        rebalanceTargetAmount: 0.0015,
        spotPricesBySymbol: { USDC: 1, BTC: 65000 },
      },
    });

    expect(res.status()).toBe(200);

    // Cleanup fuente
    await deletePosition(request, ownPortfolioId, sourceId);
  });

  test("Rebalanceo a Liquidity Pool nueva: acepta split 50/50 calculado", async ({ request }) => {
    const sourceId = `qa-reb-lp-src-${Date.now()}`;

    const setup = await createSourcePosition(request, ownPortfolioId, sourceId);
    expect(setup.status()).toBe(200);

    // Split 50/50: 100 USDC → 0.05 ETH + 50 USDC
    // ETH precio 1000 → 50 USD / 1000 = 0.05 ETH; USDC → 50 USD / 1 = 50 USDC
    const res = await request.post("/api/transactions", {
      data: {
        operationType: "rebalance",
        portfolioId: ownPortfolioId,
        rebalanceSourcePositionId: sourceId,
        rebalanceSourceProtocol: "Wallet",
        rebalanceSourcePositionType: "Hold",
        rebalanceSourceTokenSymbol: "USDC",
        rebalanceSourceAmount: 100,
        rebalanceTargetIsNew: true,
        rebalanceTargetProtocol: "Uniswap V3",
        rebalanceTargetPositionType: "Liquidity Pool",
        rebalanceTargetTokenSymbol: "ETH",
        rebalanceTargetAmount: 0.05,
        rebalanceTargetLpTokenSymbolB: "USDC",
        rebalanceTargetLpAmountB: 50,
        lpRangeLower: 800,
        lpRangeUpper: 1200,
        spotPricesBySymbol: { USDC: 1, ETH: 1000 },
      },
    });

    expect(res.status()).toBe(200);

    await deletePosition(request, ownPortfolioId, sourceId);
  });

  test("Rebalanceo a nueva posición: falla si no se indica protocolo destino", async ({ request }) => {
    const sourceId = `qa-reb-noproto-${Date.now()}`;
    const setup = await createSourcePosition(request, ownPortfolioId, sourceId);
    expect(setup.status()).toBe(200);

    const res = await request.post("/api/transactions", {
      data: {
        operationType: "rebalance",
        portfolioId: ownPortfolioId,
        rebalanceSourcePositionId: sourceId,
        rebalanceSourceProtocol: "Wallet",
        rebalanceSourcePositionType: "Hold",
        rebalanceSourceTokenSymbol: "USDC",
        rebalanceSourceAmount: 100,
        rebalanceTargetIsNew: true,
        rebalanceTargetProtocol: "",  // vacío → debe fallar
        rebalanceTargetPositionType: "Hold",
        rebalanceTargetTokenSymbol: "BTC",
        rebalanceTargetAmount: 0.0015,
        spotPricesBySymbol: { USDC: 1, BTC: 65000 },
      },
    });

    expect(res.status()).toBe(400);

    await deletePosition(request, ownPortfolioId, sourceId);
  });
});
