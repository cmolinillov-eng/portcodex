const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEur(n: number): string {
  return EUR.format(Number.isFinite(n) ? n : 0);
}

const DATE = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" });

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return DATE.format(new Date(t));
}

export function formatAmount(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  if (Math.abs(n) < 1) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return n.toLocaleString("es-ES", { maximumFractionDigits: 4 });
}
