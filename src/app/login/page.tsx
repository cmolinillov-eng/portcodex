import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getViewerAccess } from "@/lib/auth/viewer-access";

export default async function LoginPage() {
  const access = await getViewerAccess();
  if (access.isAuthenticated) {
    if (access.canManageRoles) redirect("/admin");
    if (access.role === "admin") redirect("/manager");
    redirect("/");
  }

  const animatedBlocks = Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: `${6 + (index * 5) % 88}%`,
    top: `${8 + (index * 9) % 82}%`,
    size: 16 + (index % 4) * 10,
    driftX: `${(index % 5) - 2}px`,
    driftY: `${((index * 3) % 7) - 3}px`,
    driftDelay: `${(index % 7) * 0.6}s`,
    driftDuration: `${8 + (index % 6) * 2.2}s`,
    fadeDelay: `${(index % 5) * 0.35}s`,
    fadeDuration: `${2.4 + (index % 4) * 0.5}s`,
    fadeMin: `${0.04 + (index % 3) * 0.02}`,
    fadeMax: `${0.14 + (index % 3) * 0.06}`,
  }));

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,229,255,0.14),transparent_34%),radial-gradient(circle_at_80%_90%,rgba(0,229,255,0.08),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0">
        {animatedBlocks.map((block) => (
          <span
            key={block.id}
            className="login-drift-block absolute rounded-sm border border-[rgba(0,229,255,0.24)] bg-[rgba(0,229,255,0.05)]"
            style={{
              left: block.left,
              top: block.top,
              width: `${block.size}px`,
              height: `${block.size}px`,
              ["--drift-x" as string]: block.driftX,
              ["--drift-y" as string]: block.driftY,
              ["--drift-delay" as string]: block.driftDelay,
              ["--drift-duration" as string]: block.driftDuration,
              ["--fade-delay" as string]: block.fadeDelay,
              ["--fade-duration" as string]: block.fadeDuration,
              ["--fade-min" as string]: block.fadeMin,
              ["--fade-max" as string]: block.fadeMax,
            }}
          />
        ))}
      </div>

      <section className="relative grid w-full max-w-4xl min-h-[calc(100vh-5rem)] grid-rows-[1fr_auto_minmax(28px,6vh)_auto_1fr] items-center">
        <h1 className="row-start-2 mx-auto max-w-3xl text-center text-[48px] font-extrabold leading-[0.96] tracking-[-0.04em] text-[color:var(--value-accent)] [text-shadow:0_10px_32px_rgba(0,0,0,0.55)] md:text-[62px]">
          Claridad total. Control absoluto.
        </h1>
        <article className="login-panel-breathe row-start-4 mx-auto w-full max-w-lg rounded-3xl px-7 py-[48px] md:px-9 md:py-[56px]">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Crypto Portfolio Tracker</p>
          <h2 className="mt-2 text-[30px] font-semibold tracking-tight text-[color:var(--value-accent)] md:text-[32px]">
            Gestión de portfolios
          </h2>
          <p className="mt-3 max-w-[54ch] text-[15px] font-light text-[#E0E0E0]">
            Registra tus operaciones para obtener la trazabilidad más precisa de tu evolución financiera.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </article>
      </section>
    </main>
  );
}
