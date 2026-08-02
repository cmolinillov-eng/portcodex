import Image from "next/image";
import styles from "./landing.module.css";

/** Alto de la barra de navegación del producto, en píxeles CSS (`--nav-h`).
 *
 *  Se recorta de todas las capturas. Dos razones, la primera es la que manda:
 *
 *  1. En esa banda aparece el selector de cartera con el nombre «M Fita», que es
 *     una persona. Las CIFRAS de `/preview` son de la maqueta y no son suyas,
 *     pero el rótulo se las atribuye, y eso no puede salir en una portada
 *     pública. PENDIENTE: cambiar `portfolioName` en `src/app/preview/**` por un
 *     nombre neutro y volver a tomar las cuatro capturas; entonces este recorte
 *     puede quitarse y se gana la barra de navegación como prueba.
 *  2. Cuatro capturas seguidas con la misma banda de navegación repiten el mismo
 *     elemento cuatro veces al bajar. Recortada, cada placa es una ventana al
 *     contenido y no un cromo del navegador.
 */
const NAV_CROP_PX = 56;

export function ProductPlate({
  src,
  /** Ancho en píxeles CSS de la captura (1440, tomada a 2x). */
  width,
  /** Alto en píxeles CSS de la captura, barra de navegación incluida. */
  height,
  alt,
  caption,
  priority = false,
  small = false,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  priority?: boolean;
  small?: boolean;
}) {
  const visibleHeight = height - NAV_CROP_PX;

  return (
    <figure className={`${styles.plate} ${small ? styles.plateSmall : ""}`.trim()}>
      <div
        className={styles.plateCrop}
        // La relación de aspecto reserva el hueco exacto antes de que la imagen
        // llegue: el diseño no salta al cargar.
        style={{ aspectRatio: `${width} / ${visibleHeight}` }}
      >
        <Image
          src={src}
          // Las capturas son de 2880 px (1440 a 2x). Se declara el tamaño real
          // para que Next genere las variantes correctas.
          width={width * 2}
          height={height * 2}
          alt={alt}
          priority={priority}
          sizes="(max-width: 900px) 100vw, 1200px"
          className={styles.plateImg}
          // Margen negativo en PORCENTAJE: se mide contra el ancho del
          // contenedor, así el recorte sigue siendo de 56 px de captura en
          // cualquier tamaño de pantalla.
          style={{ marginTop: `${(-NAV_CROP_PX / width) * 100}%` }}
        />
      </div>
      <figcaption className={styles.plateCaption}>{caption}</figcaption>
    </figure>
  );
}
