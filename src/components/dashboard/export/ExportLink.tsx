/**
 * El enlace de exportar de las cabeceras.
 *
 * Las maquetas lo dibujan igual en Fiscalidad («Exportar») y en Movimientos
 * («Exportar CSV»): texto de 13 px en secundario, sin recuadro, sin icono y
 * pegado a la derecha. Es deliberadamente discreto —exportar es algo que se
 * hace una vez al año, no la acción principal de la pantalla— y por eso NO
 * lleva el azul de acento, que está reservado para lo que sí se pulsa a diario.
 *
 * Sustituye a la sección /fiscal/exportar, que ofrecía lo mismo en cuatro
 * tarjetas apiladas: cuatro cajas para tres descargas que casi nadie usa.
 *
 * Al ser un enlace de verdad y no un botón con JavaScript, se puede abrir en
 * otra pestaña, copiar, y funciona con el teclado sin que hagamos nada.
 */
export function ExportLink({
  href,
  label = "Exportar",
  className,
}: {
  /** Ruta de descarga, normalmente /api/fiscal/export con sus parámetros. */
  href: string;
  /** «Exportar» en Fiscalidad, «Exportar CSV» en Movimientos. */
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      // Sin `download`: el nombre del fichero lo decide el Content-Disposition
      // del servidor, que sabe el ejercicio y el formato. Ponerlo aquí también
      // significaría mantener el mismo nombre en dos sitios.
      className={className}
      style={{
        fontSize: "var(--text-body)",
        fontWeight: 400,
        color: "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
  );
}
