import { FiscalPageHeader } from "@/components/fiscal/FiscalPageHeader";
import { GlosarioClient } from "@/components/fiscal/GlosarioClient";

export default function GlosarioPage() {
  return (
    <>
      <FiscalPageHeader title="Glosario fiscal" subtitle="Conceptos, casillas y modelos AEAT explicados" />
      <GlosarioClient />
    </>
  );
}
