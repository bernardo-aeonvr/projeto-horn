"use client";

import { PhoneCall, SearchX, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { deleteContactAction } from "@/lib/contacts/actions";
import { formatContactedAt } from "@/lib/contacts/period";
import type {
  ProfessionalOption,
  StoreOption,
} from "@/lib/contacts/queries";
import {
  PAGE_SIZE,
  type Contact,
  type ContactFilters,
} from "@/lib/contacts/types";

import { ContactForm } from "./contact-form";
import { ContactList } from "./contact-list";
import { ContactsToolbar } from "./contacts-toolbar";

type ContactsManagerProps = {
  contacts: Contact[];
  professionals: ProfessionalOption[];
  activeStores: StoreOption[];
  allStores: StoreOption[];
  filters: ContactFilters;
  filteredCount: number;
  totalCount: number;
  page: number;
  pageCount: number;
  loadError: string | null;
};

type Panel = null | { mode: "new" } | { mode: "edit"; contact: Contact };

export function ContactsManager({
  contacts,
  professionals,
  activeStores,
  allStores,
  filters,
  filteredCount,
  totalCount,
  page,
  pageCount,
  loadError,
}: ContactsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<Panel>(null);
  const [toDelete, setToDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();

  const closePanel = useCallback(() => setPanel(null), []);

  const handleSaved = useCallback(
    (message: string) => {
      setPanel(null);
      showToast("success", message);
    },
    [showToast],
  );

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    setDeleting(true);

    startTransition(async () => {
      const result = await deleteContactAction(toDelete.id);
      setDeleting(false);
      setToDelete(null);
      showToast(result.ok ? "success" : "error", result.message);
    });
  }, [toDelete, showToast]);

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams);
      if (nextPage <= 1) params.delete("pagina");
      else params.set("pagina", String(nextPage));

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  if (loadError) {
    return (
      <ErrorState
        icon={TriangleAlert}
        title="Não foi possível carregar os contatos"
        message={loadError}
      />
    );
  }

  const hasAnyContact = totalCount > 0;

  return (
    <>
      {hasAnyContact ? (
        <ContactsToolbar
          filters={filters}
          stores={allStores}
          resultCount={filteredCount}
          onNewContact={() => setPanel({ mode: "new" })}
        />
      ) : null}

      {!hasAnyContact ? (
        <EmptyState
          icon={PhoneCall}
          title="Nenhum contato registrado"
          description="Registre o primeiro contato realizado com um profissional. Cadastrar alguém na carteira não conta como contato — só a apresentação da HORN e das lojas conta."
          action={
            <Button onClick={() => setPanel({ mode: "new" })}>
              Registrar contato
            </Button>
          }
        />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={SearchX}
          tone="neutral"
          title="Nenhum contato encontrado"
          description="Nenhum resultado para os filtros aplicados. Ajuste a busca ou volte a ver todo o histórico."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
          <ContactList
            contacts={contacts}
            onEdit={(contact) => setPanel({ mode: "edit", contact })}
            onDelete={setToDelete}
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={filteredCount}
            pageSize={PAGE_SIZE}
            onPageChange={goToPage}
            pending={pending}
          />
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={closePanel}
        title={panel?.mode === "edit" ? "Editar contato" : "Registrar contato"}
        description={
          panel?.mode === "edit"
            ? (panel.contact.professional?.name ?? undefined)
            : "Registre uma apresentação já realizada a um profissional."
        }
      >
        {panel !== null ? (
          <ContactForm
            key={panel.mode === "new" ? "new" : panel.contact.id}
            contact={panel.mode === "new" ? null : panel.contact}
            professionals={professionals}
            activeStores={activeStores}
            onSaved={handleSaved}
            onCancel={closePanel}
          />
        ) : null}
      </SlideOver>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir este registro de contato?"
        description={
          toDelete
            ? `Essa ação removerá o contato com ${toDelete.professional?.name ?? "este profissional"} de ${formatContactedAt(toDelete.contacted_at)} do histórico e dos indicadores futuros.`
            : ""
        }
        confirmLabel="Excluir contato"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
