"use client";

/**
 * Portada de PortCodex — dirección «Institutional Editorial».
 *
 * Sustituye al hero anterior, que apoyaba toda su presencia en una escena 3D
 * ondulada. Esa pieza está expresamente prohibida por la identidad (§12:
 * ondas, partículas, líneas de datos decorativas, resplandores azules), y con
 * ella se iba también la lectura de «startup tecnológica» que la marca quiere
 * abandonar.
 *
 * La composición se sostiene ahora en lo que pide §13: retícula, espacio
 * negativo generoso, alineación precisa, contraste tipográfico y textos
 * breves. Nada de fondo decorativo — el fondo es plano.
 */

interface LandingHeroProps {
  onLoginClick: () => void;
}

const VALORES = [
  { titulo: "Claridad", texto: "La información compleja, presentada de forma comprensible." },
  { titulo: "Control", texto: "Una visión organizada de todo tu patrimonio." },
  { titulo: "Trazabilidad", texto: "Cada posición y operación, dentro de su contexto." },
];

export function LandingHero({ onLoginClick }: LandingHeroProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[var(--void-deep)]">
      {/* Cabecera */}
      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-8 py-7">
        <div className="flex items-center gap-3 select-none">
          {/* Marcador provisional del símbolo: hasta que exista el SVG
              vectorial definitivo (ver public/brand/README.md) no se coloca
              ningún logo de imagen. */}
          <span className="text-[17px] tracking-[-0.015em] text-[var(--foreground)]">
            Port<span className="font-semibold">Codex</span>
          </span>
        </div>

        <button
          onClick={onLoginClick}
          className="rounded-[8px] px-4 py-2 text-[14px] font-medium text-[var(--muted)] transition-colors duration-200 hover:text-[var(--foreground)]"
        >
          Iniciar sesión
        </button>
      </header>

      {/* Bloque principal — alineado a la izquierda, como una portada editorial */}
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-8 py-20">
        <div className="max-w-[46rem]">
          <h1
            className="font-designer text-[var(--foreground)]"
            style={{
              fontSize: "clamp(2.75rem, 5.6vw, 4.5rem)",
              fontWeight: 500,
              lineHeight: 1.02,
              letterSpacing: "-0.032em",
            }}
          >
            Una visión clara de tu patrimonio digital.
          </h1>

          <p className="mt-8 max-w-[34rem] text-[17px] leading-[1.6] text-[var(--muted)]">
            PortCodex reúne todas tus posiciones en una única lectura, mantiene
            la contabilidad al día y anticipa el impacto fiscal de cada
            operación.
          </p>

          <div className="mt-11 flex flex-wrap items-center gap-5">
            <button
              onClick={onLoginClick}
              className="rounded-[8px] bg-[var(--accent-primary)] px-6 py-3 text-[14px] font-medium text-white transition-colors duration-200 hover:bg-[var(--accent-hover)]"
            >
              Acceder
            </button>
            <span className="text-[14px] text-[var(--faint)]">
              Inteligencia patrimonial para activos digitales
            </span>
          </div>
        </div>
      </main>

      {/* Pie — los tres valores, separados por filos finos */}
      <footer className="mx-auto w-full max-w-[1200px] px-8 pb-14">
        <div className="grid gap-px overflow-hidden border-t border-[var(--line)] pt-10 sm:grid-cols-3">
          {VALORES.map((v) => (
            <div key={v.titulo} className="pr-8">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">{v.titulo}</h2>
              <p className="mt-2 max-w-[22rem] text-[14px] leading-[1.55] text-[var(--faint)]">
                {v.texto}
              </p>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
