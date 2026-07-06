import { HDKey } from "@scure/bip32";
import { base58check, bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";

/**
 * Derivación de direcciones desde una clave pública extendida (xpub/ypub/zpub)
 * de un monedero HD Bitcoin. Un monedero (p.ej. Ledger Native SegWit) reparte
 * los fondos entre muchas direcciones derivadas de una misma clave: registrar
 * una sola dirección captura solo una fracción del saldo. Con la clave
 * extendida se derivan y suman TODAS las direcciones con actividad.
 *
 * Tipo de dirección según el prefijo (estándar de facto):
 *   xpub → BIP44  → P2PKH   (1…)
 *   ypub → BIP49  → P2SH-P2WPKH (3…)
 *   zpub → BIP84  → P2WPKH bech32 (bc1q…)  ← Native SegWit
 *
 * Solo claves PÚBLICAS: derivan direcciones, nunca pueden firmar ni mover
 * fondos. Es seguro guardarlas igual que una dirección.
 */

const b58 = base58check(sha256);
const VERSION_XPUB = 0x0488b21e; // mainnet public

export type ExtendedKeyKind = "xpub" | "ypub" | "zpub";

/** Detecta el tipo de clave extendida por prefijo (o null si no lo es). */
export function detectExtendedKey(value: string): ExtendedKeyKind | null {
  const s = value.trim();
  if (/^xpub[1-9A-HJ-NP-Za-km-z]{100,115}$/.test(s)) return "xpub";
  if (/^ypub[1-9A-HJ-NP-Za-km-z]{100,115}$/.test(s)) return "ypub";
  if (/^zpub[1-9A-HJ-NP-Za-km-z]{100,115}$/.test(s)) return "zpub";
  return null;
}

/** Reescribe los 4 bytes de versión a xpub para que @scure/bip32 lo parsee. */
function toXpubVersion(extKey: string): string {
  const raw = b58.decode(extKey);
  const out = new Uint8Array(raw);
  new DataView(out.buffer).setUint32(0, VERSION_XPUB, false);
  return b58.encode(out);
}

function hash160(pubkey: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubkey));
}

function p2wpkh(pubkey: Uint8Array): string {
  return bech32.encode("bc", [0, ...bech32.toWords(hash160(pubkey))]);
}

function p2pkh(pubkey: Uint8Array): string {
  const h = hash160(pubkey);
  const payload = new Uint8Array(1 + h.length);
  payload[0] = 0x00; // mainnet P2PKH
  payload.set(h, 1);
  return b58.encode(payload);
}

function p2shP2wpkh(pubkey: Uint8Array): string {
  const redeem = new Uint8Array(2 + 20);
  redeem[0] = 0x00; // OP_0
  redeem[1] = 0x14; // push 20 bytes
  redeem.set(hash160(pubkey), 2);
  const sh = hash160(redeem);
  const payload = new Uint8Array(1 + sh.length);
  payload[0] = 0x05; // mainnet P2SH
  payload.set(sh, 1);
  return b58.encode(payload);
}

function addressFor(kind: ExtendedKeyKind, pubkey: Uint8Array): string {
  if (kind === "zpub") return p2wpkh(pubkey);
  if (kind === "ypub") return p2shP2wpkh(pubkey);
  return p2pkh(pubkey);
}

const GAP_LIMIT = 20; // BIP44: parar tras 20 direcciones consecutivas sin uso
const MAX_INDEX = 500; // tope de seguridad por rama

export type AddressStats = { sats: number; txCount: number };

/**
 * Deriva y suma el saldo de todas las direcciones activas de la clave
 * extendida, escaneando las ramas de recepción (0) y de cambio (1) con
 * gap-limit por ventanas paralelas. `fetchStats` consulta el saldo de una
 * dirección (mempool.space u otro indexador).
 */
export async function sumExtendedKeyBalance(
  extKey: string,
  kind: ExtendedKeyKind,
  fetchStats: (address: string) => Promise<AddressStats>,
): Promise<{ totalSats: number; usedAddresses: string[]; scanned: number }> {
  const hd = HDKey.fromExtendedKey(toXpubVersion(extKey));
  let totalSats = 0;
  const usedAddresses: string[] = [];
  let scanned = 0;

  for (const branchIndex of [0, 1]) {
    const branch = hd.deriveChild(branchIndex);
    let index = 0;
    let consecutiveEmpty = 0;

    while (consecutiveEmpty < GAP_LIMIT && index < MAX_INDEX) {
      // Ventana de GAP_LIMIT direcciones en paralelo (acotado): si la ventana
      // entera está vacía se alcanza el gap y se para; si no, se avanza.
      const window = Array.from({ length: GAP_LIMIT }, (_, k) => index + k);
      const addresses = window.map((i) => {
        const child = branch.deriveChild(i);
        if (!child.publicKey) throw new Error("No se pudo derivar la clave pública.");
        return addressFor(kind, child.publicKey);
      });
      // Concurrencia baja: los indexadores públicos rate-limitan agresivo al
      // consultar decenas de direcciones seguidas.
      const stats = await mapLimited(addresses, 2, fetchStats);
      scanned += addresses.length;

      for (let k = 0; k < addresses.length; k++) {
        const s = stats[k];
        totalSats += s.sats;
        if (s.txCount > 0) {
          usedAddresses.push(addresses[k]!);
          consecutiveEmpty = 0;
        } else {
          consecutiveEmpty++;
        }
      }
      index += GAP_LIMIT;
    }
  }

  return { totalSats, usedAddresses, scanned };
}

/** map con concurrencia limitada, preservando el orden de entrada. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next++;
      results[current] = await fn(items[current]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
