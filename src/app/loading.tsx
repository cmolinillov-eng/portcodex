export default function Loading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="bg-orb -top-20 -left-20 h-72 w-72 bg-[rgba(255,122,26,0.18)]" />
      <div className="bg-orb top-28 right-0 h-80 w-80 bg-[rgba(255,122,26,0.13)]" />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 md:px-10 md:py-10">
        <header className="card-premium rounded-3xl p-6 md:p-8">
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Cargando datos en vivo...</h1>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-soft)]" />
          </div>
        </header>

        <section className="card-premium rounded-3xl p-6 md:p-8">
          <div className="space-y-3">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[rgba(255,255,255,0.09)]" />
            <div className="h-4 w-full animate-pulse rounded bg-[rgba(255,255,255,0.07)]" />
            <div className="h-4 w-full animate-pulse rounded bg-[rgba(255,255,255,0.07)]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-[rgba(255,255,255,0.07)]" />
          </div>
        </section>
      </section>
    </main>
  );
}

