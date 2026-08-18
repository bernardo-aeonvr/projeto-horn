"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import type { StoreAccess } from "@/lib/stores/access";
import { setStoreActiveAction } from "@/lib/stores/actions";
import type { Store, StoreFilters } from "@/lib/stores/types";

import {
  NoStoresFound,
  NoStoresYet,
  StoresLoadError,
} from "./store-empty-states";
import { StoreAccessPanel } from "./store-access-panel";
import { StoreForm } from "./store-form";
import { StoreList } from "./store-list";
import { StoresToolbar } from "./stores-toolbar";

type StoresManagerProps = {
  stores: Store[];
  categories: string[];
  filters: StoreFilters;
  /** Total de lojas sem filtro — separa "base vazia" de "busca sem resultado". */
  totalCount: number;
  loadError: string | null;
  /** Acessos já provisionados, indexados pelo id da loja. */
  accessByStore: Record<string, StoreAccess[]>;
  /** `false` quando falta a credencial administrativa no servidor. */
  canProvisionAccess: boolean;
};

/** Painel lateral: fechado, cadastro, edição ou acesso da loja. */
type PanelState =
  | null
  | { mode: "new" }
  | { mode: "edit"; store: Store }
  | { mode: "access"; store: Store };

export function StoresManager({
  stores,
  categories,
  filters,
  totalCount,
  loadError,
  accessByStore,
  canProvisionAccess,
}: StoresManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<PanelState>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const closePanel = useCallback(() => setPanel(null), []);

  // Recarrega a listagem do servidor depois de mexer em um acesso, mantendo o
  // painel aberto para o administrador copiar o link.
  const refreshAccess = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleSaved = useCallback(
    (message: string) => {
      setPanel(null);
      showToast("success", message);
    },
    [showToast],
  );

  const handleToggleActive = useCallback(
    (store: Store) => {
      setTogglingId(store.id);

      startTransition(async () => {
        const result = await setStoreActiveAction(store.id, !store.is_active);
        setTogglingId(null);
        showToast(result.ok ? "success" : "error", result.message);
      });
    },
    [showToast],
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  if (loadError) {
    return <StoresLoadError message={loadError} />;
  }

  const hasAnyStore = totalCount > 0;

  return (
    <>
      {hasAnyStore ? (
        <StoresToolbar
          filters={filters}
          categories={categories}
          resultCount={stores.length}
          onNewStore={() => setPanel({ mode: "new" })}
        />
      ) : null}

      {!hasAnyStore ? (
        <NoStoresYet onCreate={() => setPanel({ mode: "new" })} />
      ) : stores.length === 0 ? (
        <NoStoresFound onClearFilters={clearFilters} />
      ) : (
        <StoreList
          stores={stores}
          accessByStore={accessByStore}
          onEdit={(store) => setPanel({ mode: "edit", store })}
          onManageAccess={(store) => setPanel({ mode: "access", store })}
          onToggleActive={handleToggleActive}
          pendingId={togglingId}
        />
      )}

      <SlideOver
        open={panel !== null}
        onClose={closePanel}
        title={panelTitle(panel)}
        description={panelDescription(panel)}
      >
        {panel?.mode === "access" ? (
          <StoreAccessPanel
            key={panel.store.id}
            store={panel.store}
            accesses={accessByStore[panel.store.id] ?? []}
            canProvision={canProvisionAccess}
            onChanged={refreshAccess}
          />
        ) : panel !== null ? (
          <StoreForm
            // Recria o formulário ao trocar de loja, zerando os campos.
            key={panel.mode === "new" ? "new" : panel.store.id}
            store={panel.mode === "new" ? null : panel.store}
            categories={categories}
            onSaved={handleSaved}
            onCancel={closePanel}
          />
        ) : null}
      </SlideOver>
    </>
  );
}

function panelTitle(panel: PanelState): string {
  if (panel?.mode === "access") return "Acesso da loja";
  if (panel?.mode === "edit") return "Editar loja";
  return "Nova loja";
}

function panelDescription(panel: PanelState): string {
  if (panel?.mode === "access" || panel?.mode === "edit") return panel.store.name;
  return "Cadastre uma empresa representada pela HORN.";
}
