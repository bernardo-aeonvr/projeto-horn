import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PagePlaceholder
      href="/dashboard"
      summary="Aqui ficarão os indicadores da carteira, a atividade do período, os valores propostos e fechados, a comissão gerada e os filtros por período, loja, segmento e região."
    />
  );
}
