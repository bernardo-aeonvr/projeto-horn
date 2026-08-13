import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Profissionais" };

export default function ProfissionaisPage() {
  return (
    <PagePlaceholder
      href="/profissionais"
      summary="Aqui ficará a base de profissionais, com busca por nome, filtros por segmento, região e status, cadastro, edição, inativação e as ações rápidas de registrar contato e criar projeto."
    />
  );
}
