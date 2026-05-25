"use client";

import { useEffect, useRef, useState } from "react";
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
 * - Si no hay tag: muestra "+ Etiqueta" (clickable si canEdit)
 * - Si hay tag: muestra el tag con un botón × para borrarlo
 * - Click → abre popover con sugerencias + input free-text
 *
 * El cambio se notifica al padre vía onChange(tag | null).
 * El padre se encarga de hacer la llamada al endpoint + revalidar.
 */
export function StrategyTagBadge({ currentTag, canEdit, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTag ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(currentTag ?? "");
  }, [currentTag]);

  // Cierra al hacer click fuera
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

  // Vista no editable o cuando NO está editando
  if (!editing) {
    if (currentTag) {
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => canEdit && setEditing(true)}
            disabled={!canEdit}
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(186,160,255,0.45)] bg-[rgba(186,160,255,0.10)] px-2 py-0.5 text-[10px] font-medium text-[#D4C5FF] hover:bg-[rgba(186,160,255,0.18)] disabled:cursor-default"
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
              className="text-[10px] text-[var(--muted)] hover:text-rose-400 disabled:opacity-50"
              aria-label="Quitar etiqueta"
              title="Quitar etiqueta"
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      );
    }
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[rgba(186,160,255,0.55)] hover:text-[#D4C5FF]"
      >
        <Tag className="h-2.5 w-2.5" aria-hidden="true" />
        Etiqueta
      </button>
    );
  }

  // Editor abierto
  return (
    <div ref={ref} className="relative inline-block">
      <div className="absolute z-30 mt-1 w-60 rounded-xl border border-[var(--glass-border)] bg-[var(--void-deep)] p-3 shadow-xl backdrop-blur-xl">
        <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Etiqueta estratégica
        </p>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(value.trim() || null);
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={60}
          placeholder="ej. Stablecoin yield"
          className="w-full rounded-lg border border-[var(--line)] bg-black/30 px-2 py-1.5 text-xs text-[var(--foreground)] focus:border-[rgba(186,160,255,0.55)] focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {SUGGESTED_STRATEGY_TAGS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setValue(suggestion)}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[rgba(186,160,255,0.45)] hover:text-[#D4C5FF]"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
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
                className="rounded-md border border-[rgba(248,113,113,0.35)] px-2 py-1 text-[10px] text-rose-300 hover:bg-[rgba(248,113,113,0.1)] disabled:opacity-50"
              >
                Quitar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => commit(value.trim() || null)}
              disabled={saving}
              className="rounded-md border border-[rgba(186,160,255,0.55)] bg-[rgba(186,160,255,0.15)] px-2 py-1 text-[10px] font-medium text-[#D4C5FF] hover:bg-[rgba(186,160,255,0.25)] disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
