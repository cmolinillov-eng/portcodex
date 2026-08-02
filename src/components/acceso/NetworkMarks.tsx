/**
 * Marcas de las redes soportadas, en la pantalla de Acceso.
 *
 * MONOCROMO A PROPÓSITO. En color serían seis paletas ajenas compitiendo entre
 * sí y con el azul de marca —y la de Solana es un degradado morado que la
 * identidad prohíbe explícitamente—. Aquí no se pide reconocer logotipos: se
 * pide entender que PortCodex lee de seis redes. Con una sola tinta, las seis
 * se leen como un conjunto y no como seis anuncios.
 *
 * Trazados copiados literalmente de web/design/06-acceso.html y entintados con
 * `currentColor`: el color lo pone el contenedor, no el SVG.
 */

interface NetworkMark {
  name: string;
  /** Ancho y alto en px, tal como vienen de la maqueta. */
  width: number;
  height: number;
  viewBox: string;
  path: React.ReactNode;
}

const MARKS: NetworkMark[] = [
  {
    name: "Bitcoin",
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    path: (
      <>
        <circle cx="12" cy="12" r="10.2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M9.3 7.2h3.9a2.35 2.35 0 0 1 0 4.7H9.3m0 0h4.3a2.45 2.45 0 0 1 0 4.9H9.3V7.2m1.5-1.8v1.8m2.6-1.8v1.8m-2.6 9.6v1.8m2.6-1.8v1.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    name: "Ethereum",
    width: 15,
    height: 22,
    viewBox: "0 0 16 24",
    path: (
      <>
        <path
          d="M8 1.2 15 12.3 8 16.4 1 12.3 8 1.2Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M8 17.9 15 13.8 8 22.8 1 13.8 8 17.9Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    name: "Arbitrum",
    width: 20,
    height: 21,
    viewBox: "0 0 22 24",
    path: (
      <>
        <path
          d="M11 1.3 20.2 6.6v10.8L11 22.7 1.8 17.4V6.6L11 1.3Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M7.4 17.1 11 8.2l3.6 8.9M12.7 12.9h-3.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    name: "Solana",
    width: 22,
    height: 18,
    viewBox: "0 0 24 20",
    path: (
      <>
        <path d="M5.6 3.1h14.1l-3.4 3.5H2.2L5.6 3.1Z" fill="currentColor" />
        <path d="M2.2 9.8h14.1l3.4 3.5H5.6L2.2 9.8Z" fill="currentColor" />
        <path d="M5.6 16.9h14.1l-3.4-3.5H2.2l3.4 3.5Z" fill="currentColor" />
      </>
    ),
  },
  {
    name: "Hyperliquid",
    width: 24,
    height: 18,
    viewBox: "0 0 26 18",
    path: (
      <path
        d="M1.4 11.6c2.6 0 3.6-5.4 6.3-5.4 2.6 0 2.7 5.7 5.3 5.7s3.2-5.9 5.8-5.9c2.4 0 3 4.4 5.8 4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    ),
  },
  {
    name: "BNB Chain",
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    path: (
      <path
        d="M12 2.4 15.4 5.8 12 9.2 8.6 5.8 12 2.4Zm0 12.4 3.4 3.4L12 21.6 8.6 18.2 12 14.8ZM5.8 8.6 9.2 12l-3.4 3.4L2.4 12l3.4-3.4Zm12.4 0L21.6 12l-3.4 3.4L14.8 12l3.4-3.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    ),
  },
];

/** Nombres de las redes, por si hace falta enumerarlas en texto. */
export const SUPPORTED_NETWORKS = MARKS.map((m) => m.name);

export function NetworkMarks() {
  return (
    <ul
      className="m-0 flex list-none items-center p-0"
      style={{ gap: 30, marginTop: 30, color: "var(--faint)" }}
    >
      {MARKS.map((mark) => (
        <li
          key={mark.name}
          title={mark.name}
          className="flex items-center transition-colors hover:text-[var(--muted)]"
          style={{ color: "inherit", transitionDuration: "var(--dur)" }}
        >
          <svg
            width={mark.width}
            height={mark.height}
            viewBox={mark.viewBox}
            fill="none"
            role="img"
            aria-label={mark.name}
            style={{ display: "block" }}
          >
            {mark.path}
          </svg>
        </li>
      ))}
    </ul>
  );
}
