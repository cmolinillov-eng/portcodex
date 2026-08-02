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
}

export function TopNav({
  basePath = "",
  portfolioName,
  currencyLabel = "EUR · US$",
  section,
  operatorName,
}: TopNavProps) {
  const pathname = usePathname();
  const root = basePath.replace(/\/$/, "");

  return (
    // El filo inferior va de lado a lado del navegador —así se lee como barra de
    // aplicación y no como una caja— pero su CONTENIDO se ciñe a la misma
    // rejilla que la página: el logotipo tiene que caer a plomo con la cifra de
    // patrimonio. En la maqueta coinciden porque el lienzo medía justo 1240.
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
            const href = link.segment ? `${root}/${link.segment}` : root || "/";
            // Resumen es la raíz: solo está activo si la ruta ES la raíz, o la
            // marcaría cualquier subsección.
            const active = link.segment ? pathname.startsWith(href) : pathname === href;
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
          {portfolioName ? (
            <div
              className="flex items-center gap-[9px] border"
              style={{
                padding: "5px 11px 5px 10px",
                borderColor: "var(--line)",
                // 6 px, no los 8 de `rounded-md`: es el radio de control
                // pequeño que usan las maquetas para cajas de este tamaño.
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: "var(--profit)" }}
                aria-hidden="true"
              />
              <span style={{ fontSize: "var(--text-label)", fontWeight: 500 }}>
                {portfolioName}
              </span>
              <span style={{ fontSize: "10px", color: "var(--faint)" }} aria-hidden="true">
                ▾
              </span>
            </div>
          ) : null}
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
