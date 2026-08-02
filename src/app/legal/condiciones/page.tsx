import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/components/legal/legal-docs";
import styles from "@/components/legal/legal.module.css";

/**
 * CONDICIONES DEL SERVICIO.
 *
 * ⚠️  TEXTO NO REVISADO POR UN ABOGADO.
 *
 * Este es el documento que define el producto, y por eso la regla que lo
 * gobierna es una sola: NO PUEDE CONTRADECIR AL PRODUCTO. La sección «lo que
 * PortCodex no es» dice exactamente lo mismo que el aviso legal del informe
 * fiscal (`src/components/reports/FiscalReportDocument.tsx`), que la sección de
 * confianza de la portada y que el propio comportamiento del sistema: solo
 * lectura, sin custodia, sin ejecución de órdenes y sin asesoramiento.
 *
 * Si algún día el producto hace algo más, esta página se cambia ANTES.
 *
 * Punto que necesita abogado: la calificación regulatoria del servicio. Aquí se
 * describe lo que el sistema hace y lo que no hace, sin afirmar que quede fuera
 * del ámbito de ninguna autorización — eso es un dictamen, no una descripción.
 */

const doc = LEGAL_DOCS.find((d) => d.href === "/legal/condiciones")!;

export const metadata: Metadata = {
  title: "Condiciones del servicio | PortCodex",
  description: doc.summary,
  alternates: { canonical: doc.href },
  robots: { index: true, follow: true },
};

const SECTIONS: LegalSection[] = [
  {
    id: "objeto",
    title: "Objeto y aceptación",
    body: (
      <>
        <p>
          Estas condiciones describen qué es PortCodex y en qué términos se usa. PortCodex está
          en desarrollo y todavía no se comercializa: no hay contrato de servicio ni contraprestación,
          y por tanto esto no es un contrato, sino la descripción honesta de lo que la herramienta
          hace y de lo que no hace.
        </p>
        <p>
          PortCodex <strong>no se contrata desde esta web</strong>. El acceso lo facilita un gestor
          patrimonial, en el marco del contrato que tenga suscrito con el titular. Cuando exista un
          contrato específico entre las partes, sus términos prevalecen sobre estas condiciones en
          lo que difieran.
        </p>
      </>
    ),
  },
  {
    id: "que-es",
    title: "Qué es PortCodex",
    body: (
      <>
        <p>
          PortCodex es una <strong>herramienta de lectura, trazabilidad y contabilidad</strong> de
          patrimonio en activos digitales. A partir de las direcciones públicas que el usuario
          autoriza, hace tres cosas:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Lee.</strong> Consulta las posiciones asociadas a esas direcciones —saldos en
            wallet, pools de liquidez, staking y préstamos— en Bitcoin, Solana y las principales
            redes EVM, y las presenta reunidas con su valoración de referencia.
          </li>
          <li>
            <strong>Registra.</strong> Mantiene un libro de movimientos en el que cada aportación,
            retirada, rendimiento, permuta y cierre queda anotado con su fecha, su plataforma y su
            naturaleza, separando el capital aportado del rendimiento generado.
          </li>
          <li>
            <strong>Clasifica.</strong> Asigna a cada operación un tratamiento fiscal de referencia
            y agrega el resultado del ejercicio por bases y casillas, en informes exportables.
          </li>
        </ul>
        <p>
          Todo ello con <strong>acceso de solo lectura</strong> a la cadena de bloques. PortCodex no
          pide, no guarda y no necesita claves privadas ni frases de recuperación.
        </p>
      </>
    ),
  },
  {
    id: "que-no-es",
    title: "Qué NO es PortCodex",
    body: (
      <>
        <p>
          Esta es la sección más importante del documento. Cada punto describe algo que PortCodex{" "}
          <strong>no hace y no puede hacer</strong>, no una limitación de responsabilidad
          disfrazada.
        </p>

        <h3>No custodia fondos</h3>
        <p>
          PortCodex no tiene la custodia de ningún activo. No dispone de claves privadas, ni de
          frases de recuperación, ni de ningún permiso de firma sobre las wallets que lee. No puede
          mover, transferir, bloquear ni disponer de los fondos de un usuario en ninguna
          circunstancia. Los activos permanecen en todo momento donde estaban: bajo el control
          exclusivo de su titular o de la plataforma en la que este los tenga.
        </p>

        <h3>No ejecuta órdenes</h3>
        <p>
          PortCodex no compra, no vende, no permuta, no aporta ni retira liquidez, no deposita ni
          reclama recompensas. No transmite órdenes a ninguna plataforma ni intermedia en ninguna
          operación. Lo que muestra son operaciones que{" "}
          <strong>ya ha ejecutado el usuario por su cuenta</strong>, leídas después de haberse
          producido.
        </p>

        <h3>No presta asesoramiento financiero ni de inversión</h3>
        <p>
          Nada de lo que muestra PortCodex —cifras, gráficos, indicadores de rentabilidad,
          composición de la cartera o barras de riesgo— constituye una recomendación de inversión,
          un análisis financiero, una oferta ni una invitación a operar con ningún activo. PortCodex
          no valora la idoneidad de ninguna decisión para el perfil de ningún usuario. Las
          decisiones patrimoniales son del usuario, y le corresponde tomarlas con el criterio de un
          profesional habilitado.
        </p>

        <h3>No presta asesoramiento fiscal</h3>
        <p>
          Los cálculos fiscales de PortCodex son <strong>orientativos</strong>. No constituyen
          asesoramiento fiscal ni tributario, no son una declaración y no tienen efecto alguno ante
          la Administración tributaria. La clasificación fiscal de cada operación es una{" "}
          <strong>inferencia</strong> a partir de su naturaleza técnica: es revisable, y un asesor
          puede recalificarla.
        </p>
        <p>
          La calificación definitiva de cada renta, la determinación de la base imponible y la
          cumplimentación de cualquier modelo tributario{" "}
          <strong>corresponden al titular y a su asesor</strong>. El desglose por casillas es una
          referencia y debe confirmarse con el modelo del año en curso.
        </p>
        <div className={styles.note}>
          <p>
            Un matiz que conviene entender: las cifras se elaboran exclusivamente con las
            operaciones registradas en la cartera. Una operación no registrada no aparece en los
            informes, y su ausencia no equivale a su inexistencia.
          </p>
        </div>

        <h3>No es una entidad financiera ni una plataforma de intercambio</h3>
        <p>
          PortCodex no capta fondos, no gestiona carteras por cuenta ajena, no opera un mercado ni
          intermedia entre partes. Es un programa que lee información pública y la ordena para su
          titular.
        </p>
        <div className={styles.note}>
          <p>
            La calificación regulatoria del servicio —incluida su relación con la normativa de
            mercados de criptoactivos y de servicios de inversión— es una cuestión jurídica que
            debe determinar un profesional. Este apartado describe lo que el sistema hace y lo que
            no hace; no pretende ser un dictamen sobre su régimen aplicable.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "acceso",
    title: "Acceso, cuentas y credenciales",
    body: (
      <>
        <p>
          El acceso a PortCodex es nominativo. Las credenciales son personales e intransferibles, y
          el usuario es responsable de custodiarlas y de toda actividad realizada con ellas.
        </p>
        <ul className={styles.list}>
          <li>
            Comunica de inmediato cualquier uso no autorizado de tu cuenta del que tengas
            conocimiento.
          </li>
          <li>
            Cada cartera está aislada de las demás. Quien accede a una no ve las otras, y el papel
            de gestor solo alcanza a las carteras que tenga asignadas.
          </li>
          <li>
            El titular puede suspender un acceso cuando exista un uso indebido, un riesgo para la
            seguridad de la plataforma o el incumplimiento de estas condiciones.
          </li>
        </ul>
        <p>
          Las direcciones de wallet que se incorporan a una cartera deben pertenecer al usuario o
          este debe estar legitimado para consultarlas. PortCodex no verifica esa legitimación:
          responde de ella quien introduce la dirección.
        </p>
      </>
    ),
  },
  {
    id: "uso",
    title: "Uso aceptable",
    body: (
      <ul className={styles.list}>
        <li>
          Usar PortCodex conforme a la ley y a estas condiciones, y no emplearlo para fines
          ilícitos.
        </li>
        <li>
          No intentar acceder a datos de otros usuarios, a áreas restringidas ni sortear las medidas
          de seguridad.
        </li>
        <li>
          No extraer de forma sistemática ni automatizada el contenido del servicio, ni someterlo a
          cargas que puedan afectar a su funcionamiento.
        </li>
        <li>
          No ceder ni compartir las credenciales, ni revender el acceso al servicio, sin
          autorización del titular.
        </li>
        <li>
          No introducir en el sistema información que no se esté legitimado para tratar, ni datos
          personales de terceros sin base para ello.
        </li>
      </ul>
    ),
  },
  {
    id: "datos-terceros",
    title: "Datos de terceros y exactitud",
    body: (
      <>
        <p>
          PortCodex no genera los datos que muestra: los lee. Las posiciones proceden de proveedores
          de datos on-chain y de nodos públicos; los precios son{" "}
          <strong>precios de referencia de mercado</strong> y pueden no coincidir con los del
          mercado concreto en que se ejecutó una operación; los tipos de cambio proceden de las
          series oficiales del Banco Central Europeo.
        </p>
        <p>
          El titular pone un cuidado razonable en la calidad de esa lectura, pero{" "}
          <strong>no garantiza la exactitud, la integridad ni la actualidad</strong> de la
          información obtenida de terceros. Un proveedor puede devolver un dato erróneo, incompleto
          o desfasado, o dejar de estar disponible, y eso escapa al control del titular.
        </p>
        <p>
          PortCodex incorpora lectores propios para determinados protocolos. Lo que un lector propio
          todavía no cubre se lee como posición genérica, con su valor. La cobertura evoluciona y no
          se garantiza que un protocolo concreto esté soportado en un momento dado.
        </p>
        <p>
          <strong>Las cifras deben contrastarse</strong> antes de tomar cualquier decisión relevante
          con ellas, y desde luego antes de usarlas con efectos fiscales.
        </p>
      </>
    ),
  },
  {
    id: "disponibilidad",
    title: "Disponibilidad del servicio",
    body: (
      <>
        <p>
          El servicio se presta <strong>tal y como está disponible</strong>. El titular no garantiza
          su funcionamiento ininterrumpido ni libre de errores.
        </p>
        <p>
          El acceso puede suspenderse por mantenimiento, por actualizaciones, por incidencias
          técnicas o por causas ajenas al titular, entre ellas la caída de los proveedores de
          alojamiento, de base de datos o de datos on-chain de los que el servicio depende. Cuando
          una interrupción sea previsible, se procurará avisar con antelación razonable.
        </p>
        <p>
          El titular puede modificar, ampliar o retirar funcionalidades para mejorar el servicio o
          adaptarlo a cambios técnicos o normativos. Si un cambio afectara de forma sustancial a la
          prestación, se comunicará por los medios de contacto disponibles.
        </p>
      </>
    ),
  },
  {
    id: "responsabilidad",
    title: "Limitación de responsabilidad",
    body: (
      <>
        <p>
          El titular responde de los daños que cause por dolo o negligencia grave, y de todo aquello
          de lo que la ley no permita exonerarse. Dentro de ese límite, y en la medida en que el
          derecho aplicable lo permita, no responde de:
        </p>
        <ul className={styles.list}>
          <li>
            Las <strong>decisiones de inversión</strong> que el usuario tome apoyándose en la
            información mostrada, ni de sus resultados. La rentabilidad pasada no anticipa la
            futura, y el valor de los activos digitales puede caer tanto como subir.
          </li>
          <li>
            Las <strong>consecuencias fiscales</strong> de una calificación distinta de la aplicada
            por la herramienta, ni de la presentación de declaraciones basadas en sus cifras sin
            revisión de un asesor.
          </li>
          <li>
            La <strong>inexactitud de los datos de terceros</strong> y de los precios de referencia,
            en los términos del apartado anterior.
          </li>
          <li>
            La <strong>indisponibilidad del servicio</strong> o la pérdida de oportunidad derivada
            de ella.
          </li>
          <li>
            Las pérdidas que sufra el usuario en las plataformas o protocolos en los que opere, que
            son ajenos a PortCodex y tienen sus propios riesgos técnicos y de mercado.
          </li>
          <li>
            El uso indebido de las credenciales por parte de quien las custodia, ni de las
            operaciones registradas de forma incorrecta o incompleta por el usuario o su gestor.
          </li>
        </ul>
        <div className={styles.note}>
          <p>
            La redacción y el alcance de esta cláusula —incluida su validez frente a un usuario con
            la condición de consumidor y la conveniencia de fijar un límite cuantitativo— es uno de
            los puntos que debe revisar un abogado antes de publicar este documento.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "propiedad",
    title: "Propiedad intelectual y datos del usuario",
    body: (
      <>
        <p>
          El software, el diseño, la estructura y la marca PortCodex pertenecen al titular o a sus
          licenciantes. Estas condiciones otorgan al usuario un derecho de uso personal, limitado,
          revocable y no exclusivo sobre la aplicación, mientras dure su acceso. No transmiten
          ningún derecho de propiedad.
        </p>
        <p>
          <strong>Los datos de la cartera son del usuario.</strong> El titular los trata para prestar
          el servicio, en los términos de la{" "}
          <Link href="/legal/privacidad">política de privacidad</Link>, y no adquiere sobre ellos
          más derechos que los necesarios para ello. La aplicación permite exportar el historial de
          operaciones y los informes del ejercicio.
        </p>
      </>
    ),
  },
  {
    id: "duracion",
    title: "Duración, baja y modificación",
    body: (
      <>
        <p>
          El acceso dura mientras se mantenga la relación contractual con el gestor patrimonial o
          con el titular. Cualquiera de las partes puede ponerle fin en los términos de ese
          contrato.
        </p>
        <p>
          Al causar baja, el acceso a la aplicación cesa. La conservación posterior de la
          información se rige por los plazos legales descritos en la{" "}
          <Link href="/legal/privacidad">política de privacidad</Link>: hay datos —los de relevancia
          fiscal y contable— que la ley obliga a conservar aunque la cuenta se cierre. Conviene
          exportar los informes antes de causar baja.
        </p>
        <p>
          El titular puede modificar estas condiciones cuando cambien el servicio o la normativa
          aplicable. La versión vigente es la publicada en esta página, con su fecha en la cabecera.
          Los cambios sustanciales se comunicarán con antelación razonable, y seguir usando el
          servicio después de su entrada en vigor supone aceptarlos.
        </p>
      </>
    ),
  },
  {
    id: "cuando-se-comercialice",
    title: "Cuando esto sea un servicio",
    body: (
      <>
        <p>
          Lo anterior no sustituye a los términos que en su día haya que redactar cuando PortCodex
          se preste como servicio. Cuando eso ocurra harán falta unas condiciones formales, con un
          titular identificado y revisadas por un abogado: identificación del prestador, ley
          aplicable, fuero y régimen de responsabilidad. Nada de eso se improvisa aquí.
        </p>
        <p>
          Para cualquier cuestión sobre estas condiciones, a través del gestor patrimonial que dio
          de alta la cartera.
        </p>
      </>
    ),
  },
];

export default function CondicionesPage() {
  return (
    <LegalDocument
      title="Condiciones del servicio"
      standfirst="Qué es PortCodex y, sobre todo, qué no es. Solo lectura: no custodia fondos, no ejecuta órdenes y no asesora ni fiscal ni financieramente."
      sections={SECTIONS}
      href={doc.href}
    />
  );
}
