import { notFound } from "next/navigation";
import { AccesoDemo, type EstadoAcceso } from "./acceso-demo";

/**
 * Banco de pruebas de la pantalla de Acceso, con los datos exactos de
 * web/design/06-acceso.html. Nunca se sirve en producción.
 *
 * `?estado=vacio|enviando|error` fuerza cada estado del formulario para poder
 * revisarlos sin credenciales.
 */
export default async function PreviewAcceso({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { estado } = await searchParams;
  const valid: EstadoAcceso[] = ["vacio", "enviando", "error"];
  const current = valid.includes(estado as EstadoAcceso) ? (estado as EstadoAcceso) : "vacio";

  return <AccesoDemo estado={current} />;
}
