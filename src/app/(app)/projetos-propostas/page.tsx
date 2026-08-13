import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Projetos & Propostas" };

export default function ProjetosPropostasPage() {
  return (
    <PagePlaceholder
      href="/projetos-propostas"
      summary="Aqui ficarão as oportunidades ligadas a um profissional e uma loja, com o estágio atual, a timeline de mudanças de status, os valores inicial e fechado, a comissão e os PDFs das propostas."
    />
  );
}
