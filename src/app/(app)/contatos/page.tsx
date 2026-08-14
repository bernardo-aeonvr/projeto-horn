import type { Metadata } from "next";

import {
  listActiveStores,
  listAllStores,
  listContacts,
  listProfessionalOptions,
} from "@/lib/contacts/queries";
import {
  parseChannel,
  parsePage,
  parsePeriod,
  type ContactFilters,
} from "@/lib/contacts/types";

import { ContactsManager } from "./contacts-manager";

export const metadata: Metadata = { title: "Contatos" };

type ContatosPageProps = {
  searchParams: Promise<{
    q?: string;
    canal?: string;
    periodo?: string;
    de?: string;
    ate?: string;
    loja?: string;
    pagina?: string;
  }>;
};

export default async function ContatosPage({ searchParams }: ContatosPageProps) {
  const params = await searchParams;

  const filters: ContactFilters = {
    q: params.q?.trim() ?? "",
    channel: parseChannel(params.canal),
    period: parsePeriod(params.periodo),
    from: params.de?.trim() ?? "",
    to: params.ate?.trim() ?? "",
    storeId: params.loja?.trim() ?? "",
    page: parsePage(params.pagina),
  };

  const [list, professionals, activeStores, allStores] = await Promise.all([
    listContacts(filters),
    listProfessionalOptions(),
    listActiveStores(),
    listAllStores(),
  ]);

  return (
    <ContactsManager
      contacts={list.contacts}
      professionals={professionals}
      activeStores={activeStores}
      allStores={allStores}
      filters={filters}
      filteredCount={list.filteredCount}
      totalCount={list.totalCount}
      page={list.page}
      pageCount={list.pageCount}
      loadError={list.error}
    />
  );
}
