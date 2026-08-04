/**
 * Distintivo circular de un token.
 *
 * Pinta el LOGO real de la moneda cuando lo hay, y un círculo tintado con las
 * dos primeras letras cuando no. Las maquetas dibujan siempre el círculo de
 * iniciales; el logo es una desviación deliberada y aprobada por producto —el
 * cliente reconoce su cartera antes de leerla—, y es la única.
 *
 * Los logos están EMPAQUETADOS en `public/tokens/`, nunca traídos de un CDN: si
 * cada navegador pidiera los iconos a un tercero, ese tercero vería qué tokens
 * tiene cada cliente, que es la composición de su cartera. El porqué de cada
 * fichero está en `public/tokens/README.md`.
 *
 * El respaldo NO es un caso degradado: para la mayoría de las monedas de la
 * cartera no existe una geometría de marca contrastada, y un logo aproximado
 * afirma una identidad que no es. Esas se quedan con su tinta, que es lo que la
 * maqueta aprobó.
 */

import Image from "next/image";

interface TokenInk {
  bg: string;
  fg: string;
}

/** Colores de marca de cada token, tomados de las maquetas aprobadas. */
const TOKEN_INK: Record<string, TokenInk> = {
  PYUSD: { bg: "#0070E0", fg: "#FFFFFF" },
  USDC: { bg: "#2775CA", fg: "#FFFFFF" },
  USDT: { bg: "#26A17B", fg: "#FFFFFF" },
  JITOSOL: { bg: "#7DE2A8", fg: "#0B1F16" },
  SOL: { bg: "#14F195", fg: "#07130D" },
  WETH: { bg: "#627EEA", fg: "#FFFFFF" },
  ETH: { bg: "#627EEA", fg: "#FFFFFF" },
  CBBTC: { bg: "#0052FF", fg: "#FFFFFF" },
  BTC: { bg: "#F7931A", fg: "#20120A" },
  WBTC: { bg: "#F7931A", fg: "#20120A" },
  HYPE: { bg: "#97FCE4", fg: "#08211C" },
  JTO: { bg: "#2E9C8E", fg: "#FFFFFF" },
  KMNO: { bg: "#5B4CF0", fg: "#FFFFFF" },
  MET: { bg: "#C7F284", fg: "#14200A" },
  DRIFT: { bg: "#7A5CFA", fg: "#FFFFFF" },
  BONK: { bg: "#F5AC37", fg: "#20150A" },
};

/** Token desconocido: neutro del sistema, nunca un color inventado al azar —
 *  un color aleatorio afirmaría una identidad que no tenemos. */
const UNKNOWN_INK: TokenInk = { bg: "var(--float)", fg: "var(--muted)" };

/** Los símbolos llegan sin normalizar de la contabilidad y de las maquetas:
 *  conviven «pyUSD» y «PYUSD», «cbBTC» y «CBBTC». */
function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function tokenInk(symbol: string): TokenInk {
  return TOKEN_INK[normalizeSymbol(symbol)] ?? UNKNOWN_INK;
}

/**
 * Símbolos con fichero en `public/tokens/`. Es una lista ESCRITA, no una
 * comprobación en tiempo de ejecución: hay que saber que falta el logo antes de
 * pedirlo, porque pedirlo y esperar al fallo deja el hueco visible en pantalla.
 * Añadir un logo son dos pasos —el SVG y esta línea— y es a propósito.
 */
const TOKEN_LOGOS = new Set(["BTC", "ETH", "WETH", "SOL", "USDC", "USDT"]);

function tokenLogo(symbol: string): string | null {
  const key = normalizeSymbol(symbol);
  return TOKEN_LOGOS.has(key) ? `/tokens/${key.toLowerCase()}.svg` : null;
}

const SIZE = 22;

export function TokenAvatar({ symbol, overlap = false }: { symbol: string; overlap?: boolean }) {
  const logo = tokenLogo(symbol);
  const ink = tokenInk(symbol);
  return (
    <span
      title={symbol}
      /* Decorativo: el símbolo del token se lee en texto justo al lado, así que
         ni las dos letras ni el logo aportan nada a un lector de pantalla.
         Declararlo también resuelve que las tintas de marca (blanco sobre
         #627EEA da 3,69:1) no alcancen el AA de texto: no es texto. */
      aria-hidden="true"
      style={{
        width: SIZE,
        height: SIZE,
        flex: "none",
        borderRadius: "50%",
        // Con logo NO se pinta la tinta debajo: el SVG trae su propio círculo a
        // sangre y un fondo distinto asomaría como una orla en el antialiasing.
        background: logo ? "transparent" : ink.bg,
        color: ink.fg,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.01em",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Recorta el logo al círculo aunque el SVG venga con esquinas.
        overflow: "hidden",
        // El segundo distintivo de un par monta sobre el primero, y el anillo
        // del color del fondo es lo que hace legible el solape.
        ...(overlap
          ? { marginLeft: -7, boxShadow: "0 0 0 2px var(--background)" }
          : { position: "relative", zIndex: 1 }),
      }}
    >
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={SIZE}
          height={SIZE}
          /* Un SVG de 500 bytes no gana nada pasando por el optimizador de
             imágenes —que además rechaza SVG salvo que se abra
             `dangerouslyAllowSVG`, y no hay motivo para abrirlo. */
          unoptimized
          style={{ width: SIZE, height: SIZE, display: "block" }}
        />
      ) : (
        symbol.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

/** Uno o dos distintivos. Dos cuando la posición es un par (un pool, o un
 *  lending con colateral y deuda de monedas distintas). */
export function TokenAvatars({ symbols }: { symbols: string[] }) {
  return (
    <div className="flex items-center" style={{ flex: "none", marginTop: 1 }}>
      {symbols.slice(0, 2).map((s, i) => (
        <TokenAvatar key={`${s}-${i}`} symbol={s} overlap={i > 0} />
      ))}
    </div>
  );
}
