import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalFooter,
  LegalNav,
  LegalStatusNotice,
} from "@/components/legal/LegalDocument";
import { LEGAL_DOCS, LEGAL_UPDATED, LEGAL_UPDATED_ISO } from "@/components/legal/legal-docs";
import landing from "@/components/landing/landing.module.css";
import styles from "@/components/legal/legal.module.css";

/**
 * ÍNDICE LEGAL.
 *
 * ⚠️  LOS CUATRO DOCUMENTOS QUE ENLAZA NO ESTÁN REVISADOS POR UN ABOGADO.
 *
 * Existe esta página porque `/legal/privacidad` sin `/legal` es un callejón: si
 * alguien recorta la URL —y se recorta— debe encontrar el resto de documentos,
 * no un 404. Además da una sola dirección que enlazar desde un contrato.
 */

export const metadata: Metadata = {
  title: "Información legal | PortCodex",
  description:
    "Cómo trata PortCodex los datos, qué cookies usa y en qué términos se utiliza.",
  alternates: { canonical: "/legal" },
  robots: { index: true, follow: true },
};

export default function LegalIndexPage() {
  return (
    <div className={styles.page}>
      <LegalNav />

      <main className={styles.main}>
        <div className={`${landing.wrap} ${styles.head}`}>
          <nav aria-label="Migas de pan" className={styles.crumbs}>
            <Link href="/" className={styles.crumbLink}>
              Inicio
            </Link>
          </nav>

          <h1 className={styles.h1}>Información legal</h1>
          <p className={styles.standfirst}>
            Cuatro documentos. Describen lo que PortCodex hace de verdad con los datos que lee, y lo
            que no hace con el dinero de nadie.
          </p>

          <p className={styles.updated}>
            Última actualización: <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time>. Esa es
            la fecha en que se redactaron estos borradores; la de entrada en vigor será la de su
            publicación definitiva.
          </p>

          <LegalStatusNotice />

          <ul className={styles.indexList}>
            {LEGAL_DOCS.map((doc) => (
              <li key={doc.href}>
                <Link href={doc.href} className={styles.indexCard}>
                  <span className={styles.indexTitle}>{doc.title}</span>
                  <span className={styles.indexSummary}>{doc.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <LegalFooter currentHref="/legal" />
    </div>
  );
}
