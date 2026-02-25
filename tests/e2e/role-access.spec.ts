import { test, expect, type APIRequestContext } from "playwright/test";

type ExpectedRole = "superadmin" | "gestor" | "cliente" | "autonomo";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Falta variable de entorno requerida para E2E: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

const roleRaw = optionalEnv("E2E_EXPECTED_ROLE");
const hasRoleEnv = roleRaw.length > 0;
const expectedRole = (roleRaw || "autonomo") as ExpectedRole;

async function postDelete(
  request: APIRequestContext,
  portfolioId: string,
  positionId = "qa-e2e-no-row",
  protocol = "Wallet",
) {
  return request.post("/api/positions/delete", {
    data: {
      portfolioId,
      protocol,
      positionId,
    },
  });
}

async function postTransaction(
  request: APIRequestContext,
  portfolioId: string,
  protocol = "Wallet",
  positionId = `qa-e2e-tx-${Date.now()}`,
) {
  return request.post("/api/transactions", {
    data: {
      operationType: "base_deposit",
      portfolioId,
      protocol,
      positionId,
      positionContextType: "Hold",
      tokenSymbol: "USDC",
      amount: 1,
    },
  });
}

async function getTransactionsExport(request: APIRequestContext, portfolioId: string) {
  const query = new URLSearchParams({
    portfolioId,
    startDate: "2020-01-01",
    endDate: "2030-01-01",
  });
  return request.get(`/api/transactions/export?${query.toString()}`);
}

test.describe(`QA roles (${expectedRole})`, () => {
  test.skip(!hasRoleEnv, "Define E2E_EXPECTED_ROLE para ejecutar esta batería.");

  test("rutas principales respetan permisos del rol", async ({ page }) => {
    await page.goto("/");

    if (expectedRole === "superadmin") {
      await page.waitForURL("**/admin", { timeout: 15_000 });
      await expect(page.getByText("Panel de Administrador")).toBeVisible();
    } else if (expectedRole === "gestor") {
      await page.waitForURL("**/manager", { timeout: 15_000 });
      await expect(page.getByText("Panel de Gestor")).toBeVisible();
    } else {
      await page.waitForURL("**/", { timeout: 15_000 });
      await expect(page.getByText("Saldo Total del Portfolio")).toBeVisible();
    }

    await page.goto("/admin");
    if (expectedRole === "superadmin") {
      await page.waitForURL("**/admin", { timeout: 15_000 });
      await expect(page.getByText("Panel de Administrador")).toBeVisible();
    } else {
      await page.waitForURL("**/", { timeout: 15_000 });
      await expect(page.getByText("Panel de Administrador")).toHaveCount(0);
    }

    await page.goto("/manager");
    if (expectedRole === "gestor") {
      await page.waitForURL("**/manager", { timeout: 15_000 });
      await expect(page.getByText("Panel de Gestor")).toBeVisible();
    } else if (expectedRole === "superadmin") {
      await page.waitForURL("**/admin", { timeout: 15_000 });
      await expect(page.getByText("Panel de Administrador")).toBeVisible();
    } else {
      await page.waitForURL("**/", { timeout: 15_000 });
      await expect(page.getByText("Panel de Gestor")).toHaveCount(0);
    }
  });

  test("API de borrado de posiciones aplica control de acceso por rol", async ({ request }) => {
    const ownPortfolioId = requiredEnv("E2E_OWN_PORTFOLIO_ID");
    const assignedPortfolioId = optionalEnv("E2E_ASSIGNED_PORTFOLIO_ID");
    const foreignPortfolioId = optionalEnv("E2E_FOREIGN_PORTFOLIO_ID");

    if (expectedRole === "superadmin") {
      const response = await postDelete(request, ownPortfolioId);
      expect(response.status()).toBe(200);
      return;
    }

    if (expectedRole === "gestor") {
      const assignedId = assignedPortfolioId || ownPortfolioId;
      const allowed = await postDelete(request, assignedId);
      expect(allowed.status()).toBe(200);

      if (foreignPortfolioId) {
        const blocked = await postDelete(request, foreignPortfolioId);
        expect(blocked.status()).toBe(403);
      }
      return;
    }

    if (expectedRole === "cliente") {
      const blocked = await postDelete(request, ownPortfolioId);
      expect(blocked.status()).toBe(403);
      return;
    }

    const allowed = await postDelete(request, ownPortfolioId);
    expect(allowed.status()).toBe(200);
    if (foreignPortfolioId) {
      const blocked = await postDelete(request, foreignPortfolioId);
      expect(blocked.status()).toBe(403);
    }
  });

  test("API de transacciones aplica permisos de operación por rol", async ({ request }) => {
    const ownPortfolioId = requiredEnv("E2E_OWN_PORTFOLIO_ID");
    const assignedPortfolioId = optionalEnv("E2E_ASSIGNED_PORTFOLIO_ID");
    const foreignPortfolioId = optionalEnv("E2E_FOREIGN_PORTFOLIO_ID");

    if (expectedRole === "superadmin") {
      const ownPositionId = `qa-e2e-super-own-${Date.now()}`;
      const own = await postTransaction(request, ownPortfolioId, "Wallet", ownPositionId);
      expect(own.status()).toBe(200);
      const ownCleanup = await postDelete(request, ownPortfolioId, ownPositionId, "Wallet");
      expect(ownCleanup.status()).toBe(200);
      if (foreignPortfolioId) {
        const foreignPositionId = `qa-e2e-super-foreign-${Date.now()}`;
        const foreign = await postTransaction(
          request,
          foreignPortfolioId,
          "Wallet",
          foreignPositionId,
        );
        expect(foreign.status()).toBe(200);
        const foreignCleanup = await postDelete(request, foreignPortfolioId, foreignPositionId, "Wallet");
        expect(foreignCleanup.status()).toBe(200);
      }
      return;
    }

    if (expectedRole === "gestor") {
      const assignedId = assignedPortfolioId || ownPortfolioId;
      const allowedPositionId = `qa-e2e-manager-own-${Date.now()}`;
      const allowed = await postTransaction(request, assignedId, "Wallet", allowedPositionId);
      expect(allowed.status()).toBe(200);
      const allowedCleanup = await postDelete(request, assignedId, allowedPositionId, "Wallet");
      expect(allowedCleanup.status()).toBe(200);
      if (foreignPortfolioId) {
        const blocked = await postTransaction(
          request,
          foreignPortfolioId,
          "Wallet",
          `qa-e2e-manager-foreign-${Date.now()}`,
        );
        expect(blocked.status()).toBe(403);
      }
      return;
    }

    if (expectedRole === "cliente") {
      const blocked = await postTransaction(request, ownPortfolioId, "Wallet", `qa-e2e-client-${Date.now()}`);
      expect(blocked.status()).toBe(403);
      return;
    }

    const allowedPositionId = `qa-e2e-auto-own-${Date.now()}`;
    const allowed = await postTransaction(request, ownPortfolioId, "Wallet", allowedPositionId);
    expect(allowed.status()).toBe(200);
    const allowedCleanup = await postDelete(request, ownPortfolioId, allowedPositionId, "Wallet");
    expect(allowedCleanup.status()).toBe(200);
    if (foreignPortfolioId) {
      const blocked = await postTransaction(
        request,
        foreignPortfolioId,
        "Wallet",
        `qa-e2e-auto-foreign-${Date.now()}`,
      );
      expect(blocked.status()).toBe(403);
    }
  });

  test("API de exportación CSV respeta acceso de lectura por rol", async ({ request }) => {
    const ownPortfolioId = requiredEnv("E2E_OWN_PORTFOLIO_ID");
    const assignedPortfolioId = optionalEnv("E2E_ASSIGNED_PORTFOLIO_ID");
    const foreignPortfolioId = optionalEnv("E2E_FOREIGN_PORTFOLIO_ID");

    if (expectedRole === "superadmin") {
      const own = await getTransactionsExport(request, ownPortfolioId);
      expect(own.status()).toBe(200);
      if (foreignPortfolioId) {
        const foreign = await getTransactionsExport(request, foreignPortfolioId);
        expect(foreign.status()).toBe(200);
      }
      return;
    }

    if (expectedRole === "gestor") {
      const assignedId = assignedPortfolioId || ownPortfolioId;
      const allowed = await getTransactionsExport(request, assignedId);
      expect(allowed.status()).toBe(200);
      if (foreignPortfolioId) {
        const blocked = await getTransactionsExport(request, foreignPortfolioId);
        expect(blocked.status()).toBe(403);
      }
      return;
    }

    const own = await getTransactionsExport(request, ownPortfolioId);
    expect(own.status()).toBe(200);
    if (foreignPortfolioId) {
      const blocked = await getTransactionsExport(request, foreignPortfolioId);
      expect(blocked.status()).toBe(403);
    }
  });

  test("API de administración de usuarios solo disponible para superadmin", async ({ request }) => {
    const response = await request.get("/api/admin/users");
    if (expectedRole === "superadmin") {
      expect(response.status()).toBe(200);
    } else {
      expect(response.status()).toBe(403);
    }
  });

  test("navegación de portfolios gestionados respeta límites por rol", async ({ page }) => {
    const managerUserId = optionalEnv("E2E_MANAGER_USER_ID");
    const managerAssignedPortfolioId = optionalEnv("E2E_MANAGER_ASSIGNED_PORTFOLIO_ID");
    const managerForeignPortfolioId = optionalEnv("E2E_MANAGER_FOREIGN_PORTFOLIO_ID");
    if (!managerUserId || !managerAssignedPortfolioId) {
      test.skip();
      return;
    }

    if (expectedRole === "superadmin") {
      await page.goto(`/admin/managers/${managerUserId}`);
      await page.waitForURL(`**/admin/managers/${managerUserId}`, { timeout: 15_000 });
      await expect(page.getByText("Panel de Gestor")).toBeVisible();

      await page.goto(`/admin/managers/${managerUserId}/portfolios/${managerAssignedPortfolioId}`);
      await page.waitForURL(`**/admin/managers/${managerUserId}/portfolios/${managerAssignedPortfolioId}`, {
        timeout: 15_000,
      });
      await expect(page.getByText("Volver al gestor")).toBeVisible();

      if (managerForeignPortfolioId) {
        await page.goto(`/admin/managers/${managerUserId}/portfolios/${managerForeignPortfolioId}`);
        await page.waitForURL(`**/admin/managers/${managerUserId}`, { timeout: 15_000 });
      }
      return;
    }

    if (expectedRole === "gestor") {
      await page.goto(`/manager/portfolios/${managerAssignedPortfolioId}`);
      await page.waitForURL(`**/manager/portfolios/${managerAssignedPortfolioId}`, { timeout: 15_000 });
      await expect(page.getByText("Volver a Gestor")).toBeVisible();

      if (managerForeignPortfolioId) {
        await page.goto(`/manager/portfolios/${managerForeignPortfolioId}`);
        await page.waitForURL("**/manager", { timeout: 15_000 });
      }
      return;
    }

    await page.goto(`/manager/portfolios/${managerAssignedPortfolioId}`);
    await page.waitForURL("**/", { timeout: 15_000 });
  });
});
