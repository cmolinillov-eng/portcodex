"use client";

import React from "react";
import { LoginForm } from "@/components/auth/login-form";
import { X } from "lucide-react";

interface LoginOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginOverlay({ isOpen, onClose }: LoginOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl transition-all duration-700">
      <div className="relative w-full max-w-md p-8 animate-in fade-in zoom-in duration-500">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="font-designer text-[24px] font-[300] text-[#6FAE8F]">
              Acceder al Terminal
            </h2>
            <p className="font-designer text-[14px] font-[200] text-white/50">
              Introduce tus credenciales para gestionar tu patrimonio.
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,242,0.05)]">
            <LoginForm />
          </div>

          <div className="text-center">
            <p className="font-designer text-[12px] font-[200] text-white/30">
              ¿No tienes cuenta? <span className="text-[#6FAE8F]/80 cursor-pointer hover:text-[#6FAE8F] transition-colors">Solicitar acceso</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
