/**
 * Distintivo circular de un token.
 *
 * Es la ÚNICA excepción consciente a la proporción cromática de la identidad:
 * estos colores son los de cada moneda, no los de PortCodex. Se aceptan porque
 * aquí el color IDENTIFICA —el naranja es Bitcoin, el verde es Solana— y el
 * cliente los reconoce antes de leer el texto. En cuanto dejaran de identificar
 * y pasaran a decorar, sobrarían.
 *
 * Dos letras, no un icono: un logotipo a 22 px se convierte en una mancha, y
 * mantener 60 SVG de terceros al día es una deuda que no compensa. En
 * producción los colores vendrán de la lista de Jupiter (Solana) y CoinGecko;
 * este registro cubre lo que la cartera tiene hoy.
 */

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

export function tokenInk(symbol: string): TokenInk {
  return TOKEN_INK[symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? UNKNOWN_INK;
}

const SIZE = 22;

export function TokenAvatar({ symbol, overlap = false }: { symbol: string; overlap?: boolean }) {
  const ink = tokenInk(symbol);
  return (
    <span
      title={symbol}
      /* Decorativo: el símbolo del token se lee en texto justo al lado, así que
         las dos letras no aportan nada a un lector de pantalla. Declararlo
         también resuelve que las tintas de marca (blanco sobre #627EEA da
         3,69:1) no alcancen el AA de texto: no es texto. */
      aria-hidden="true"
      style={{
        width: SIZE,
        height: SIZE,
        flex: "none",
        borderRadius: "50%",
        background: ink.bg,
        color: ink.fg,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.01em",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // El segundo distintivo de un par monta sobre el primero, y el anillo
        // del color del fondo es lo que hace legible el solape.
        ...(overlap
          ? { marginLeft: -7, boxShadow: "0 0 0 2px var(--background)" }
          : { position: "relative", zIndex: 1 }),
      }}
    >
      {symbol.slice(0, 2).toUpperCase()}
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
