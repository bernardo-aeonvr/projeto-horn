import type { Metadata } from "next";

import { listProfessionalOptions } from "@/lib/contacts/queries";
import { parsePeriod } from "@/lib/contacts/types";
import {
  listAllStoreOptions,
  listOpportunities,
  listOpportunityStoreOptions,
} from "@/lib/opportunities/queries";
import {
  parsePage,
  parseStatusFilter,
  type OpportunityFilters,
} from "@/lib/opportunities/types";

import { OpportunitiesManager } from "./opportunities-manager";

export const metadata: Metadata = { title: "Projetos & Propostas" };

type ProjetosPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    loja?: string;
    profissional?: string;
    periodo?: string;
    de?: string;
    ate?: string;
    pagina?: string;
  }>;
};

export default async function ProjetosPropostasPage({
  searchParams,
}: ProjetosPageProps) {
  const params = await searchParams;

  // Os filtros vivem na URL: a consulta e a paginação acontecem no banco.
  const filters: OpportunityFilters = {
    q: params.q?.trim() ?? "",
    status: parseStatusFilter(params.status),
    storeId: params.loja?.trim() ?? "",
    professionalId: params.profissional?.trim() ?? "",
    period: parsePeriod(params.periodo),
    from: params.de?.trim() ?? "",
    to: params.ate?.trim() ?? "",
    page: parsePage(params.pagina),
  };

  const [list, professionals, activeStores, allStores] = await Promise.all([
    listOpportunities(filters),
    // O profissional filtrado entra na lista mesmo se estiver inativo, para
    // que o nome apareça no chip do filtro.
    listProfessionalOptions(filters.professionalId || null),
    listOpportunityStoreOptions(),
    listAllStoreOptions(),
  ]);

  const professionalName = filters.professionalId
    ? (professionals.find(
        (professional) => professional.id === filters.professionalId,
      )?.name ?? null)
    : null;

  return (
    <OpportunitiesManager
      opportunities={list.opportunities}
      professionals={professionals}
      activeStores={activeStores}
      allStores={allStores}
      professionalName={professionalName}
      filters={filters}
      filteredCount={list.filteredCount}
      totalCount={list.totalCount}
      page={list.page}
      pageCount={list.pageCount}
      loadError={list.error}
    />
  );
}
