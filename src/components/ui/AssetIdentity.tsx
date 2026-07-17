"use client";

import { useState } from "react";

const TOKEN_SLUGS: Record<string, string> = {
  SOL: "sol", WSOL: "sol", USDC: "usdc", USDT: "usdt", USDS: "usds",
  USDE: "usde", PYUSD: "pyusd", ETH: "eth", WETH: "eth", BTC: "btc",
  WBTC: "btc", CBTC: "btc", AAVE: "aave", JUP: "jup", JITOSOL: "jito-staked-sol",
  MSOL: "msol", RAY: "ray", ORCA: "orca", BONK: "bonk", JTO: "jto",
};

const PROTOCOL_SLUGS: Array<[string, string]> = [
  ["jupiter", "jupiter"], ["kamino", "kamino-lend"], ["orca", "orca"],
  ["raydium", "raydium"], ["meteora", "meteora"], ["aave", "aave"],
  ["uniswap", "uniswap"], ["pancakeswap", "pancakeswap"], ["lido", "lido"],
];

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/^W(?=ETH$|SOL$|BTC$)/, "W");
}

function InitialMark({ label, size, tone }: { label: string; size: "sm" | "md"; tone: "token" | "protocol" }) {
  return (
    <span className={`asset-mark asset-mark--${size} asset-mark--${tone}`} aria-hidden="true">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RemoteMark({ src, alt, label, size, tone }: { src: string | null; alt: string; label: string; size: "sm" | "md"; tone: "token" | "protocol" }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <InitialMark label={label} size={size} tone={tone} />;
  return <img className={`asset-mark asset-mark--${size}`} src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function TokenIdentity({ symbol, size = "md", showLabel = true }: { symbol: string; size?: "sm" | "md"; showLabel?: boolean }) {
  const normalized = cleanSymbol(symbol);
  const slug = TOKEN_SLUGS[normalized];
  const src = slug ? `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${slug}.png` : null;
  return (
    <span className="asset-identity">
      <RemoteMark src={src} alt={`${normalized} logo`} label={normalized} size={size} tone="token" />
      {showLabel ? <span className="asset-identity__label">{symbol}</span> : null}
    </span>
  );
}

export function TokenPairIdentity({ pair, size = "md" }: { pair: string; size?: "sm" | "md" }) {
  const tokens = pair.split(/[+/·\-]/).map((token) => token.trim()).filter(Boolean).slice(0, 2);
  if (tokens.length < 2) return <TokenIdentity symbol={pair} size={size} />;
  return (
    <span className="asset-identity">
      <span className="asset-pair" aria-label={`${tokens.join(" / ")} tokens`}>
        <TokenIdentity symbol={tokens[0]} size={size} showLabel={false} />
        <TokenIdentity symbol={tokens[1]} size={size} showLabel={false} />
      </span>
      <span className="asset-identity__label">{pair}</span>
    </span>
  );
}

export function ProtocolIdentity({ protocol, size = "sm" }: { protocol: string; size?: "sm" | "md" }) {
  const normalized = protocol.toLowerCase();
  const slug = PROTOCOL_SLUGS.find(([key]) => normalized.includes(key))?.[1] ?? null;
  const src = slug ? `https://icons.llamao.fi/icons/protocols/${slug}.jpg` : null;
  return (
    <span className="protocol-identity">
      <RemoteMark src={src} alt={`${protocol} logo`} label={protocol} size={size} tone="protocol" />
      <span>{protocol}</span>
    </span>
  );
}
