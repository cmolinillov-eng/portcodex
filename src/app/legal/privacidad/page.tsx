import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";
import { LEGAL_DOCS } from "@/components/legal/legal-docs";
import styles from "@/components/legal/legal.module.css";

/**
 * POLÍTICA DE PRIVACIDAD — RGPD y LOPDGDD.
 *
 * ⚠️  TEXTO NO REVISADO POR UN ABOGADO.
 *
 * Los destinatarios de este documento NO son un ejercicio de redacción: salen de
 * auditar el código. Supabase (autenticación y base de datos), Vercel
 * (alojamiento), Resend (correo, todavía sin activar) y las APIs on-chain a las
 * que la aplicación llama con la dirección pública de una wallet. Si mañana se
 * añade un proveedor, ESTA LISTA HAY QUE ACTUALIZARLA: una política de
 * privacidad desactualizada es una declaración falsa.
 *
 * El punto que MÁS necesita revisión jurídica —y no es discutible— es el reparto
 * responsable/encargado entre PortCodex y el gestor patrimonial. Está en la
 * sección «responsable», señalado en el propio texto.
 */

const doc = LEGAL_DOCS.find((d) => d.href === "/legal/privacidad")!;

export const metadata: Metadata = {
  title: "Política de privacidad | PortCodex",
  description: doc.summary,
  alternates: { canonical: doc.href },
  robots: { index: true, follow: true },
};

/** Destinatario verificado en el código. `data` dice qué recibe de verdad. */
function Recipient({
  name,
  role,
  data,
  location,
}: {
  name: string;
  role: string;
  data: string;
  location: React.ReactNode;
}) {
  return (
    <div className={styles.entry}>
      <p className={styles.entryName}>{name}</p>
      <div className={styles.entryRows}>
        <p className={styles.entryLabel}>Para qué</p>
        <p className={styles.entryValue}>{role}</p>
        <p className={styles.entryLabel}>Qué recibe</p>
        <p className={styles.entryValue}>{data}</p>
        <p className={styles.entryLabel}>Dónde trata</p>
        <p className={styles.entryValue}>{location}</p>
      </div>
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: "responsable",
    title: "Quién es el responsable",
    body: (
      <>
        <p>
          El responsable del tratamiento de los datos personales recogidos a través de PortCodex es:
        </p>
        <div className={styles.entries}>
          {/* No hay identificación de un titular porque NO HAY SOCIEDAD todavía:
              PortCodex no se comercializa. Poner aquí una razón social inventada
              sería una declaración falsa, y dejar un hueco a rellenar, un
              documento a medias. Se dice lo que es cierto. */}
          <p>
            PortCodex es una herramienta en desarrollo que todavía no se comercializa. No hay
            ninguna sociedad prestando un servicio ni cobrando por él: las carteras que hay dadas
            de alta lo están por acuerdo directo con quien lleva el proyecto, y es a esa persona
            —a través del gestor patrimonial que dio de alta la cartera— a quien hay que dirigirse
            para cualquier cuestión sobre los datos.
          </p>
          <p>
            Cuando PortCodex pase a prestarse como servicio, esta página tendrá que sustituirse por
            una política de privacidad formal, con el responsable identificado y revisada por un
            abogado. Mientras tanto, lo que sigue describe con exactitud qué hace el sistema con la
            información, que es lo que de verdad importa saber.
          </p>
        </div>

        <h3>Un matiz que cambia quién responde de qué</h3>
        <p>
          PortCodex <strong>no se contrata desde esta web</strong>: se contrata a través de un
          gestor patrimonial. Es el gestor quien da de alta a su cliente, quien introduce sus datos
          y quien decide qué carteras se siguen. Esa forma de contratar afecta directamente a los
          papeles de la normativa de protección de datos: en unos tratamientos PortCodex actúa como
          responsable y en otros podría estar actuando como{" "}
          <strong>encargado del tratamiento por cuenta del gestor</strong>, que sería entonces el
          responsable frente a su cliente.
        </p>
        <div className={styles.note}>
          <p>
            <strong>Punto pendiente de revisión jurídica.</strong> El reparto exacto entre PortCodex
            y el gestor —quién es responsable, quién encargado, y qué contrato del artículo 28 del
            RGPD hay que firmar entre ambos— no puede decidirlo un equipo de producto. De él depende
            a quién debe dirigirse un cliente para ejercer sus derechos y quién responde ante la
            Agencia Española de Protección de Datos. Hasta que un abogado lo cierre, este documento
            describe el tratamiento tal y como ocurre, sin dar por resuelta esa cuestión.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "datos",
    title: "Qué datos se tratan y de dónde salen",
    body: (
      <>
        <p>
          Casi ningún dato de PortCodex lo escribe el cliente. La mayoría llega por dos vías: se los
          facilita su gestor patrimonial al darlo de alta, o los lee la propia aplicación de la
          cadena de bloques a partir de las direcciones que el cliente ha autorizado.
        </p>

        <h3>Datos identificativos y de cuenta</h3>
        <p>
          Correo electrónico, nombre o identificador de usuario, rol dentro del sistema (cliente,
          gestor o administración) y la cartera o carteras a las que se tiene acceso. Los aporta el
          gestor al crear la cuenta. La contraseña la gestiona el proveedor de autenticación y no se
          almacena en claro en ningún sitio.
        </p>

        <h3>Datos patrimoniales y financieros</h3>
        <p>
          Direcciones públicas de wallet, posiciones abiertas, saldos por activo y por red,
          operaciones —aportaciones, retiradas, rendimientos, permutas y cierres—, importes, fechas,
          plataformas, la clasificación fiscal de cada apunte y los informes generados a partir de
          todo ello.
        </p>

        <h3>Datos técnicos de la sesión</h3>
        <p>
          Los estrictamente necesarios para mantener la sesión abierta y para que el servicio
          funcione: las tres cookies técnicas descritas en la{" "}
          <Link href="/legal/cookies">política de cookies</Link> y los registros técnicos que
          generan el alojamiento y la base de datos, propios de cualquier servicio en internet.
        </p>
        <p>
          <strong>No hay analítica.</strong> PortCodex no incorpora Google Analytics, ni píxeles de
          seguimiento, ni herramientas de medición de comportamiento, ni perfilado publicitario.
        </p>

        <h3>Datos de quien solicita información</h3>
        <p>
          Cuando el formulario de contacto de la portada esté operativo, tratará el nombre, el
          correo y lo que la persona escriba en el mensaje, con la única finalidad de responder a
          esa solicitud.
        </p>
      </>
    ),
  },
  {
    id: "wallets",
    title: "Las direcciones de wallet son datos personales",
    body: (
      <>
        <p>
          Este apartado va aparte porque es el punto que más se malinterpreta y el que más importa
          en un servicio como este.
        </p>
        <p>
          Una dirección pública de blockchain —una cadena de caracteres visible para cualquiera en
          un registro público— <strong>no identifica a nadie por sí sola</strong>. Pero en el
          momento en que PortCodex la asocia a un cliente identificado, esa dirección pasa a ser un{" "}
          <strong>dato personal</strong> a efectos del RGPD, y con ella todo el historial de
          operaciones que cuelga de esa dirección: importes, fechas, contrapartes y patrimonio.
        </p>
        <p>
          Ese historial es, además, información especialmente sensible en la práctica: describe la
          situación patrimonial de una persona con un nivel de detalle que pocos tratamientos
          alcanzan. Se trata con esa consideración, aunque no sea una categoría especial de datos de
          las del artículo 9 del RGPD.
        </p>
        <p>
          Para leer las posiciones, PortCodex{" "}
          <strong>transmite esas direcciones públicas a servicios de terceros</strong>: los
          proveedores de datos on-chain de la sección de destinatarios. No es un detalle técnico
          menor y no se entierra en una lista: esos terceros reciben la dirección, y por sí mismos
          no saben de quién es, pero la reciben.
        </p>
        <p>
          Lo que <strong>nunca</strong> sale de PortCodex hacia esos servicios es la identidad del
          cliente: no se les envía su nombre, su correo ni ningún otro dato que los relacione con la
          dirección consultada.
        </p>
        <div className={styles.note}>
          <p>
            Conviene recordar una limitación que no depende de PortCodex: la información inscrita en
            una cadena de bloques pública es inmutable y no la controla nadie. Un derecho de
            supresión puede ejercerse sobre lo que PortCodex guarda, pero no sobre la propia cadena.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Para qué se tratan",
    body: (
      <ul className={styles.list}>
        <li>
          <strong>Prestar el servicio.</strong> Leer las posiciones de las direcciones autorizadas,
          calcular el patrimonio, mantener el libro de movimientos al día y mostrarlo en la
          aplicación.
        </li>
        <li>
          <strong>Llevar la contabilidad de la cartera.</strong> Separar el capital aportado del
          rendimiento generado, seguir el coste de adquisición de cada posición y registrar cada
          operación con su fecha, su plataforma y su naturaleza.
        </li>
        <li>
          <strong>Preparar información fiscal orientativa.</strong> Clasificar cada operación según
          su tratamiento tributario, agregar el resultado por bases y casillas de referencia y
          generar informes exportables. Es un cálculo orientativo, nunca una declaración.
        </li>
        <li>
          <strong>Gestionar el acceso y la seguridad.</strong> Autenticar a quien entra, mantener la
          sesión, mantener cada cartera aislada de las demás y detectar accesos indebidos.
        </li>
        <li>
          <strong>Comunicarse con el cliente y con su gestor.</strong> Responder a solicitudes y,
          cuando el envío de correo esté activado, remitir avisos relacionados con el servicio.
        </li>
        <li>
          <strong>Cumplir obligaciones legales.</strong> Conservar la información que la normativa
          fiscal y mercantil obliga a conservar, y atender los requerimientos de las autoridades
          competentes.
        </li>
      </ul>
    ),
  },
  {
    id: "bases",
    title: "Con qué base jurídica",
    body: (
      <>
        <p>
          Ningún tratamiento de los descritos se apoya en un consentimiento genérico marcado en una
          casilla. Cada finalidad tiene su base:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Ejecución de un contrato</strong> (art. 6.1.b del RGPD), para prestar el
            servicio contratado: leer posiciones, llevar la contabilidad, generar informes y dar
            acceso a la aplicación. Sin tratar estos datos no hay servicio que prestar.
          </li>
          <li>
            <strong>Interés legítimo</strong> (art. 6.1.f), para la seguridad de la plataforma —
            control de accesos, prevención del uso indebido, integridad de los datos — y para
            responder a quien contacta por iniciativa propia. Cuando el contrato lo firma el gestor
            y no el cliente final, esta base también sostiene el tratamiento de los datos de ese
            cliente en el marco de la relación entre ambos.
          </li>
          <li>
            <strong>Cumplimiento de una obligación legal</strong> (art. 6.1.c), para conservar la
            información con relevancia fiscal y contable durante los plazos que fija la ley y para
            atender requerimientos de las autoridades.
          </li>
          <li>
            <strong>Consentimiento</strong> (art. 6.1.a), únicamente si en el futuro se ofrece algo
            que lo requiera —por ejemplo, comunicaciones comerciales—. Sería siempre una acción
            afirmativa y separada, y revocable en cualquier momento.
          </li>
        </ul>
        <div className={styles.note}>
          <p>
            La elección exacta de base jurídica para el cliente final depende del reparto
            responsable/encargado con el gestor patrimonial. Está señalado como punto pendiente en
            la primera sección y debe cerrarlo la revisión jurídica.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "conservacion",
    title: "Cuánto tiempo se conservan",
    body: (
      <>
        <p>
          Los datos se conservan mientras dure la relación con el cliente y, después, bloqueados
          durante los plazos en que puedan derivarse responsabilidades. Bloqueados significa
          conservados pero inaccesibles para el uso ordinario: solo quedan a disposición de jueces,
          tribunales y administraciones que puedan reclamarlos.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Datos de cuenta y acceso:</strong> mientras la cuenta esté activa. Al darla de
            baja se suprimen, salvo lo que deba conservarse por los motivos siguientes.
          </li>
          <li>
            <strong>Operaciones y datos con relevancia fiscal:</strong> al menos{" "}
            <strong>cuatro años</strong>, que es el plazo de prescripción tributaria del artículo 66
            de la Ley General Tributaria, contados desde el fin del plazo de presentación de la
            declaración correspondiente.
          </li>
          <li>
            <strong>Documentación con relevancia mercantil:</strong> hasta{" "}
            <strong>seis años</strong>, conforme al artículo 30 del Código de Comercio, cuando
            resulte aplicable al titular.
          </li>
          <li>
            <strong>Solicitudes de información:</strong> el tiempo necesario para atenderlas y, si
            no derivan en una relación contractual, un plazo razonable para acreditar que fueron
            atendidas.
          </li>
        </ul>
        <div className={styles.note}>
          <p>
            Los plazos citados son los generales de la normativa española. Cuáles se aplican en
            concreto al titular —y desde qué fecha empiezan a contar en cada caso— es una cuestión
            que debe confirmar la revisión jurídica y, en su caso, la asesoría fiscal del titular.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "destinatarios",
    title: "A quién se comunican",
    body: (
      <>
        <p>
          PortCodex <strong>no vende datos personales</strong> ni los cede a terceros con fines
          comerciales o publicitarios. Los proveedores que aparecen a continuación son los
          necesarios para que el servicio funcione, y esta lista sale de auditar el código: es lo
          que la aplicación llama de verdad.
        </p>

        <h3>Prestadores de servicio</h3>
        <div className={styles.entries}>
          <Recipient
            name="Supabase"
            role="Autenticación de usuarios y base de datos del servicio."
            data="Datos identificativos (correo, nombre, rol) y datos financieros: posiciones, operaciones, importes e informes."
            location="Infraestructura de Supabase. La región concreta depende del proyecto; parte de su infraestructura opera fuera del Espacio Económico Europeo."
          />
          <Recipient
            name="Vercel"
            role="Alojamiento y entrega de la aplicación."
            data="Los datos que atraviesan la aplicación al servirla, más los registros técnicos propios del alojamiento."
            location="Red de Vercel, con presencia global. Parte de su infraestructura opera fuera del Espacio Económico Europeo."
          />
          <Recipient
            name="Resend"
            role="Envío de correo transaccional."
            data="Correo electrónico del destinatario y contenido del mensaje."
            location="Fuera del Espacio Económico Europeo, salvo configuración distinta."
          />
        </div>
        <div className={styles.note}>
          <p>
            El envío de correo <strong>todavía no está activado</strong>. Este destinatario se
            declara porque el proveedor está previsto e integrado; mientras no se active, no recibe
            ningún dato. Cuando se active, esta advertencia se retira.
          </p>
        </div>

        <h3>Proveedores de datos on-chain</h3>
        <p>
          Para leer las posiciones de una cartera, PortCodex consulta servicios públicos de datos de
          blockchain. A todos ellos se les transmite{" "}
          <strong>la dirección pública de la wallet</strong>, y a ninguno la identidad de su titular.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Zerion</strong> — posiciones y saldos en redes EVM (<code>api.zerion.io</code>).
          </li>
          <li>
            <strong>Helius</strong> y los nodos públicos de Solana — lectura de cuentas y programas
            en Solana (<code>mainnet.helius-rpc.com</code>,{" "}
            <code>api.mainnet-beta.solana.com</code>).
          </li>
          <li>
            <strong>Jupiter</strong> — precios y datos de mercado en Solana (<code>api.jup.ag</code>
            , <code>lite-api.jup.ag</code>).
          </li>
          <li>
            <strong>Blockstream</strong> y <strong>mempool.space</strong> — saldos y transacciones
            de Bitcoin (<code>blockstream.info</code>, <code>mempool.space</code>).
          </li>
          <li>
            <strong>dRPC</strong> — nodos de acceso a Ethereum, Base, BNB Chain, Arbitrum, Polygon e
            Hyperliquid (<code>*.drpc.org</code>).
          </li>
          <li>
            <strong>CoinGecko</strong> — precios de referencia de los activos (
            <code>api.coingecko.com</code>).
          </li>
        </ul>

        <h3>Un proveedor que no recibe ningún dato personal</h3>
        <p>
          Los tipos de cambio oficiales del Banco Central Europeo se obtienen de{" "}
          <code>api.frankfurter.app</code>. A ese servicio{" "}
          <strong>no se le envía ningún dato personal</strong>: se le pregunta por el cambio de una
          divisa en una fecha, y nada más. Se menciona por transparencia y porque la diferencia
          importa.
        </p>

        <h3>Otros destinatarios</h3>
        <ul className={styles.list}>
          <li>
            <strong>El gestor patrimonial</strong> que da acceso al cliente, respecto de la cartera
            que gestiona. Cada cartera está aislada de las demás: quien accede a una no ve las
            otras.
          </li>
          <li>
            <strong>Administraciones públicas, jueces y tribunales</strong>, cuando exista una
            obligación legal de comunicar la información.
          </li>
          <li>
            <strong>Asesores y auditores del titular</strong>, sujetos a deber de confidencialidad,
            en la medida en que sea necesario.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "transferencias",
    title: "Transferencias internacionales",
    body: (
      <>
        <p>
          Conviene decirlo sin rodeos:{" "}
          <strong>
            varios de los proveedores anteriores están establecidos fuera del Espacio Económico
            Europeo
          </strong>
          , principalmente en Estados Unidos. Usarlos implica una transferencia internacional de
          datos.
        </p>
        <p>
          Estas transferencias se amparan en los mecanismos que prevé el capítulo V del RGPD: una
          decisión de adecuación de la Comisión Europea cuando el proveedor esté acogido a ella —por
          ejemplo, el Marco de Privacidad de Datos UE-EE. UU.— o, en su defecto, las cláusulas
          contractuales tipo aprobadas por la Comisión, junto con las medidas complementarias que
          procedan.
        </p>
        <p>
          En el caso de los proveedores de datos on-chain, lo transferido es la{" "}
          <strong>dirección pública de una wallet</strong>: un dato que ya es público en la propia
          cadena de bloques y que se envía sin ninguna referencia a la identidad de su titular. Eso
          no lo excluye del RGPD, pero sitúa el riesgo real de la transferencia.
        </p>
        <div className={styles.note}>
          <p>
            La base concreta de cada transferencia depende de la región contratada con cada
            proveedor y del acuerdo firmado con él. Verificarlo proveedor por proveedor, y recoger
            los contratos de encargo del artículo 28 del RGPD, es tarea de la revisión jurídica.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "decisiones",
    title: "Decisiones automatizadas",
    body: (
      <>
        <p>
          PortCodex <strong>clasifica automáticamente</strong> cada operación según su naturaleza
          técnica para asignarle un tratamiento fiscal de referencia. Esa clasificación es{" "}
          <strong>orientativa y revisable</strong>: la revisan el titular y su asesor, y el asesor
          puede recalificarla. No produce por sí sola efectos jurídicos sobre ninguna persona ni
          decide sobre el acceso al servicio.
        </p>
        <p>
          PortCodex no elabora perfiles con fines publicitarios, no puntúa a los clientes ni toma
          decisiones automatizadas que les afecten significativamente en el sentido del artículo 22
          del RGPD.
        </p>
        <div className={styles.note}>
          <p>
            Que la clasificación fiscal automática quede fuera del artículo 22 es la valoración de
            este equipo, no un dictamen. Es otro punto que conviene confirmar con la revisión
            jurídica.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "seguridad",
    title: "Seguridad",
    body: (
      <>
        <p>
          El titular aplica medidas técnicas y organizativas apropiadas al riesgo, conforme al
          artículo 32 del RGPD. Entre ellas:
        </p>
        <ul className={styles.list}>
          <li>Cifrado del tráfico en tránsito mediante HTTPS en todo el servicio.</li>
          <li>
            Autenticación gestionada por un proveedor especializado. Las contraseñas no se almacenan
            en claro y el titular no puede consultarlas.
          </li>
          <li>
            Cookies de sesión con el atributo <code>httpOnly</code>, inaccesibles desde JavaScript,
            lo que reduce el riesgo de robo de sesión.
          </li>
          <li>
            Aislamiento entre carteras y control de acceso por rol: quien accede a una cartera no ve
            las demás.
          </li>
          <li>
            <strong>Acceso de solo lectura a la cadena de bloques.</strong> PortCodex no pide, no
            guarda y no necesita claves privadas ni frases de recuperación, y no puede firmar ni
            mover fondos. Una brecha en PortCodex no permitiría a nadie disponer de los activos de
            un cliente.
          </li>
        </ul>
        <p>
          Ningún sistema es invulnerable. Si se produjera una violación de seguridad que suponga un
          riesgo para los derechos de los afectados, se notificará a la autoridad de control y, si
          el riesgo es alto, a los propios afectados, en los términos de los artículos 33 y 34 del
          RGPD.
        </p>
      </>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos",
    body: (
      <>
        <p>
          El RGPD reconoce a toda persona los siguientes derechos sobre sus datos. Ejercerlos es
          gratuito.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Acceso.</strong> Saber qué datos se tratan y obtener una copia.
          </li>
          <li>
            <strong>Rectificación.</strong> Corregir los datos inexactos o completar los
            incompletos.
          </li>
          <li>
            <strong>Supresión.</strong> Pedir que se borren cuando ya no sean necesarios, con el
            límite de los plazos legales de conservación.
          </li>
          <li>
            <strong>Oposición.</strong> Oponerse a un tratamiento basado en el interés legítimo, por
            motivos relacionados con la situación particular.
          </li>
          <li>
            <strong>Limitación.</strong> Pedir que el tratamiento se restrinja mientras se resuelve
            una impugnación.
          </li>
          <li>
            <strong>Portabilidad.</strong> Recibir los datos en un formato estructurado y de uso
            común, o pedir que se transmitan a otro responsable.
          </li>
          <li>
            <strong>Retirar el consentimiento</strong> en cualquier momento, cuando el tratamiento
            se base en él, sin que afecte a la licitud del tratamiento anterior.
          </li>
        </ul>

        <h3>Cómo ejercerlos</h3>
        <p>
          A través del gestor patrimonial que dio de alta la cartera, indicando qué derecho se quiere ejercer y
          acompañando una copia de un documento que acredite la identidad. La solicitud se responde
          en el plazo de un mes, prorrogable por dos más si su complejidad lo exige, en cuyo caso se
          avisará dentro del primer mes.
        </p>
        <p>
          Si el acceso a PortCodex se obtuvo a través de un gestor patrimonial, la solicitud también
          puede dirigirse a él. Como se ha advertido en la primera sección, el reparto de papeles
          entre PortCodex y el gestor está pendiente de cierre jurídico; en la práctica, escribir a
          cualquiera de los dos vale, y la solicitud se encauzará a quien corresponda.
        </p>
      </>
    ),
  },
  {
    id: "reclamacion",
    title: "Reclamación ante la autoridad de control",
    body: (
      <>
        <p>
          Si consideras que el tratamiento de tus datos no se ajusta a la normativa, o si no
          quedaste satisfecho con la respuesta a un derecho, puedes presentar una reclamación ante
          la <strong>Agencia Española de Protección de Datos</strong>, que es la autoridad de
          control competente en España.
        </p>
        <div className={styles.entries}>
          <div className={styles.entry}>
            <p className={styles.entryName}>Agencia Española de Protección de Datos</p>
            <div className={styles.entryRows}>
              <p className={styles.entryLabel}>Sede electrónica</p>
              <p className={styles.entryValue}>
                <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
                  www.aepd.es
                </a>
              </p>
              <p className={styles.entryLabel}>Dirección</p>
              <p className={styles.entryValue}>C/ Jorge Juan, 6 — 28001 Madrid</p>
            </div>
          </div>
        </div>
        <p>
          No hace falta haber reclamado antes al responsable para acudir a la Agencia, aunque
          escribir primero suele ser más rápido.
        </p>
      </>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    body: (
      <p>
        Esta política se actualizará cuando cambien los tratamientos, los proveedores o la normativa
        aplicable. La versión vigente es siempre la publicada en esta página, con su fecha de
        actualización en la cabecera. Si un cambio afectara de forma sustancial al tratamiento, se
        comunicará por los medios de contacto disponibles y no solo mediante esta publicación.
      </p>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <LegalDocument
      title="Política de privacidad"
      standfirst="Qué datos trata PortCodex, de dónde salen, con qué base jurídica, a quién se comunican y cómo ejercer tus derechos."
      sections={SECTIONS}
      href={doc.href}
    />
  );
}
