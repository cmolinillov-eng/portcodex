"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

export type Step = {
  number: string;
  title: string;
  body: string;
};

/**
 * Los tres pasos, encadenados por una línea fina de acento que los recorre
 * según avanzas. Es el ÚNICO azul de esta sección y el único movimiento.
 *
 * La línea crece con `transform: scaleY` —nunca con `height`— para que el
 * navegador no recalcule la maqueta en cada paso.
 */
export function StepsSpine({ steps }: { steps: Step[] }) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const [reached, setReached] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Aplazado un microtick: cambiar el estado en el cuerpo del efecto
      // encadena un render de más y React avisa. El comportamiento es idéntico
      // —ocurre antes de pintar— y no encadena nada porque es de una sola vez.
      queueMicrotask(() => setReached(steps.length));
      return;
    }
    const nodes = refs.current.filter((n): n is HTMLDivElement => n !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = nodes.indexOf(entry.target as HTMLDivElement);
          if (index < 0) continue;
          // Monótono: la línea avanza, nunca retrocede al subir.
          setReached((current) => Math.max(current, index + 1));
        }
      },
      { rootMargin: "0px 0px -35% 0px", threshold: 0.1 },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [steps.length]);

  const progress = steps.length === 0 ? 0 : reached / steps.length;

  return (
    <div className={styles.steps}>
      <div className={styles.spine} aria-hidden="true">
        <div className={styles.spineFill} style={{ transform: `scaleY(${progress})` }} />
      </div>

      {steps.map((step, index) => (
        <div
          key={step.number}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className={styles.step}
        >
          <span className={styles.stepNumber} aria-hidden="true">
            {step.number}
          </span>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepBody}>{step.body}</p>
        </div>
      ))}
    </div>
  );
}
