import type { Metadata } from "next";

import { requireSessionUser } from "@/lib/auth/session";
import { listProfessionalOptions } from "@/lib/contacts/queries";
import { parsePeriod } from "@/lib/contacts/types";
import {
  listAllStoreOptions,
  listOpportunities,
  listOpportunityStoreOptions,
  listStoreOpportunities,
  listStoreProfessionalOptions,
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
  const [params, user] = await Promise.all([searchParams, requireSessionUser()]);

  const isAdmin = user.role === "admin";

  // Os filtros vivem na URL: a consulta e a paginação acontecem no banco.
  const filters: OpportunityFilters = {
    q: params.q?.trim() ?? "",
    status: parseStatusFilter(params.status),
    /*
      O filtro de loja é um recurso administrativo. Para o usuário de loja ele
      é descartado: o recorte vem do perfil dele, e a função do banco não
      aceita loja por parâmetro — mandar `?loja=` de outra loja não muda nada.
    */
    storeId: isAdmin ? (params.loja?.trim() ?? "") : "",
    professionalId: params.profissional?.trim() ?? "",
    period: parsePeriod(params.periodo),
    from: params.de?.trim() ?? "",
    to: params.ate?.trim() ?? "",
    page: parsePage(params.pagina),
  };

  if (!isAdmin) {
    const [list, professionals] = await Promise.all([
      listStoreOpportunities(filters),
      listStoreProfessionalOptions(),
    ]);

    const professionalName = filters.professionalId
      ? (professionals.find(
          (professional) => professional.id === filters.professionalId,
        )?.name ?? null)
      : null;

    return (
      <OpportunitiesManager
        canManage={false}
        opportunities={list.opportunities}
        professionals={[]}
        activeStores={[]}
        allStores={[]}
        professionalName={professionalName}
        filters={filters}
        filteredCount={list.filteredCount}
        totalCount={list.totalCount}
        statusCounts={list.statusCounts}
        page={list.page}
        pageCount={list.pageCount}
        loadError={list.error}
      />
    );
  }

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
      canManage
      opportunities={list.opportunities}
      professionals={professionals}
      activeStores={activeStores}
      allStores={allStores}
      professionalName={professionalName}
      filters={filters}
      filteredCount={list.filteredCount}
      totalCount={list.totalCount}
      statusCounts={list.statusCounts}
      page={list.page}
      pageCount={list.pageCount}
      loadError={list.error}
    />
  );
}
