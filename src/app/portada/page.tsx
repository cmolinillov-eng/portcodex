import { permanentRedirect } from "next/navigation";

/**
 * `/portada` fue la ruta provisional de la portada mientras la raíz servía el
 * dashboard. Ahora la portada ES la raíz, así que esto solo redirige.
 *
 * Redirección PERMANENTE y no un duplicado: dos URLs con el mismo contenido se
 * reparten el posicionamiento y ninguna gana.
 */
export default function PortadaPage() {
  permanentRedirect("/");
}
