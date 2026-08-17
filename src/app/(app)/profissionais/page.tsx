import type { Metadata } from "next";

import { listOpportunityStoreOptions } from "@/lib/opportunities/queries";
import {
  listProfessionals,
  listRegions,
  listSegments,
} from "@/lib/professionals/queries";
import {
  parsePage,
  parseProfessionalStatus,
  type ProfessionalFilters,
} from "@/lib/professionals/types";

import { ProfessionalsManager } from "./professionals-manager";

export const metadata: Metadata = { title: "Profissionais" };

type ProfissionaisPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    segmento?: string;
    regiao?: string;
    pagina?: string;
  }>;
};

export default async function ProfissionaisPage({
  searchParams,
}: ProfissionaisPageProps) {
  const params = await searchParams;

  // Os filtros vivem na URL: a consulta e a paginação acontecem no banco.
  const filters: ProfessionalFilters = {
    q: params.q?.trim() ?? "",
    status: parseProfessionalStatus(params.status),
    segmentId: params.segmento?.trim() ?? "",
    regionId: params.regiao?.trim() ?? "",
    page: parsePage(params.pagina),
  };

  const [list, segments, regions, activeStores] = await Promise.all([
    listProfessionals(filters),
    listSegments(),
    listRegions(),
    // Usadas na ficha para marcar as lojas apresentadas em um contato e para
    // escolher a loja de um projeto novo. O percentual de comissão vem junto
    // para o formulário de projeto explicar o que ficará gravado.
    listOpportunityStoreOptions(),
  ]);

  return (
    <ProfessionalsManager
      professionals={list.professionals}
      segments={segments}
      regions={regions}
      activeStores={activeStores}
      filters={filters}
      filteredCount={list.filteredCount}
      totalCount={list.totalCount}
      page={list.page}
      pageCount={list.pageCount}
      loadError={list.error}
    />
  );
}
