import type { ReactNode } from "react";
import { timeAgo, shortDateTime } from "@/lib/format/figures";

/**
 * Contenedor de página. Fija la rejilla —1240 px de ancho útil y 64 de aire
 * lateral— para TODAS las pantallas, que es lo que hace que el logotipo de la
 * barra caiga a plomo con la cifra de patrimonio y que las tablas de Cartera y
 * Movimientos empiecen en la misma vertical.
 *
 * Ninguna pantalla debe repetir estas medidas a mano.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: "var(--shell-max)",
        padding: "0 var(--shell-pad) 44px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Pie de procedencia de los datos. Va al final de cada pantalla: en un producto
 * que lee solo, decir de dónde sale cada cifra y cuándo se leyó es parte del
 * dato, no un adorno.
 */
export function DataProvenance({ children }: { children: ReactNode }) {
  return (
    <div
      className="border-t"
      style={{
        marginTop: 52,
        paddingTop: 16,
        borderColor: "var(--line)",
        /* 12 px. Las SEIS maquetas que llevan pie lo declaran así; el token
           `--text-meta` (11) venía de la tabla de escala, que se equivocaba.
           Manda la maqueta, y además es el texto más pequeño del producto. */
        fontSize: "var(--text-label)",
        color: "var(--faint)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Aviso de lectura vieja.
 *
 * `getSyncInfo` calculaba `isStale` desde el principio —«una lectura vieja deja
 * de ser una lectura»— y NINGUNA pantalla lo enseñaba. Es decir: el producto
 * sabía que el patrimonio que estaba pintando era de hace horas y no se lo
 * decía a nadie. Quien mira la cifra la lee como el saldo de ahora mismo,
 * porque no hay nada que sugiera lo contrario.
 *
 * Va en el PIE y con la misma voz que los avisos de Fiscalidad, no en rojo
 * arriba: que la lectura sea de esta mañana no es una avería, es un dato de
 * procedencia más —igual que cuántas wallets se han leído—. Una alarma cada vez
 * que alguien abre el Resumen antes de la primera sincronización del día se
 * aprende a ignorar en dos días, y entonces ya no avisa de nada.
 *
 * Dice DESDE CUÁNDO, con antigüedad y fecha: «hace 14 horas» sitúa, «6 ago,
 * 21:12» es lo que se compara con la última operación.
 *
 * NO trae envoltorio propio: va DENTRO del `DataProvenance` de la página, como
 * un renglón más. Envuelto en su propio pie salían dos bloques con filo y 52 px
 * de hueco entre ellos —dos pies apilados donde el diseño tiene uno—, y además
 * el aviso quedaba separado de la línea de procedencia que precisamente matiza.
 */
export function StaleReadNotice({ lastSyncIso }: { lastSyncIso: string | null }) {
  return (
    <p style={{ margin: "0 0 8px" }}>
      {lastSyncIso ? (
        <>
          <strong>Estas cifras son de la última lectura, {timeAgo(lastSyncIso)}</strong> (
          {shortDateTime(lastSyncIso)}). Los precios y los saldos han podido moverse desde
          entonces: vuelve a sincronizar antes de darlos por buenos.
        </>
      ) : (
        <>
          <strong>No hay ninguna lectura registrada de esta cartera.</strong> Lo que se enseña
          sale solo de lo que hay guardado, sin comprobar nada contra las redes.
        </>
      )}
    </p>
  );
}
