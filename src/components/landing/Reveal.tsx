"use client";

import { useEffect, useRef, useState, type Ref, type ReactNode } from "react";

/** Etiquetas que la portada necesita envolver. Cerrado a propósito: así el
 *  `ref` tiene un tipo concreto y no hace falta ningún `any`. */
type RevealTag = "div" | "section" | "li" | "figure" | "p" | "header";
import styles from "./landing.module.css";

/**
 * Entrada al entrar en pantalla: un desplazamiento corto que se para.
 *
 * `IntersectionObserver` y no un listener de scroll: el listener obliga al
 * navegador a recalcular en cada píxel y en móvil se nota. Se desconecta en
 * cuanto el bloque ha entrado — la animación ocurre UNA vez, nunca en bucle.
 *
 * Si el sistema pide menos movimiento, el módulo CSS ya deja el bloque visible
 * y sin transición: no depende de que este componente haga nada.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  id,
}: {
  children: ReactNode;
  as?: RevealTag;
  /** Escalonado en ms. Sirve para que dos bloques no entren a la vez. */
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const Component = Tag as "div";

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Sin soporte de observador (o en un entorno sin él) el bloque se muestra:
    // más vale contenido visible que una animación que no llega.
    if (typeof IntersectionObserver === "undefined") {
      // Aplazado un microtick a propósito: cambiar el estado en el cuerpo del
      // efecto encadena un render de más, y React avisa de ello. El
      // comportamiento es idéntico —ocurre antes de pintar— y no puede
      // encadenarse porque es de una sola vez.
      queueMicrotask(() => setShown(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Se dispara un poco antes de que el borde inferior lo toque: así el
      // bloque ya está en su sitio cuando el ojo llega.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Component
      ref={ref as Ref<HTMLDivElement>}
      id={id}
      className={`${styles.reveal} ${shown ? styles.revealIn : ""} ${className}`.trim()}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}
