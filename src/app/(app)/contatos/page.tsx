import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Contatos" };

export default function ContatosPage() {
  return (
    <PagePlaceholder
      href="/contatos"
      summary="Aqui ficará o histórico de contatos realizados: profissional, data e hora, canal, observação e o registro histórico das lojas apresentadas em cada contato."
    />
  );
}
