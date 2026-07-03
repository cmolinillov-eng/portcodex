import type { AeatTone } from "@/lib/tax/aeat-mapping";

const TONE_CLASS: Record<AeatTone, string> = {
  gain_savings: "border-[rgba(111,174,143,0.40)] bg-[rgba(111,174,143,0.12)] text-emerald-300",
  gain_general: "border-[rgba(201,164,94,0.40)] bg-[rgba(201,164,94,0.12)] text-amber-300",
  loss: "border-[rgba(206,139,130,0.40)] bg-[rgba(206,139,130,0.12)] text-rose-300",
  rcm: "border-[rgba(167,155,224,0.40)] bg-[rgba(167,155,224,0.12)] text-[#CEC8F0]",
  work: "border-[rgba(111,174,143,0.40)] bg-[rgba(111,174,143,0.12)] text-[#6FAE8F]",
  isyd: "border-[rgba(129,140,248,0.40)] bg-[rgba(129,140,248,0.12)] text-indigo-300",
  neutral: "border-[var(--line)] bg-white/[0.03] text-[var(--muted)]",
};

export function FiscalBadge({ tone, label }: { tone: AeatTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
