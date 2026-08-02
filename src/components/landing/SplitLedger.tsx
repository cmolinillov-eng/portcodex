"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

/**
 * Capital y rendimiento, separándose.
 *
 * Es el concepto que sostiene la sección y no se explica con palabras tan bien
 * como con una barra que se parte en dos. Las cifras son las de una posición de
 * la cartera de demostración —las mismas de la captura de Cartera—, con su
 * desorden natural: 7.960,28 depositados, 1,83 de P&L, 19,85 ya cobrados.
 */
export function SplitLedger() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Aplazado un microtick: cambiar el estado en el cuerpo del efecto
      // encadena un render de más y React avisa. El comportamiento es idéntico
      // —ocurre antes de pintar— y no encadena nada porque es de una sola vez.
      queueMicrotask(() => setOpen(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setOpen(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.split} ref={ref}>
      <div
        className={`${styles.splitBar} ${open ? styles.splitBarOpen : ""}`}
        aria-hidden="true"
      >
        <span className={styles.splitCapital} />
        <span className={styles.splitYield} />
      </div>

      <div className={styles.splitLegend}>
        <div className={`${styles.splitCell} ${open ? styles.splitCellOpen : ""}`}>
          <span className={styles.splitCellLabel}>Capital aportado</span>
          <span className={styles.splitCellValue}>7.960,28 US$</span>
        </div>
        <div className={`${styles.splitCell} ${open ? styles.splitCellOpen : ""}`}>
          <span className={styles.splitCellLabel}>Rendimiento cobrado</span>
          <span className={`${styles.splitCellValue} ${styles.splitCellValueProfit}`}>
            19,85 US$
          </span>
        </div>
      </div>

      <p className={styles.splitFoot}>
        Son dos cosas distintas y en la mayoría de los visores viajan sumadas. Aquí el
        capital no crece porque el rendimiento entre: crece cuando aportas.
      </p>
    </div>
  );
}
