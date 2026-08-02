"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";
import { money } from "@/lib/format/figures";

/**
 * La cifra cuenta hasta su valor UNA vez, al entrar en pantalla. Es el
 * movimiento que permite la identidad: se mueve el producto —su dato—, no el
 * decorado.
 *
 * El valor es el de la cartera de DEMOSTRACIÓN (`/preview`), el mismo que se ve
 * en la captura de más abajo. No es el patrimonio de nadie.
 */
export function CountUpFigure({
  value,
  unit,
  label,
  delta,
  deltaNote,
}: {
  value: number;
  unit: string;
  label: string;
  delta: string;
  deltaNote: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(value);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      // Sin animación: la cifra ya está en su valor final desde el render
      // inicial, así que no hay nada que cambiar.
      return;
    }

    // La cifra arranca de cero JUSTO antes de contar, dentro del observador y no
    // en el cuerpo del efecto: así el HTML del servidor y el del cliente
    // coinciden —ambos traen el valor final— y no hay ni aviso de hidratación ni
    // un parpadeo de «0,00» en quien nunca llega a desplazarse hasta aquí.

    let raf = 0;
    const DURATION = 1100;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || startedRef.current) continue;
          startedRef.current = true;
          observer.disconnect();
          setShown(0);
          const started = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - started) / DURATION);
            // Desaceleración limpia, sin rebote: llega y se para.
            const eased = 1 - Math.pow(1 - t, 3);
            setShown(value * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
            else setShown(value);
          };
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <div className={styles.figureBlock} ref={ref}>
      <span className={styles.figureLabel}>{label}</span>
      {/* El formateo sale de lib/format/figures.ts, el mismo del producto. Con
          un `Intl` propio la cifra perdía el separador de millar al pasar por
          los cuatro dígitos mientras contaba —«9043,48»— porque el español no
          agrupa esas cifras, y el número cambiaba de ancho a media animación. */}
      <span className={styles.figureValue}>
        {money(shown).replace(" US$", "")}
        <span className={styles.figureUnit}>{unit}</span>
      </span>
      <span className={styles.figureDelta}>
        {delta} <span className={styles.figureDeltaNote}>{deltaNote}</span>
      </span>
    </div>
  );
}
