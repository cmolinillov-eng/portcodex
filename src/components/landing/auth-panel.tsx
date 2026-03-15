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
        className={`fixed inset-0 z-40 transition-all duration-500 ${
          isOpen ? "bg-black/50 backdrop-blur-md" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sliding panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-[400px] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col bg-black/90 backdrop-blur-2xl border-l border-white/[0.07]"
             style={{ boxShadow: "-20px 0 60px rgba(0,0,0,0.8)" }}>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-7 pt-8 pb-6 border-b border-white/[0.06]">
            <div>
              <h2 className="text-[20px] font-[300] bg-gradient-to-r from-[#A0D2FF] to-[#D4E9FF] bg-clip-text text-transparent tracking-tight">
                Acceder a Portcodex
              </h2>
              <p className="mt-1 text-[13px] font-[200] text-white/40">
                Tu patrimonio digital, bajo control total.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full border border-white/[0.08] text-white/30 hover:text-white hover:border-white/20 transition-all duration-200"
            >
              <X size={15} />
            </button>
          </div>

          {/* Form — scrollable */}
          <div className="flex-1 overflow-y-auto px-7 py-6 min-h-0">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              {isOpen && (
                <LoginForm
                  initialView={view === "recover" ? "recover" : view === "register" ? "register" : "login"}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-7 py-4 border-t border-white/[0.06]">
            <p className="text-[11px] font-[200] text-white/20 text-center tracking-[0.08em] uppercase">
              Portcodex — v1.0
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
