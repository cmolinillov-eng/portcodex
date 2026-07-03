"use client";

import { Suspense, Component, type ReactNode } from "react";
import Spline from "@splinetool/react-spline";

class SplineBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="h-full w-full bg-[#000000]" />;
    return this.props.children;
  }
}

interface SplineHeroProps {
  onLoginClick: () => void;
}

export function SplineHero({ onLoginClick }: SplineHeroProps) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#000000]">
      {/* Spline Background */}
      <SplineBoundary>
        <Suspense fallback={<div className="h-full w-full bg-[#000000]" />}>
          <div className="absolute inset-0 z-0">
            <Spline
              scene="https://prod.spline.design/ERBRBIQihzcom-vc/scene.splinecode"
              className="h-full w-full"
            />
          </div>
        </Suspense>
      </SplineBoundary>

      {/* Cover Spline watermark (bottom-right) */}
      <div className="absolute bottom-0 right-0 z-20 h-20 w-56 bg-[#000000]" />

      {/* Vignette — edges fade to black for depth */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 z-[2] h-48 pointer-events-none bg-gradient-to-t from-black/70 to-transparent" />

      {/* Ambient glow orb behind hero text */}
      <div
        className="hero-glow-orb absolute z-[3] pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: "520px",
          height: "220px",
          background:
            "radial-gradient(ellipse at center, rgba(111,174,143,0.12) 0%, rgba(79,135,112,0.08) 50%, transparent 75%)",
          filter: "blur(32px)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Top bar — logo left, login right */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-7 pt-7">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 select-none">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(111,174,143,0.2), rgba(79,135,112,0.2))",
              border: "1px solid rgba(111,174,143,0.25)",
              backdropFilter: "blur(8px)",
            }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h4v10H2zM8 2h4v6H8z" fill="#6FAE8F" opacity="0.8" />
              <rect x="8" y="10" width="4" height="2" fill="#4F8770" opacity="0.8" />
            </svg>
          </div>
          <span
            className="font-designer text-[13px] font-[300] tracking-[0.18em] uppercase"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Portcodex
          </span>
        </div>

        {/* Login button */}
        <button
          onClick={onLoginClick}
          aria-label="Abrir panel de inicio de sesión"
          className="group relative px-5 py-2 rounded-full border border-white/10 bg-white/[0.04] font-designer text-[12px] font-[300] tracking-[0.12em] text-white/55 hover:text-white hover:border-[#6FAE8F]/40 hover:bg-white/[0.08] transition-all duration-300 overflow-hidden"
        >
          <span className="relative z-10">INICIAR SESIÓN</span>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#6FAE8F]/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </button>
      </div>

      {/* Hero text — centered */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 pb-16">
        <h1
          className="text-center font-designer leading-tight select-none flex flex-wrap justify-center gap-x-4 overflow-hidden"
          style={{ fontSize: "clamp(2.8rem, 7vw, 5.25rem)", fontWeight: 200, letterSpacing: "-0.02em" }}
        >
          <span className="hero-word hero-word-1 bg-gradient-to-r from-[#6FAE8F] to-[#A9D4BF] bg-clip-text text-transparent">
            Control.
          </span>
          <span className="hero-word hero-word-2 text-white/90">
            Visión.
          </span>
          <span className="hero-word hero-word-3 bg-gradient-to-r from-[#4F8770] to-[#8CA0B3] bg-clip-text text-transparent">
            Cripto.
          </span>
        </h1>

        <p
          className="hero-tagline mt-5 font-designer text-center select-none leading-relaxed"
          style={{ fontSize: "clamp(0.9rem, 1.5vw, 1.1rem)", fontWeight: 200, color: "rgba(255,255,255,0.38)", maxWidth: "480px" }}
        >
          Tu patrimonio digital, bajo control total.
        </p>

        {/* CTA */}
        <div className="hero-cta-reveal mt-10 pointer-events-auto">
          <button
            onClick={onLoginClick}
            aria-label="Acceder al terminal de Portcodex"
            className="landing-cta font-designer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10M7 2l5 5-5 5" stroke="#6FAE8F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            ACCEDER AL TERMINAL
          </button>
        </div>
      </div>

      {/* Bottom feature strip */}
      <div className="absolute bottom-6 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 pointer-events-none">
        <span className="landing-feature-chip">Multi-chain</span>
        <span className="landing-feature-chip">P&amp;L en tiempo real</span>
        <span className="landing-feature-chip">Staking · LP · Lending</span>
        <span className="landing-feature-chip">Portfolio privado</span>
      </div>
    </div>
  );
}
