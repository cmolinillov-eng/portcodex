import Link from "next/link";
import type { ReactNode } from "react";
import { PortCodexLogo } from "@/components/brand/portcodex-logo";
import { LEGAL_DOCS, LEGAL_UPDATED, LEGAL_UPDATED_ISO } from "./legal-docs";
import landing from "@/components/landing/landing.module.css";
import styles from "./legal.module.css";

/**
 * ARMAZÓN DE LOS DOCUMENTOS LEGALES.
 *
 * ⚠️  Los textos que pinta este componente NO están revisados por un abogado.
 *     Ver la cabecera de `legal-docs.ts`. El aviso se pinta EN PANTALLA, arriba
 *     del todo y en ámbar: no está escondido en un comentario.
 *
 * Tres decisiones:
 *
 * 1. LA BARRA Y EL PIE SON LOS DE LA PORTADA. Se importan sus clases
 *    (`landing.module.css`) en vez de copiarlas: si mañana cambia el alto de la
 *    barra, cambia en los dos sitios a la vez. Una página legal que parece de
 *    otro sitio da la impresión de estar pegada con cinta adhesiva, y eso es
 *    justo lo contrario de lo que un documento legal tiene que transmitir.
 *
 * 2. SIN JAVASCRIPT. Ni una animación de entrada, ni observadores. Los enlaces
 *    del índice son anclas y la barra lateral se pega con `position: sticky`.
 *    Estas páginas tienen que leerse en cualquier navegador y en cualquier
 *    condición: es un requisito legal, no una preferencia técnica.
 *
 * 3. EL ÍNDICE SE DERIVA DE LAS SECCIONES. No se escribe a mano en ningún
 *    sitio, así que no puede desincronizarse del documento ni saltarse una
 *    numeración. Un `h1` por página, `h2` por sección, `h3` dentro del cuerpo:
 *    la jerarquía la impone la estructura, no la disciplina de quien escribe.
 */

export interface LegalSection {
  /** Ancla. Se usa en el índice y en la URL. */
  id: string;
  title: string;
  body: ReactNode;
}


export function LegalNav() {
  return (
    <header className={landing.wrap}>
      <nav className={landing.nav}>
        <Link href="/" aria-label="PortCodex, inicio">
          <PortCodexLogo variant="principal" size={26} clearSpace={false} />
        </Link>
        <Link href="/login" className={landing.navAccess}>
          Acceder
        </Link>
      </nav>
    </header>
  );
}

/** Pie común. Enlaza los cuatro documentos y repite el aviso de estado en una
 *  línea: quien llega al pie sin haber leído la cabecera también debe verlo. */
export function LegalFooter({ currentHref }: { currentHref?: string }) {
  return (
    <footer className={landing.wrap}>
      <div className={landing.footer}>
        <div>
          <PortCodexLogo variant="corporativo" size={26} clearSpace={false} />
          <p className={landing.footerNote} style={{ marginTop: "var(--space-5)" }}>
            PortCodex organiza y explica la información de tus operaciones. No presta
            asesoramiento fiscal ni de inversión.
          </p>
          <p className={landing.footerNote} style={{ marginTop: "var(--space-3)" }}>
            Los textos legales son un borrador pendiente de revisión jurídica.
          </p>
        </div>
        <nav aria-label="Documentos legales" className={styles.docNav} style={{ marginTop: 0 }}>
          <span className={styles.docNavLabel}>Legal</span>
          {LEGAL_DOCS.map((doc) =>
            doc.href === currentHref ? (
              <span key={doc.href} className={styles.docNavCurrent} aria-current="page">
                {doc.short}
              </span>
            ) : (
              <Link key={doc.href} href={doc.href} className={styles.docNavLink}>
                {doc.short}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}

/** El aviso de estado. Va antes del documento y no después: si estuviera al
 *  pie, quien lee las tres primeras secciones y se va no llegaría a verlo. */
export function LegalStatusNotice() {
  return (
    <aside className={styles.status} aria-label="Estado de este documento">
      <p className={styles.statusTitle}>Borrador sin revisión jurídica</p>
      <p className={styles.statusBody}>
        Este texto lo ha redactado el equipo de PortCodex a partir de lo que la aplicación hace de
        verdad: las cookies que pone, los terceros a los que llama y los datos que guarda.{" "}
        <strong>No lo ha revisado un abogado.</strong> Antes de publicarlo hay que completar los
        datos marcados en ámbar y someterlo a revisión jurídica profesional.
      </p>
    </aside>
  );
}

export function LegalDocument({
  title,
  standfirst,
  sections,
  href,
}: {
  title: string;
  /** Entradilla: de qué va el documento, en una o dos frases. */
  standfirst: string;
  sections: LegalSection[];
  /** Ruta de este documento. Marca el enlace actual en el pie. */
  href: string;
}) {
  return (
    <div className={styles.page}>
      <LegalNav />

      <main className={styles.main}>
        <div className={`${landing.wrap} ${styles.head}`}>
          <nav aria-label="Migas de pan" className={styles.crumbs}>
            <Link href="/" className={styles.crumbLink}>
              Inicio
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/legal" className={styles.crumbLink}>
              Legal
            </Link>
          </nav>

          <h1 className={styles.h1}>{title}</h1>
          <p className={styles.standfirst}>{standfirst}</p>

          <p className={styles.updated}>
            Última actualización:{" "}
            <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time>. Esa es la fecha en que se
            redactó este borrador; la de entrada en vigor será la de su publicación definitiva.
          </p>

          <LegalStatusNotice />
        </div>

        <div className={`${landing.wrap} ${styles.doc}`}>
          <nav className={styles.toc} aria-label={`Índice de ${title}`}>
            <p className={styles.tocTitle}>Índice</p>
            <ol className={styles.tocList}>
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={styles.tocLink}>
                    <span className={styles.tocNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.sections}>
            {sections.map((section, i) => (
              <section key={section.id} id={section.id} className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionNum} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className={styles.h2}>{section.title}</h2>
                </div>
                <div className={styles.body}>{section.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <LegalFooter currentHref={href} />
    </div>
  );
}
