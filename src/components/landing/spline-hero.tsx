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

      {/* Hero text — centered */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 pb-16 pointer-events-none">
        <h1 className="text-center font-designer text-[44px] md:text-[76px] font-[200] tracking-tight leading-tight select-none flex flex-wrap justify-center gap-x-4">
          <span className="bg-gradient-to-r from-[#A0D2FF] to-[#D4E9FF] bg-clip-text text-transparent">Control.</span>
          <span className="text-white/90">Visión.</span>
          <span className="bg-gradient-to-r from-[#9D50BB] to-[#6E48AA] bg-clip-text text-transparent">Cripto.</span>
        </h1>
        <p className="mt-5 font-designer text-[15px] md:text-[18px] font-[200] text-white/40 max-w-[520px] text-center select-none leading-relaxed">
          Tu patrimonio digital, bajo control total.
        </p>
      </div>

      {/* Top-right nav */}
      <div className="absolute top-7 right-8 z-20">
        <button
          onClick={onLoginClick}
          className="group relative px-6 py-2.5 rounded-full border border-white/10 bg-white/[0.04] font-designer text-[13px] font-[300] tracking-[0.1em] text-white/60 hover:text-white hover:border-[#A0D2FF]/40 hover:bg-white/[0.08] transition-all duration-300 overflow-hidden"
        >
          <span className="relative z-10">INICIAR SESIÓN</span>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#A0D2FF]/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </button>
      </div>
    </div>
  );
}
