/**
 * Pantalla de espera de TODAS las rutas.
 *
 * Se ve durante el instante en que el servidor lee la cartera, así que es lo
 * primero del producto que aparece. La anterior era del sistema derogado
 * —orbes verdes desenfocados y barra de progreso animada— y se colaba delante
 * de cada pantalla nueva.
 *
 * Aquí no hay barra de progreso: una barra que avanza sin saber cuánto queda
 * miente. Se dibuja la SILUETA de lo que va a aparecer —la barra de navegación,
 * la cifra grande, el filo de la sección— para que al llegar el contenido nada
 * salte de sitio.
 */
export default function Loading() {
  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      {/* Silueta de la barra de navegación: misma altura y mismo filo. */}
      <div style={{ height: "var(--nav-h)", borderBottom: "1px solid var(--line)" }} />

      <div
        className="mx-auto"
        style={{ maxWidth: "var(--shell-max)", padding: "0 var(--shell-pad)" }}
      >
        <div style={{ paddingTop: 56 }}>
          <Bar width={112} height={13} />
          {/* Hueco de la cifra protagonista, a su altura real. */}
          <div style={{ marginTop: 14 }}>
            <Bar width={340} height={56} />
          </div>
          <div style={{ marginTop: 18 }}>
            <Bar width={210} height={18} />
          </div>

          <div
            className="flex gap-11"
            style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--line)" }}
          >
            <Bar width={128} height={14} />
            <Bar width={128} height={14} />
            <Bar width={148} height={14} />
          </div>
        </div>

        <div style={{ paddingTop: 52 }}>
          <Bar width={180} height={15} />
          <div style={{ marginTop: 22 }}>
            <Bar width="100%" height={10} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Un hueco. Late muy despacio y con poco recorrido: lo justo para decir «esto
 * viene en camino» sin convertir la espera en un espectáculo.
 */
function Bar({ width, height }: { width: number | string; height: number }) {
  return (
    <div
      className="pcx-pulse"
      style={{
        width,
        height,
        borderRadius: 3,
        background: "var(--line-strong)",
        opacity: 0.5,
      }}
      aria-hidden="true"
    />
  );
}
