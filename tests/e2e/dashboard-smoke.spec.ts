import { test, expect } from "playwright/test";

test("dashboard renderiza estructura principal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saldo Total del Portfolio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva Operación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar Reporte (PDF)" })).toBeVisible();
});
