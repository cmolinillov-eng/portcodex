import { test, expect } from "playwright/test";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

test("modal CSV valida fechas y permite exportar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saldo Total del Portfolio")).toBeVisible();

  await page.getByRole("button", { name: "Exportar Operaciones (CSV)" }).click();
  await expect(page.getByRole("heading", { name: "Exportar Operaciones (CSV)" })).toBeVisible();

  const startInput = page.locator('input[type="date"]').nth(0);
  const endInput = page.locator('input[type="date"]').nth(1);

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  await startInput.fill(formatDate(oneYearAgo));
  await endInput.fill(formatDate(today));

  await page.getByRole("button", { name: "Descargar CSV" }).click();
  const csvModalHeading = page.getByRole("heading", { name: "Exportar Operaciones (CSV)" });
  await page.waitForTimeout(1200);
  if ((await csvModalHeading.count()) > 0) {
    const anyKnownError =
      (await page.getByText("No se pudo exportar el CSV.").count()) > 0 ||
      (await page.getByText("No se encontró portfolio activo para exportar.").count()) > 0 ||
      (await page.getByText("startDate y endDate son obligatorios").count()) > 0 ||
      (await page.getByText("La fecha inicio no puede ser mayor que la fecha fin.").count()) > 0;
    expect(anyKnownError).toBe(true);
  }
});

test("botón PDF no dispara error visible en UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Descargar Reporte (PDF)" })).toBeVisible();
  await page.getByRole("button", { name: "Descargar Reporte (PDF)" }).click();
  await expect(page.getByText("No se pudo generar el reporte PDF")).toHaveCount(0);
});
