"use client";

import { SearchX, TriangleAlert, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { setProfessionalActiveAction } from "@/lib/professionals/actions";
import {
  PAGE_SIZE,
  type Professional,
  type ProfessionalFilters,
  type Region,
  type Segment,
} from "@/lib/professionals/types";

import { ProfessionalDetails } from "./professional-details";
import { ProfessionalForm } from "./professional-form";
import { ProfessionalList } from "./professional-list";
import { ProfessionalsToolbar } from "./professionals-toolbar";

type ProfessionalsManagerProps = {
  professionals: Professional[];
  segments: Segment[];
  regions: Region[];
  filters: ProfessionalFilters;
  filteredCount: number;
  totalCount: number;
  page: number;
  pageCount: number;
  loadError: string | null;
};

type Panel =
  | null
  | { mode: "new" }
  | { mode: "edit"; professional: Professional }
  | { mode: "details"; professional: Professional };

export function ProfessionalsManager({
  professionals,
  segments,
  regions,
  filters,
  filteredCount,
  totalCount,
  page,
  pageCount,
  loadError,
}: ProfessionalsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<Panel>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closePanel = useCallback(() => setPanel(null), []);

  const handleSaved = useCallback(
    (message: string) => {
      setPanel(null);
      showToast("success", message);
    },
    [showToast],
  );

  const handleToggleActive = useCallback(
    (professional: Professional) => {
      setTogglingId(professional.id);

      startTransition(async () => {
        const result = await setProfessionalActiveAction(
          professional.id,
          !professional.is_active,
        );
        setTogglingId(null);
        showToast(result.ok ? "success" : "error", result.message);
      });
    },
    [showToast],
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
        title="Não foi possível carregar os profissionais"
        message={loadError}
      />
    );
  }

  const hasAnyProfessional = totalCount > 0;

  return (
    <>
      {hasAnyProfessional ? (
        <ProfessionalsToolbar
          filters={filters}
          segments={segments}
          regions={regions}
          resultCount={filteredCount}
          onNewProfessional={() => setPanel({ mode: "new" })}
        />
      ) : null}

      {!hasAnyProfessional ? (
        <EmptyState
          icon={Users}
          title="Nenhum profissional cadastrado"
          description="Comece adicionando o primeiro profissional à carteira da HORN. Cadastrar não significa que houve contato — isso será registrado depois."
          action={
            <Button onClick={() => setPanel({ mode: "new" })}>
              Novo Profissional
            </Button>
          }
        />
      ) : professionals.length === 0 ? (
        <EmptyState
          icon={SearchX}
          tone="neutral"
          title="Nenhum profissional encontrado"
          description="Nenhum resultado para os filtros aplicados. Ajuste a busca ou volte a ver toda a carteira."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
          <ProfessionalList
            professionals={professionals}
            onOpenDetails={(professional) =>
              setPanel({ mode: "details", professional })
            }
            onEdit={(professional) => setPanel({ mode: "edit", professional })}
            onToggleActive={handleToggleActive}
            pendingId={togglingId}
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
          <ProfessionalDetails
            professional={panel.professional}
            onEdit={() =>
              setPanel({ mode: "edit", professional: panel.professional })
            }
          />
        ) : panel !== null ? (
          <ProfessionalForm
            // Recria o formulário ao trocar de profissional, zerando os campos.
            key={panel.mode === "new" ? "new" : panel.professional.id}
            professional={panel.mode === "new" ? null : panel.professional}
            segments={segments}
            regions={regions}
            onSaved={handleSaved}
            onCancel={closePanel}
          />
        ) : null}
      </SlideOver>
    </>
  );
}

function panelTitle(panel: Panel): string {
  if (panel?.mode === "details") return panel.professional.name;
  if (panel?.mode === "edit") return "Editar profissional";
  return "Novo profissional";
}

function panelDescription(panel: Panel): string | undefined {
  if (panel?.mode === "details") {
    return panel.professional.segment?.name ?? undefined;
  }
  if (panel?.mode === "edit") return panel.professional.name;
  return "Adicione uma pessoa à carteira da HORN.";
}
