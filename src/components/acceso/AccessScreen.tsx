import { AccessBrandPanel, type AccessBrandPanelProps } from "./AccessBrandPanel";
import { AccessForm, type AccessFormProps } from "./AccessForm";

/**
 * Pantalla de Acceso completa.
 *
 * Partida ASIMÉTRICA 58/42, no dos mitades. La simetría diría que las dos
 * columnas pesan igual; aquí no: la izquierda explica qué es esto —para quien
 * llega por primera vez— y la derecha resuelve la tarea en cuatro gestos. La
 * asimetría es lo que las jerarquiza sin necesidad de un marco ni una sombra.
 *
 * El fondo cambia de nivel entre columnas (obsidiana → navy): es lo que separa
 * los dos territorios, sin filo ni tarjeta.
 *
 * Toda la lógica de autenticación entra por props (`onSubmit`, `errorMessage`,
 * `isSubmitting`): esta pieza no sabe que existe Supabase.
 *
 * Medidas tomadas de web/design/06-acceso.html.
 */

export interface AccessScreenProps extends AccessFormProps {
  brand?: AccessBrandPanelProps;
}

export function AccessScreen({ brand, ...form }: AccessScreenProps) {
  return (
    <main
      className="pcx-screen grid pcx-cols-narrow"
      style={{
        gridTemplateColumns: "58fr 42fr",
        // La maqueta fija 660 px de alto mínimo; en producción la pantalla ocupa
        // el alto disponible, con ese 660 como suelo.
        minHeight: "max(100vh, 660px)",
        background: "var(--void-deep)",
      }}
    >
      <AccessBrandPanel {...brand} />

      <div
        className="flex flex-col items-center justify-center"
        style={{ padding: "clamp(32px, 7vw, 56px) clamp(20px, 6vw, 48px)", background: "var(--void-surface)" }}
      >
        <AccessForm {...form} />
      </div>
    </main>
  );
}
