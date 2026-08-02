/**
 * Barra de reparto apilada. La usan Composición de la cartera y Distribución
 * por red.
 *
 * Sustituye al gráfico circular: un anillo obliga a comparar ángulos y a mirar
 * una leyenda aparte; esta barra se lee de izquierda a derecha y deja el nombre,
 * el importe y el porcentaje juntos, que es lo que se quiere comparar.
 */
export function StackedShareBar({
  segments,
}: {
  segments: Array<{ key: string; share: number; color: string }>;
}) {
  return (
    <div className="flex overflow-hidden" style={{ gap: 2, height: 10, borderRadius: 3 }}>
      {segments.map((s, i) => (
        <div
          key={s.key}
          style={{
            width: `${s.share}%`,
            background: s.color,
            // Solo redondean los extremos: los cortes interiores van a escuadra
            // para que la barra se lea como un reparto continuo.
            borderRadius: `${i === 0 ? 3 : 0}px ${i === segments.length - 1 ? 3 : 0}px ${
              i === segments.length - 1 ? 3 : 0
            }px ${i === 0 ? 3 : 0}px`,
          }}
        />
      ))}
    </div>
  );
}

/** Filo de color que identifica una serie. No es un punto: alinea con el grosor
 *  de la barra y así no se lee como un indicador de estado. */
export function SeriesSwatch({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 14,
        height: 2,
        flex: "none",
        background: color,
        transform: "translateY(-4px)",
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Rampa neutra por POSICIÓN, de mayor a menor peso. La usa la distribución por
 * red, donde el conjunto es abierto —hoy 4 redes, mañana 6— y no cabe fijar un
 * tono por red como sí se hace con las cuatro estrategias.
 */
export const RANK_RAMP = ["#DCE3EC", "#8D9CB0", "#52657D", "#35455A", "#26313F"] as const;

export function rankColor(index: number): string {
  return RANK_RAMP[Math.min(index, RANK_RAMP.length - 1)];
}
