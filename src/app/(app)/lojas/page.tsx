import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Lojas" };

export default function LojasPage() {
  return (
    <PagePlaceholder
      href="/lojas"
      summary="Aqui ficará o cadastro das lojas representadas, com segmento, responsável, status ativa/inativa, valor fixo mensal e percentual de comissão."
    />
  );
}
