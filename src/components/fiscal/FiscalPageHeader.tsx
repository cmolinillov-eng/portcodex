export function FiscalPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-7 py-6">
      <div>
        <h1 className="font-[var(--font-designer)] text-2xl font-bold tracking-tight text-[var(--foreground)]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
