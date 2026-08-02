import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/components/legal/legal-docs";
import styles from "@/components/legal/legal.module.css";

/**
 * POLÍTICA DE COOKIES.
 *
 * ⚠️  TEXTO NO REVISADO POR UN ABOGADO.
 *
 * El inventario NO se ha estimado: sale de leer el código. Las tres cookies se
 * declaran en `src/lib/auth/session.ts` y las escriben las rutas de
 * `src/app/api/auth/*`. Las duraciones son las que fija `maxAge` en esas rutas:
 *
 *   cp_access_token   maxAge = session.expires_in ?? 3600   → ~1 hora
 *   cp_refresh_token  maxAge = 60 * 60 * 24 * 30            → 30 días
 *   cp_profile_id     maxAge = 60 * 60 * 24 * 30            → 30 días
 *
 * El atributo `secure` se aplica en producción (`isProductionEnvironment()`); en
 * desarrollo local queda desactivado porque `http://localhost` no es seguro y el
 * navegador rechazaría la cookie. El texto lo dice tal cual.
 *
 * NO SE IMPLEMENTA NINGÚN BANNER, y no es un olvido: el artículo 22.2 de la
 * LSSI-CE exime de consentimiento a las cookies estrictamente necesarias, y
 * estas tres lo son. Si algún día se añade una cookie que no lo sea —analítica,
 * medición, publicidad—, entonces sí hará falta banner, y esta página deja de
 * ser cierta el mismo día.
 */

const doc = LEGAL_DOCS.find((d) => d.href === "/legal/cookies")!;

export const metadata: Metadata = {
  title: "Política de cookies | PortCodex",
  description: doc.summary,
  alternates: { canonical: doc.href },
  robots: { index: true, follow: true },
};

function Cookie({
  name,
  purpose,
  duration,
  attributes,
}: {
  name: string;
  purpose: string;
  duration: string;
  attributes: string;
}) {
  return (
    <div className={styles.entry}>
      <p className={styles.entryCode}>{name}</p>
      <div className={styles.entryRows}>
        <p className={styles.entryLabel}>Para qué sirve</p>
        <p className={styles.entryValue}>{purpose}</p>
        <p className={styles.entryLabel}>Cuánto dura</p>
        <p className={styles.entryValue}>{duration}</p>
        <p className={styles.entryLabel}>Atributos</p>
        <p className={styles.entryValue}>
          <code>{attributes}</code>
        </p>
        <p className={styles.entryLabel}>Titularidad</p>
        <p className={styles.entryValue}>Propia. No es de un tercero.</p>
      </div>
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: "que-es",
    title: "Qué es una cookie",
    body: (
      <>
        <p>
          Una cookie es un pequeño archivo que un sitio guarda en tu navegador y que le devuelve en
          cada visita. Es un mecanismo neutro: sirve tanto para recordar que has iniciado sesión
          como para seguirte de página en página. Lo que decide si necesita tu permiso no es la
          cookie, sino para qué se usa.
        </p>
      </>
    ),
  },
  {
    id: "cuales",
    title: "Las tres cookies de PortCodex",
    body: (
      <>
        <p>
          PortCodex usa tres cookies. Las tres son <strong>propias</strong> y las tres son{" "}
          <strong>técnicas</strong>: existen para que puedas entrar en tu cuenta y seguir dentro
          mientras navegas. Ninguna sirve para medir, analizar ni perfilar.
        </p>

        <div className={styles.entries}>
          <Cookie
            name="cp_access_token"
            purpose="Mantiene la sesión abierta. Es lo que permite que la aplicación sepa que eres tú al pasar de una pantalla a otra."
            duration="La de la sesión de acceso: alrededor de una hora."
            attributes="httpOnly · secure · sameSite=lax · path=/"
          />
          <Cookie
            name="cp_refresh_token"
            purpose="Renueva la sesión cuando la anterior caduca, para no tener que pedirte la contraseña cada hora."
            duration="30 días."
            attributes="httpOnly · secure · sameSite=lax · path=/"
          />
          <Cookie
            name="cp_profile_id"
            purpose="Recuerda con qué perfil has entrado, cuando una misma persona tiene varios (por ejemplo, gestor y cliente)."
            duration="30 días."
            attributes="httpOnly · secure · sameSite=lax · path=/"
          />
        </div>

        <h3>Qué significan esos atributos</h3>
        <ul className={styles.list}>
          <li>
            <strong>
              <code>httpOnly</code>
            </strong>{" "}
            — la cookie no es accesible desde el JavaScript de la página. Es una medida de
            seguridad: dificulta que un script malicioso pueda robar la sesión.
          </li>
          <li>
            <strong>
              <code>secure</code>
            </strong>{" "}
            — solo viaja por conexiones cifradas (HTTPS). En el entorno de desarrollo local queda
            desactivado, porque <code>http://localhost</code> no es una conexión segura y el
            navegador rechazaría la cookie; en el servicio publicado se aplica siempre.
          </li>
          <li>
            <strong>
              <code>sameSite=lax</code>
            </strong>{" "}
            — no se envía cuando otra web hace peticiones a PortCodex en segundo plano. Protege
            frente a ataques de falsificación de petición entre sitios.
          </li>
          <li>
            <strong>
              <code>path=/</code>
            </strong>{" "}
            — es válida en todo el sitio, no solo en una sección.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "no-hay",
    title: "Lo que no hay",
    body: (
      <>
        <p>
          Esta parte importa tanto como la anterior, y es fácil de comprobar abriendo el inspector
          del navegador.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Ninguna cookie de terceros.</strong> Las tres anteriores son propias; no hay
            cookies puestas por otro dominio.
          </li>
          <li>
            <strong>Ninguna herramienta de analítica.</strong> No hay Google Analytics, ni etiquetas
            de Google, ni Meta, ni Hotjar, ni PostHog, ni Segment, ni ningún equivalente.
          </li>
          <li>
            <strong>Ningún píxel de seguimiento</strong> ni etiqueta publicitaria.
          </li>
          <li>
            <strong>Ningún perfilado.</strong> No se construye un perfil de comportamiento ni se
            comparte información de navegación con nadie.
          </li>
        </ul>
        <p>
          PortCodex es una herramienta de trabajo que se usa con sesión iniciada, no un sitio que
          vive de medir visitas. Lo que hay que saber de su uso se sabe sin espiar a nadie.
        </p>
      </>
    ),
  },
  {
    id: "sin-banner",
    title: "Por qué no verás un banner de cookies",
    body: (
      <>
        <p>
          El artículo 22.2 de la Ley 34/2002 (LSSI-CE) exige informar y obtener consentimiento antes
          de instalar cookies en el equipo del usuario, pero{" "}
          <strong>exceptúa expresamente</strong> las que sean estrictamente necesarias para prestar
          un servicio expresamente solicitado por él. La Guía sobre el uso de las cookies de la
          Agencia Española de Protección de Datos recoge esa exención e incluye entre los ejemplos
          las cookies de autenticación o identificación de usuario.
        </p>
        <p>
          Las tres cookies de PortCodex caen de lleno en esa excepción: sin ellas no hay sesión, y
          sin sesión no hay servicio.{" "}
          <strong>Por eso no hay banner ni panel de consentimiento.</strong>
        </p>
        <p>
          Y por eso tampoco tendría sentido ponerlo. Un banner que pide permiso para algo que no
          requiere permiso no protege a nadie: entrena a la gente a aceptar sin leer y añade una
          fricción que no compra nada. La obligación que sí existe —informar— se cumple con esta
          página.
        </p>
        <div className={styles.note}>
          <p>
            Este equilibrio depende de que no se añada ninguna cookie no exenta. El día que
            PortCodex incorpore analítica, medición o cualquier tecnología de seguimiento, habrá que
            implementar un mecanismo de consentimiento previo y actualizar esta página antes de
            activarla.
          </p>
          <p>
            Un matiz que se señala en vez de esconderse: la Guía de la Agencia formula el ejemplo de
            las cookies de autenticación pensando en cookies <em>de sesión</em>, y dos de las tres
            que usa PortCodex son persistentes —duran 30 días— para no tener que pedir la contraseña
            cada hora. Siguen siendo estrictamente necesarias para prestar el servicio solicitado,
            que es el criterio del artículo 22.2, pero es un extremo que debe confirmar la revisión
            jurídica.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "gestionarlas",
    title: "Cómo verlas o borrarlas",
    body: (
      <>
        <p>
          No hace falta que PortCodex te dé un panel: el navegador ya lo tiene, y es más fiable
          porque vale para todos los sitios a la vez. Se encuentra en la configuración, en el
          apartado de privacidad:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Chrome</strong> — Configuración · Privacidad y seguridad · Cookies y otros datos
            de sitios.
          </li>
          <li>
            <strong>Firefox</strong> — Ajustes · Privacidad &amp; Seguridad · Cookies y datos del
            sitio.
          </li>
          <li>
            <strong>Safari</strong> — Ajustes · Privacidad · Gestionar datos de sitios web.
          </li>
          <li>
            <strong>Edge</strong> — Configuración · Cookies y permisos del sitio.
          </li>
        </ul>
        <p>
          Conviene saber la consecuencia:{" "}
          <strong>si borras o bloqueas estas cookies, se cierra tu sesión</strong> y tendrás que
          volver a entrar. Si las bloqueas de forma permanente, no podrás usar la parte privada de
          PortCodex en absoluto. No es una penalización: es que sin ellas el servidor no tiene forma
          de saber quién eres.
        </p>
        <p>
          Cerrar sesión desde la propia aplicación elimina estas cookies sin tocar la configuración
          del navegador. Es la vía recomendada, sobre todo en un equipo compartido.
        </p>
      </>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    body: (
      <p>
        Si cambian las cookies que usa PortCodex, esta página se actualizará antes de que el cambio
        llegue al servicio, con su nueva fecha en la cabecera. El tratamiento de datos personales
        asociado a la sesión se explica en la{" "}
        <Link href="/legal/privacidad">política de privacidad</Link>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Política de cookies"
      standfirst="PortCodex usa tres cookies, todas técnicas y todas propias. No hay analítica, no hay terceros y —por eso mismo— no hay banner."
      sections={SECTIONS}
      href={doc.href}
    />
  );
}
