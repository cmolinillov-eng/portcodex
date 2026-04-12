"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export type AuthPanelView = "login" | "register" | "recover" | null;

interface AuthPanelProps {
  view: AuthPanelView;
  onClose: () => void;
  onChangeView: (view: AuthPanelView) => void;
}

const FEATURES = [
  "Multi-chain tracking",
  "P&L en tiempo real",
  "Staking · LP · Lending",
  "Gestión delegada",
  "Exportar CSV",
] as const;

export function AuthPanel({ view, onClose }: AuthPanelProps) {
  useEffect(() => {
    if (!view) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, onClose]);

  const isOpen = view !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 transition-all duration-500 ${
          isOpen ? "bg-black/55 backdrop-blur-md" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sliding panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Panel de inicio de sesión"
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-[400px] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div
          className="flex h-full flex-col bg-[rgba(5,8,18,0.94)] backdrop-blur-2xl border-l border-white/[0.07]"
          style={{ boxShadow: "-20px 0 80px rgba(0,0,0,0.85), -4px 0 0 rgba(160,210,255,0.04)" }}
        >
          {/* Iridescent ola top border */}
          <div className="ola-border flex-shrink-0" />

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-7 pt-7 pb-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              {/* Logo mark */}
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, rgba(160,210,255,0.18), rgba(157,80,187,0.18))",
                  border: "1px solid rgba(160,210,255,0.22)",
                }}
                aria-hidden="true"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2h4v10H2zM8 2h4v6H8z" fill="#A0D2FF" opacity="0.85" />
                  <rect x="8" y="10" width="4" height="2" fill="#9D50BB" opacity="0.85" />
                </svg>
              </div>
              <div>
                <h2 className="text-[16px] font-[300] bg-gradient-to-r from-[#A0D2FF] to-[#D4E9FF] bg-clip-text text-transparent tracking-tight leading-tight">
                  Portcodex
                </h2>
                <p className="text-[11px] font-[200] text-white/35 tracking-[0.06em]">
                  Tu patrimonio digital, bajo control total.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar panel de inicio de sesión"
              className="p-2 rounded-full border border-white/[0.08] text-white/30 hover:text-white hover:border-white/20 transition-all duration-200"
            >
              <X size={14} />
            </button>
          </div>

          {/* Form — scrollable */}
          <div className="flex-1 overflow-y-auto px-7 py-6 min-h-0">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6"
                 style={{ boxShadow: "inset 0 1px 0 rgba(160,210,255,0.06)" }}>
              {isOpen && (
                <LoginForm
                  initialView={view === "recover" ? "recover" : view === "register" ? "register" : "login"}
                />
              )}
            </div>

            {/* Feature chips */}
            <div className="mt-6 flex flex-wrap gap-2">
              {FEATURES.map((feature) => (
                <span key={feature} className="landing-feature-chip">
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-7 py-4 border-t border-white/[0.05]">
            <p className="text-[10px] font-[200] text-white/18 text-center tracking-[0.1em] uppercase">
              Portcodex — Elite Crypto Portfolio Management
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
