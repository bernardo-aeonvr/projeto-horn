import type { Metadata } from "next";

import { listStoreCategories, listStores } from "@/lib/stores/queries";
import { parseStatusFilter, type StoreFilters } from "@/lib/stores/types";

import { StoresManager } from "./stores-manager";

export const metadata: Metadata = { title: "Lojas" };

type LojasPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    segmento?: string;
  }>;
};

export default async function LojasPage({ searchParams }: LojasPageProps) {
  const params = await searchParams;

  // Os filtros vivem na URL, então a listagem é sempre consultada no servidor.
  const filters: StoreFilters = {
    q: params.q?.trim() ?? "",
    status: parseStatusFilter(params.status),
    category: params.segmento?.trim() ?? "",
  };

  const [{ stores, totalCount, error }, categories] = await Promise.all([
    listStores(filters),
    listStoreCategories(),
  ]);

  return (
    <StoresManager
      stores={stores}
      categories={categories}
      filters={filters}
      totalCount={totalCount}
      loadError={error}
    />
  );
}
