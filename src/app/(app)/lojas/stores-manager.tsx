"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { setStoreActiveAction } from "@/lib/stores/actions";
import type { Store, StoreFilters } from "@/lib/stores/types";

import {
  NoStoresFound,
  NoStoresYet,
  StoresLoadError,
} from "./store-empty-states";
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
};

/** `null` = painel fechado; `"new"` = cadastro; um objeto = edição. */
type PanelState = null | "new" | Store;

export function StoresManager({
  stores,
  categories,
  filters,
  totalCount,
  loadError,
}: StoresManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<PanelState>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const closePanel = useCallback(() => setPanel(null), []);

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
          onNewStore={() => setPanel("new")}
        />
      ) : null}

      {!hasAnyStore ? (
        <NoStoresYet onCreate={() => setPanel("new")} />
      ) : stores.length === 0 ? (
        <NoStoresFound onClearFilters={clearFilters} />
      ) : (
        <StoreList
          stores={stores}
          onEdit={(store) => setPanel(store)}
          onToggleActive={handleToggleActive}
          pendingId={togglingId}
        />
      )}

      <SlideOver
        open={panel !== null}
        onClose={closePanel}
        title={panel === "new" || panel === null ? "Nova loja" : "Editar loja"}
        description={
          panel === "new" || panel === null
            ? "Cadastre uma empresa representada pela HORN."
            : panel.name
        }
      >
        {panel !== null ? (
          <StoreForm
            // Recria o formulário ao trocar de loja, zerando os campos.
            key={panel === "new" ? "new" : panel.id}
            store={panel === "new" ? null : panel}
            categories={categories}
            onSaved={handleSaved}
            onCancel={closePanel}
          />
        ) : null}
      </SlideOver>
    </>
  );
}
