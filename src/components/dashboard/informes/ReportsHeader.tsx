/**
 * Cabecera de Informes.
 *
 * No lleva cifra: en esta pantalla no hay nada que medir, solo documentos que
 * pedir. El titular nombra de QUIÉN es la documentación, que es lo que el
 * gestor necesita confirmar antes de descargar nada.
 *
 * Medidas de web/design/05-informes.html.
 */
export function ReportsHeader({ section, title }: { section: string; title: string }) {
  return (
    <header style={{ paddingTop: 48 }}>
      {/* `h1` de la pantalla: es lo que anuncia un lector al llegar. */}
      <h1 style={{ margin: 0, fontSize: "var(--text-body)", fontWeight: 400, color: "var(--faint)" }}>
        {section}
      </h1>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 14 }}>
        {title}
      </div>
    </header>
  );
}
