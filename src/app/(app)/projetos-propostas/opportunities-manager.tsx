"use client";

import { FolderKanban, SearchX, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import type { ProfessionalOption } from "@/lib/contacts/queries";
import {
  getOpportunityAction,
  getOpportunityDetailsAction,
  moveOpportunityStatusAction,
} from "@/lib/opportunities/actions";
import { opportunityTitle } from "@/lib/opportunities/format";
import {
  PAGE_SIZE,
  type Opportunity,
  type OpportunityDetails as OpportunityDetailsData,
  type OpportunityFilters,
  type OpportunityStatus,
  type OpportunityStore,
} from "@/lib/opportunities/types";

import { OpportunitiesToolbar } from "./opportunities-toolbar";
import { OpportunityDetails } from "./opportunity-details";
import { OpportunityForm } from "./opportunity-form";
import { OpportunityList } from "./opportunity-list";
import { StatusDialog, type StatusIntent } from "./status-dialog";

type OpportunitiesManagerProps = {
  opportunities: Opportunity[];
  professionals: ProfessionalOption[];
  /** Lojas ativas, oferecidas no formulário. */
  activeStores: OpportunityStore[];
  /** Todas as lojas, para o filtro da listagem. */
  allStores: OpportunityStore[];
  professionalName: string | null;
  filters: OpportunityFilters;
  filteredCount: number;
  totalCount: number;
  page: number;
  pageCount: number;
  loadError: string | null;
};

type Panel =
  | null
  | { mode: "new" }
  | { mode: "edit"; opportunity: Opportunity }
  | { mode: "details"; opportunity: Opportunity };

type DialogState = null | { opportunity: Opportunity; intent: StatusIntent };

export function OpportunitiesManager({
  opportunities,
  professionals,
  activeStores,
  allStores,
  professionalName,
  filters,
  filteredCount,
  totalCount,
  page,
  pageCount,
  loadError,
}: OpportunitiesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingStatus, setPendingStatus] = useState<OpportunityStatus | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const [details, setDetails] = useState<OpportunityDetailsData | null>(null);
  const [detailsToken, setDetailsToken] = useState(0);

  const detailsId = panel?.mode === "details" ? panel.opportunity.id : null;

  // Zera o que estava carregado ao trocar de projeto ajustando o estado
  // durante a renderização, em vez de num efeito.
  const [loadedFor, setLoadedFor] = useState(detailsId);
  if (detailsId !== loadedFor) {
    setLoadedFor(detailsId);
    setDetails(null);
  }

  /**
   * Histórico e anexos são carregados só quando o detalhe abre — a listagem
   * não precisa deles. O token força o recarregamento depois de uma
   * movimentação ou de uma mudança nos anexos, mantendo o conteúdo anterior
   * na tela enquanto a nova versão chega.
   */
  useEffect(() => {
    if (!detailsId) return;

    let active = true;

    getOpportunityDetailsAction(detailsId).then((result) => {
      if (active) setDetails(result);
    });

    return () => {
      active = false;
    };
  }, [detailsId, detailsToken]);

  const closePanel = useCallback(() => setPanel(null), []);

  /** Recarrega o projeto aberto para refletir o que o banco gravou. */
  const refreshOpenOpportunity = useCallback(async (id: string) => {
    const fresh = await getOpportunityAction(id);
    if (fresh) setPanel({ mode: "details", opportunity: fresh });
    setDetailsToken((token) => token + 1);
  }, []);

  const handleSaved = useCallback(
    (message: string) => {
      setPanel(null);
      showToast("success", message);
    },
    [showToast],
  );

  const handleMove = useCallback(
    (target: OpportunityStatus) => {
      if (panel?.mode !== "details") return;
      const id = panel.opportunity.id;

      setPendingStatus(target);

      startTransition(async () => {
        const result = await moveOpportunityStatusAction(id, target);
        setPendingStatus(null);
        showToast(result.ok ? "success" : "error", result.message);
        if (result.ok) await refreshOpenOpportunity(id);
      });
    },
    [panel, refreshOpenOpportunity, showToast],
  );

  const handleDialogDone = useCallback(
    (message: string) => {
      const id = dialog?.opportunity.id ?? null;
      setDialog(null);
      showToast("success", message);

      if (id) {
        startTransition(async () => {
          await refreshOpenOpportunity(id);
        });
      }
    },
    [dialog, refreshOpenOpportunity, showToast],
  );

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
        title="Não foi possível carregar os projetos"
        message={loadError}
      />
    );
  }

  const hasAnyOpportunity = totalCount > 0;

  return (
    <>
      {hasAnyOpportunity ? (
        <OpportunitiesToolbar
          filters={filters}
          stores={allStores}
          professionalName={professionalName}
          resultCount={filteredCount}
          onNewOpportunity={() => setPanel({ mode: "new" })}
        />
      ) : null}

      {!hasAnyOpportunity ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto registrado"
          description="Quando um profissional solicitar um projeto ou orçamento, registre a oportunidade aqui. Cada projeto liga um profissional a uma única loja."
          action={
            <Button onClick={() => setPanel({ mode: "new" })}>
              Novo projeto
            </Button>
          }
        />
      ) : opportunities.length === 0 ? (
        <EmptyState
          icon={SearchX}
          tone="neutral"
          title="Nenhum projeto encontrado"
          description="Nenhum resultado para os filtros aplicados. Ajuste a busca ou volte a ver todos os projetos."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
          <OpportunityList
            opportunities={opportunities}
            onOpenDetails={(opportunity) =>
              setPanel({ mode: "details", opportunity })
            }
            onEdit={(opportunity) => setPanel({ mode: "edit", opportunity })}
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
        title={panelTitle(panel)}
        description={panelDescription(panel)}
      >
        {panel?.mode === "details" ? (
          <OpportunityDetails
            opportunity={panel.opportunity}
            details={details}
            pendingStatus={pendingStatus}
            onEdit={() =>
              setPanel({ mode: "edit", opportunity: panel.opportunity })
            }
            onMove={handleMove}
            onOpenStatusDialog={(target) =>
              setDialog({
                opportunity: panel.opportunity,
                intent: { kind: "move", target },
              })
            }
            onCorrectStatus={() =>
              setDialog({
                opportunity: panel.opportunity,
                intent: { kind: "correct" },
              })
            }
            onDetailsChanged={() => setDetailsToken((token) => token + 1)}
          />
        ) : panel !== null ? (
          <OpportunityForm
            // Recria o formulário ao trocar de projeto, zerando os campos.
            key={panel.mode === "new" ? "new" : panel.opportunity.id}
            opportunity={panel.mode === "new" ? null : panel.opportunity}
            professionals={professionals}
            stores={
              panel.mode === "edit"
                ? withStore(activeStores, panel.opportunity.store)
                : activeStores
            }
            onSaved={handleSaved}
            onCancel={closePanel}
          />
        ) : null}
      </SlideOver>

      {dialog ? (
        <StatusDialog
          key={`${dialog.opportunity.id}-${dialog.intent.kind === "move" ? dialog.intent.target : "correcao"}`}
          open
          opportunity={dialog.opportunity}
          intent={dialog.intent}
          onDone={handleDialogDone}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Garante que a loja já vinculada apareça na edição mesmo depois de inativada.
 * Sem isso, corrigir um projeto histórico apagaria o vínculo com a loja.
 */
function withStore(
  stores: OpportunityStore[],
  store: OpportunityStore | null,
): OpportunityStore[] {
  if (!store || stores.some((option) => option.id === store.id)) return stores;

  return [...stores, store].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function panelTitle(panel: Panel): string {
  if (panel?.mode === "details") return opportunityTitle(panel.opportunity);
  if (panel?.mode === "edit") return "Editar projeto";
  return "Novo projeto";
}

function panelDescription(panel: Panel): string | undefined {
  if (panel?.mode === "details" || panel?.mode === "edit") {
    const { professional, store } = panel.opportunity;
    return [professional?.name, store?.name].filter(Boolean).join(" · ");
  }

  return "Registre uma demanda concreta de um profissional para uma loja.";
}
