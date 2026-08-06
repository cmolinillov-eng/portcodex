"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortCodexLogo } from "@/components/brand/portcodex-logo";

/**
 * Navegación principal — horizontal y superior.
 *
 * Sustituye a la barra lateral anterior por una razón de fondo: en el rediseño
 * los datos mandan, y una lateral se come 240 px de ancho en pantallas que
 * viven de tablas. Es además lo que usan Fidelity y BlackRock.
 *
 * También unifica las DOS barras que había antes (general y fiscal): tener dos
 * navegaciones distintas hacía pensar que eran dos productos.
 *
 * Medidas tomadas de las maquetas aprobadas (web/design/), no estimadas.
 */

const LINKS = [
  { segment: "", label: "Resumen" },
  { segment: "cartera", label: "Cartera" },
  { segment: "movimientos", label: "Movimientos" },
  { segment: "fiscalidad", label: "Fiscalidad" },
  { segment: "informes", label: "Informes" },
] as const;

interface TopNavProps {
  /**
   * Raíz de la sección. El cliente vive en "/"; el gestor mira la MISMA cartera
   * bajo "/manager/portfolios/<id>". Las dos usan esta barra y estas cinco
   * secciones — cambia el prefijo, no la navegación.
   */
  basePath?: string;
  /** Cartera activa. Solo se muestra el selector si el perfil gestiona varias. */
  portfolioName?: string;
  currencyLabel?: string;
  /**
   * Nombre de una sección que NO es la cartera de un cliente: «Administración».
   *
   * Cuando se pasa, los cinco enlaces desaparecen y en su sitio queda la
   * etiqueta. Un gestor mirando el listado de usuarios no debe tener a mano
   * cinco enlaces al Resumen o a la Cartera «del cliente», porque en ese
   * momento no hay ningún cliente seleccionado: llevarían a una cartera que no
   * es la que está mirando. Así lo pintan las maquetas 07 y 08.
   */
  section?: string;
  /** Lo que sustituye al selector de cartera en esas pantallas: quién opera. */
  operatorName?: string;
  /**
   * Las carteras entre las que puede cambiar quien mira.
   *
   * Con dos o más, el chip pasa a ser un DESPLEGABLE de verdad. Con una o
   * ninguna se pinta el nombre a secas, SIN el chevron: la caja llevaba un «▾»
   * decorativo, sin menú ni manejador, así que prometía un desplegable que no
   * existía y un gestor con seis carteras solo podía cambiar editando la URL.
   */
  portfolios?: Array<{ id: string; name: string }>;
  /**
   * Se añade a los cuatro enlaces de sección para acotarlos a UNA cartera:
   * «?portfolio=<id>».
   *
   * Sin esto, un gestor que pulsara «Cartera» desde la ficha de un cliente
   * aterrizaba en SU propia cartera —las pantallas resuelven la cartera por la
   * sesión— con el nombre del cliente todavía en la barra.
   */
  portfolioQuery?: string;
  /**
   * Dónde vive el «Resumen» cuando NO es la raíz.
   *
   * Un gestor mirando la cartera de un cliente ya está en su Resumen: esa
   * página de administración ES el Resumen de esa cartera. Mandarlo a «/» le
   * devolvería a su propio panel, que es justo lo contrario de lo que pide.
   */
  resumenHref?: string;
}

export function TopNav({
  basePath = "",
  portfolioName,
  currencyLabel = "EUR · US$",
  section,
  operatorName,
  portfolios,
  portfolioQuery,
  resumenHref,
}: TopNavProps) {
  const pathname = usePathname();
  const root = basePath.replace(/\/$/, "");

  return (
    // El filo inferior va de lado a lado del navegador —así se lee como barra de
    // aplicación y no como una caja— pero su CONTENIDO se ciñe a la misma
    // rejilla que la página: el logotipo cae a plomo con la cifra de patrimonio.
    //
    // Esto se APARTA de la maqueta a sabiendas. Allí la barra lleva 64 px de
    // margen y el contenido 48, así que el logotipo queda 16 px a la derecha de
    // la cifra. Sobre un lienzo fijo no se nota; en un navegador de verdad, dos
    // márgenes distintos en la misma columna se leen como un fallo. Los 48 px
    // son los del contenido, que es quien manda: la barra se alinea con la
    // página, no al revés.
    <nav className="border-b" style={{ borderColor: "var(--line)" }}>
      <div
        className="pcx-nav-inner mx-auto flex items-center gap-10"
        style={{
          maxWidth: "var(--shell-max)",
          height: "var(--nav-h)",
          padding: "0 var(--shell-pad)",
        }}
      >
        <PortCodexLogo variant="principal" tone="sobre-oscuro" size={22} clearSpace={false} />

        {/* Con `section` los cinco enlaces DESAPARECEN y queda la etiqueta. Un
            gestor en el listado de usuarios no debe tener a mano enlaces al
            Resumen o a la Cartera «del cliente»: en ese momento no hay ningún
            cliente seleccionado, así que llevarían a la cartera de otra persona.

            En móvil la tira se desplaza en horizontal en vez de esconderse tras
            un menú: son cinco palabras cortas, y un desplegable añadiría un
            toque para llegar a algo que cabe. */}
        {section ? (
          <span style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>{section}</span>
        ) : (
          <div className="pcx-nav-scroll flex h-full items-center gap-[26px]">
            {LINKS.map((link) => {
              // El Resumen puede vivir fuera de la raíz: cuando un gestor mira la
              // cartera de un cliente, el Resumen ES esa página de admin, y "/"
              // le devolvería a su propio panel.
              // `root || "/"` y NO `root ?? "/"`: con `basePath` por defecto,
              // `root` es la CADENA VACÍA, que no es nullish, así que `??` la
              // daba por buena y el enlace salía como href="" —o sea, apuntando
              // a la página actual—. El Resumen dejó de llevar a ninguna parte
              // en las cuatro pantallas de cliente. Fue una regresión al
              // introducir `resumenHref`: la línea de al lado siempre usó `||`.
              const raiz = resumenHref || root || "/";
              const base = link.segment ? `${root}/${link.segment}` : raiz;
              // `portfolioQuery` acota los cinco enlaces a UNA cartera. Sin él,
              // un gestor que pulsara «Cartera» desde la ficha de un cliente
              // aterrizaba en SU cartera, con el nombre del cliente todavía
              // arriba: la navegación se llevaba consigo el contexto perdido.
              const href = portfolioQuery && link.segment ? `${base}${portfolioQuery}` : base;
              // Resumen es la raíz: solo está activo si la ruta ES la raíz, o la
              // marcaría cualquier subsección.
              const active = link.segment
                ? pathname.startsWith(`${root}/${link.segment}`)
                : pathname === raiz || pathname === (root || "/");
              return (
                <Link
                  key={link.segment}
                  href={href}
                  className="flex h-full items-center"
                  style={{
                    fontSize: "var(--text-body)",
                    fontWeight: active ? 500 : 400,
                    color: active ? "var(--foreground)" : "var(--muted)",
                    // El filo inferior marca la sección activa. Va por box-shadow y
                    // no por border para no descuadrar la altura de la barra.
                    boxShadow: active ? "inset 0 -2px 0 var(--accent-primary)" : undefined,
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex flex-none items-center gap-5">
          {portfolioName ? <PortfolioChip name={portfolioName} portfolios={portfolios} /> : null}
          {/* En una pantalla de sección manda QUIÉN opera; la moneda es contexto
              de una cartera, y ahí no hay ninguna seleccionada. */}
          <span
            style={{
              fontSize: "var(--text-label)",
              color: "var(--faint)",
              whiteSpace: "nowrap",
            }}
          >
            {section ? operatorName : currencyLabel}
          </span>
        </div>
      </div>
    </nav>
  );
}

/**
 * El chip de la cartera activa.
 *
 * Con VARIAS carteras es un `<details>` con un enlace por cartera, igual que el
 * selector de ejercicio de Fiscalidad: cambiar de cartera es navegar, cada una
 * tiene su dirección (`?portfolio=`), y así funciona sin JavaScript y se puede
 * compartir el enlace de una cartera concreta.
 *
 * Con UNA sola —el caso de casi todos los clientes— se pinta el nombre a secas.
 * Antes llevaba siempre un «▾» decorativo, sin menú detrás: un chevron que no
 * despliega miente igual que un botón que no hace nada, y encima dejaba al
 * gestor sin más forma de cambiar de cartera que editar la URL a mano.
 *
 * El enlace conserva la ruta actual, así que cambiar de cartera desde
 * Movimientos te deja en los movimientos de la otra, no te devuelve al Resumen.
 */
function PortfolioChip({
  name,
  portfolios,
}: {
  name: string;
  portfolios?: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const caja = {
    padding: "5px 11px 5px 10px",
    borderColor: "var(--line)",
    // 6 px, no los 8 de `rounded-md`: es el radio de control pequeño que usan
    // las maquetas para cajas de este tamaño.
    borderRadius: "var(--radius-sm)",
  } as const;

  const contenido = (
    <>
      <span
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: "var(--profit)" }}
        aria-hidden="true"
      />
      <span style={{ fontSize: "var(--text-label)", fontWeight: 500 }}>{name}</span>
    </>
  );

  if (!portfolios || portfolios.length <= 1) {
    return (
      <div className="flex items-center gap-[9px] border" style={caja}>
        {contenido}
      </div>
    );
  }

  return (
    <details className="pcx-year-picker" style={{ position: "relative" }}>
      <summary
        className="flex items-center gap-[9px] border"
        aria-label={`Cartera: ${name}`}
        style={{ ...caja, cursor: "pointer", listStyle: "none" }}
      >
        {contenido}
        <span style={{ fontSize: "10px", color: "var(--faint)" }} aria-hidden="true">
          ▾
        </span>
      </summary>

      <div
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: "var(--z-overlay)",
          minWidth: "100%",
          padding: 4,
          background: "var(--void-elevated)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        {portfolios.map((p) => {
          const activa = p.name === name;
          return (
            <a
              key={p.id}
              href={`${pathname}?portfolio=${p.id}`}
              style={{
                display: "block",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-label)",
                whiteSpace: "nowrap",
                background: activa ? "var(--accent-soft)" : "transparent",
                color: activa ? "var(--brand-soft)" : "var(--muted)",
              }}
            >
              {p.name}
            </a>
          );
        })}
      </div>
    </details>
  );
}
