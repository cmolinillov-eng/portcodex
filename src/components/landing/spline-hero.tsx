"use client";

import { Suspense, Component, type ReactNode } from "react";
import Spline from "@splinetool/react-spline";

/**
 * Portada de acceso — sistema «INSTRUMENTO» (ver globals.css).
 *
 * Reglas que se aplican aquí y que antes se saltaba:
 *  - Sin negro puro: la superficie más profunda del sistema es --void-deep
 *    (#101318). El #000 cortaba contra ella y producía el salto de color.
 *  - El acento verde se usa CON AVARICIA: un único punto de color en toda la
 *    pantalla (la flecha del acceso). Nada de degradados de marca ni de
 *    colores fuera de paleta.
 *  - Colores por token, no por hex suelto, para que la portada envejezca con
 *    el resto de la aplicación.
 */

class SplineBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="h-full w-full bg-[var(--void-deep)]" />;
    return this.props.children;
  }
}

interface SplineHeroProps {
  onLoginClick: () => void;
}

export function SplineHero({ onLoginClick }: SplineHeroProps) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[var(--void-deep)]">
      {/* Escena 3D de fondo */}
      <SplineBoundary>
        <Suspense fallback={<div className="h-full w-full bg-[var(--void-deep)]" />}>
          {/* La escena venía en ARCOÍRIS (morados, naranjas, azules): el ruido
              cromático que rompía la identidad. Se desatura a ACERO PAVONADO
              —el material que el propio sistema nombra— para que el movimiento
              se conserve pero el color deje de competir. */}
          <div
            className="absolute inset-0 z-0 opacity-[0.5]"
            style={{ filter: "grayscale(1) brightness(0.95) contrast(1.08)" }}
          >
            <Spline
              scene="https://prod.spline.design/ERBRBIQihzcom-vc/scene.splinecode"
              className="h-full w-full"
            />
          </div>
        </Suspense>
      </SplineBoundary>

      {/* Tapa la marca de agua de Spline (abajo derecha) */}
      <div className="absolute bottom-0 right-0 z-20 h-20 w-56 bg-[var(--void-deep)]" />

      {/* Viñeta: los bordes caen al carbón del sistema, no a negro */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, var(--void-deep) 100%)",
        }}
      />

      {/* Base: asienta la composición sobre el lienzo */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[2] h-56 pointer-events-none"
        style={{ background: "linear-gradient(to top, var(--void-deep) 20%, transparent)" }}
      />

      {/* Halo tenue tras el titular — la «caja fuerte que respira» */}
      <div
        className="hero-glow-orb absolute z-[3] pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: "560px",
          height: "240px",
          background: "radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 70%)",
          filter: "blur(40px)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Barra superior — marca a la izquierda, acceso a la derecha */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-7 pt-7">
        <div className="flex items-center gap-2.5 select-none">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{
              background: "var(--void-elevated)",
              border: "1px solid var(--line)",
            }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h4v10H2zM8 2h4v6H8z" fill="var(--foreground)" opacity="0.75" />
              <rect x="8" y="10" width="4" height="2" fill="var(--muted)" />
            </svg>
          </div>
          <span className="font-designer text-[13px] font-[300] tracking-[0.18em] uppercase text-[var(--foreground)]/70">
            Portcodex
          </span>
        </div>

        <button
          onClick={onLoginClick}
          aria-label="Abrir panel de inicio de sesión"
          className="rounded-full border border-[var(--line)] bg-[var(--void-elevated)]/60 px-5 py-2 font-mono text-[11px] font-[400] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors duration-300 hover:border-[var(--accent-primary)]/40 hover:text-[var(--foreground)]"
        >
          Iniciar sesión
        </button>
      </div>

      {/* Titular */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 pb-16">
        <h1
          className="max-w-[16ch] text-center font-designer leading-[1.05] text-[var(--foreground)] select-none"
          style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 200, letterSpacing: "-0.025em" }}
        >
          Cada movimiento,
          <br />
          en su sitio.
        </h1>

        <p
          className="hero-tagline mt-6 max-w-[52ch] text-center leading-relaxed text-[var(--muted)] select-none"
          style={{ fontSize: "clamp(0.92rem, 1.4vw, 1.05rem)", fontWeight: 300 }}
        >
          Portcodex lee tus posiciones en la cadena, mantiene la contabilidad al día
          y deja el fiscal listo. Sin apuntar nada a mano.
        </p>

        <div className="hero-cta-reveal mt-11 pointer-events-auto">
          <button
            onClick={onLoginClick}
            aria-label="Acceder al terminal de Portcodex"
            className="landing-cta font-mono"
          >
            {/* ÚNICO punto de acento en toda la portada */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 7h10M7 2l5 5-5 5"
                stroke="var(--accent-primary)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            ACCEDER AL TERMINAL
          </button>
        </div>
      </div>

      {/* Franja inferior: qué hace, en el idioma del producto */}
      <div className="absolute bottom-6 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 pointer-events-none">
        <span className="landing-feature-chip">Lectura on-chain</span>
        <span className="landing-feature-chip">Contabilidad automática</span>
        <span className="landing-feature-chip">Staking · LP · Lending</span>
        <span className="landing-feature-chip">Fiscal listo (AEAT)</span>
      </div>
    </div>
  );
}
