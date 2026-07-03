"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tag, X } from "lucide-react";
import { SUGGESTED_STRATEGY_TAGS } from "@/types/portfolio";

interface Props {
  currentTag: string | null;
  canEdit: boolean;
  onChange: (newTag: string | null) => Promise<void> | void;
}

/**
 * Badge de etiqueta estratégica con editor inline.
 *
 * El popover se renderiza vía React Portal en `document.body` para escapar
 * de cualquier `overflow: hidden`, stacking context o z-index del contenedor
 * padre (típicamente la tabla del dashboard).
 *
 * El posicionamiento es FIXED, calculado dinámicamente respecto al botón
 * disparador. Decide si abrir hacia abajo o hacia arriba según el espacio
 * disponible en el viewport.
 */
export function StrategyTagBadge({ currentTag, canEdit, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTag ?? "");
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  useEffect(() => {
    setValue(currentTag ?? "");
  }, [currentTag]);

  // Calcular posición cuando se abre / al hacer resize / scroll
  useLayoutEffect(() => {
    if (!editing) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const POPOVER_HEIGHT_ESTIMATE = 280; // h aprox del popover
      const POPOVER_WIDTH = 288;
      const MARGIN = 8;
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;

      // Decidir si abrir hacia abajo o arriba
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < POPOVER_HEIGHT_ESTIMATE && spaceAbove > spaceBelow;

      // Top
      const top = openUp ? rect.top - POPOVER_HEIGHT_ESTIMATE - MARGIN : rect.bottom + MARGIN;

      // Left: alinear con el botón pero no salirse de la pantalla
      let left = rect.left;
      if (left + POPOVER_WIDTH + MARGIN > viewportW) {
        left = viewportW - POPOVER_WIDTH - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;

      setCoords({ top, left, openUp });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editing]);

  // Cierra al hacer click fuera del popover Y fuera del trigger
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setEditing(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing]);

  // Cierra con Escape global
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editing]);

  async function commit(newTag: string | null) {
    setSaving(true);
    try {
      await onChange(newTag);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // ─── Render del trigger ───────────────────────────────────────────────
  const trigger = (
    <div ref={triggerRef} className="inline-flex items-center gap-1">
      {currentTag ? (
        <>
          <button
            type="button"
            onClick={() => canEdit && setEditing((v) => !v)}
            disabled={!canEdit}
            className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-[#8CA0B3]/80 hover:text-[#CEC8F0] disabled:cursor-default"
            title={canEdit ? "Click para cambiar la etiqueta" : currentTag}
          >
            <Tag className="h-2.5 w-2.5" aria-hidden="true" />
            {currentTag}
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => commit(null)}
              disabled={saving}
              className="text-[10px] text-[var(--muted)] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-rose-400 disabled:opacity-50"
              aria-label="Quitar etiqueta"
              title="Quitar etiqueta"
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          ) : null}
        </>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-[var(--muted)] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-[#CEC8F0]"
        >
          <Tag className="h-2.5 w-2.5" aria-hidden="true" />
          Etiqueta
        </button>
      ) : null}
    </div>
  );

  // ─── Render del popover (portal) ──────────────────────────────────────
  const popover =
    editing && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Editar etiqueta estratégica"
            className="rounded-xl border p-3.5"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: 288,
              zIndex: 9999,
              background: "#0b0c10",
              borderColor: "rgba(167, 155, 224, 0.4)",
              boxShadow:
                "0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(167, 155, 224, 0.12), 0 0 30px rgba(167, 155, 224, 0.12)",
            }}
          >
            <p className="mb-2 text-[10px] uppercase font-mono tracking-[0.12em] text-[var(--muted)]">
              Etiqueta estratégica
            </p>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(value.trim() || null);
              }}
              maxLength={60}
              placeholder="ej. Stablecoin yield"
              className="w-full rounded-lg border border-[var(--line)] bg-black/40 px-2.5 py-2 text-xs text-[var(--foreground)] focus:border-[rgba(167,155,224,0.55)] focus:outline-none"
            />
            <p className="mt-2.5 mb-1.5 text-[9px] uppercase font-mono tracking-[0.12em] text-[var(--muted)] opacity-70">
              Sugerencias
            </p>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_STRATEGY_TAGS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setValue(suggestion)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                    value === suggestion
                      ? "border-[rgba(167,155,224,0.55)] bg-[rgba(167,155,224,0.18)] text-[#CEC8F0]"
                      : "border-[var(--line)] text-[var(--muted)] hover:border-[rgba(167,155,224,0.45)] hover:text-[#CEC8F0]"
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-2 pt-2.5 border-t border-white/5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                {currentTag ? (
                  <button
                    type="button"
                    onClick={() => commit(null)}
                    disabled={saving}
                    className="rounded-md border border-[rgba(206,139,130,0.35)] px-2 py-1 text-[10px] text-rose-300 hover:bg-[rgba(206,139,130,0.1)] disabled:opacity-50"
                  >
                    Quitar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => commit(value.trim() || null)}
                  disabled={saving}
                  className="rounded-md border border-[rgba(167,155,224,0.55)] bg-[rgba(167,155,224,0.15)] px-2.5 py-1 text-[10px] font-medium text-[#CEC8F0] hover:bg-[rgba(167,155,224,0.25)] disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {popover}
    </>
  );
}
