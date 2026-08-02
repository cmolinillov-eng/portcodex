"use client";

import { useEffect } from "react";

/**
 * Abre el diálogo de impresión y fija el título del documento.
 *
 * El título importa más de lo que parece: Chrome propone el `document.title`
 * como nombre del archivo al guardar como PDF. Sin esto, el asesor recibe un
 * «informe.pdf» o directamente la URL; con esto recibe
 * «PortCodex-Informe-fiscal-M-Fita-2026.pdf», que se archiva solo.
 *
 * Se restaura el título al desmontar: si no, el nombre del documento se queda
 * pegado a la pestaña cuando el gestor vuelve a la aplicación.
 */
export function PrintTrigger({ enabled, title }: { enabled: boolean; title: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  useEffect(() => {
    if (!enabled) return;
    // Un fotograma de margen para que las fuentes de la aplicación estén
    // resueltas antes de que el navegador mida la página: si se imprime con la
    // familia de reserva, la paginación por alto fijo se descuadra.
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, [enabled]);

  return null;
}
