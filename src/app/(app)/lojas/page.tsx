import type { Metadata } from "next";

import { requireAdminUser } from "@/lib/auth/session";
import { listStoreAccess } from "@/lib/stores/access";
import { listStoreCategories, listStores } from "@/lib/stores/queries";
import {
  parsePage,
  parseStatusFilter,
  type StoreFilters,
} from "@/lib/stores/types";
import { isAdminApiConfigured } from "@/lib/supabase/admin";

import { StoresManager } from "./stores-manager";

export const metadata: Metadata = { title: "Lojas" };

type LojasPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    segmento?: string;
    pagina?: string;
  }>;
};

export default async function LojasPage({ searchParams }: LojasPageProps) {
  // Cadastro, comissão, valor fixo e status são exclusivos da HORN — nem
  // mesmo a própria loja edita o próprio registro (spec, seção 4.2).
  await requireAdminUser();

  const params = await searchParams;

  // Os filtros vivem na URL, então a listagem é sempre consultada no servidor.
  const filters: StoreFilters = {
    q: params.q?.trim() ?? "",
    status: parseStatusFilter(params.status),
    category: params.segmento?.trim() ?? "",
    page: parsePage(params.pagina),
  };

  const [list, categories, accessByStore] = await Promise.all([
    listStores(filters),
    listStoreCategories(),
    listStoreAccess(),
  ]);

  const { stores, filteredCount, totalCount, page, pageCount, error } = list;

  // Só os acessos das lojas realmente listadas atravessam para o cliente: o
  // painel só abre a partir de uma linha da lista, e o e-mail de login de uma
  // loja fora da página não tem por que viajar junto.
  const visibleAccess = Object.fromEntries(
    stores.map((store) => [store.id, accessByStore.get(store.id) ?? []]),
  );

  return (
    <StoresManager
      stores={stores}
      categories={categories}
      filters={filters}
      filteredCount={filteredCount}
      totalCount={totalCount}
      page={page}
      pageCount={pageCount}
      loadError={error}
      accessByStore={visibleAccess}
      // Sem a credencial administrativa dá para consultar e ativar/desativar,
      // mas não criar conta nem gerar link.
      canProvisionAccess={isAdminApiConfigured()}
    />
  );
}
