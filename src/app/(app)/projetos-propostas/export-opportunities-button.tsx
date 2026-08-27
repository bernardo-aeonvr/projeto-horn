"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/contacts/types";
import { exportOpportunitiesAction } from "@/lib/opportunities/actions";
import {
  STATUS_LABELS,
  type OpportunityFilters,
  type OpportunityStore,
} from "@/lib/opportunities/types";
import { formatDate } from "@/lib/stores/format";

/**
 * Exportar o funil filtrado.
 *
 * O recorte é o da tela: os mesmos `filters` que a listagem usa viajam para a
 * action, que refaz a MESMA consulta sem a paginação. Não existe um segundo
 * conjunto de filtros nem um diálogo de exportação, e nada é lido do HTML — a
 * planilha não depende de qual página está aberta, e clicar num card de status
 * chega aqui como qualquer outro filtro, porque o card só mexe em
 * `filters.status`.
 *
 * O arquivo é desenhado no navegador (o ExcelJS entra por `import()` no
 * clique), e as linhas vêm do servidor já autorizadas — inclusive a decisão
 * sobre a coluna de observações internas.
 */
export function ExportOpportunitiesButton({
  filters,
  stores,
  professionalName,
  storeName,
}: {
  filters: OpportunityFilters;
  /** Lojas do filtro. Vazio para o usuário de loja. */
  stores: OpportunityStore[];
  /** Nome do profissional filtrado, quando há um. */
  professionalName: string | null;
  /** Loja do próprio usuário de loja. `null` para o admin. */
  storeName: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  /*
    A trava é o ref, não o estado: `disabled` só vale no próximo render, e
    cliques no mesmo tique passariam pelos dois.
  */
  const running = useRef(false);
  const { showToast } = useToast();

  async function exportFile() {
    if (running.current) return;
    running.current = true;
    setGenerating(true);

    let url: string | null = null;

    try {
      // Deixa o botão pintar "Gerando Excel..." antes do trabalho síncrono.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const payload = await exportOpportunitiesAction(filters);

      if (payload.error) {
        showToast("error", payload.error);
        return;
      }

      if (payload.opportunities.length === 0) {
        showToast(
          "error",
          "Nenhum projeto ou proposta encontrado para exportar.",
        );
        return;
      }

      // Import dinâmico: o ExcelJS só desce quando alguém exporta.
      const { renderOpportunitiesWorkbook, opportunitiesFileName } =
        await import("@/lib/opportunities/export");

      const context = {
        ...describeFilters(filters, stores, professionalName),
        // Quem decide é o servidor, pelo papel de quem pediu.
        includeNotes: payload.includeNotes,
      };
      // O recorte do usuário de loja é a própria loja, sem passar pelo filtro.
      const named = { ...context, storeName: context.storeName ?? storeName };

      const bytes = await renderOpportunitiesWorkbook(
        payload.opportunities,
        named,
      );

      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = opportunitiesFileName(named);
      link.click();

      if (payload.truncated) {
        showToast(
          "error",
          "A exportação chegou ao limite de 5.000 projetos. Estreite os filtros para levar o restante.",
        );
      }
    } catch (error) {
      console.error("[projetos] falha ao gerar o Excel", error);
      showToast(
        "error",
        "Não foi possível gerar o Excel. Tente novamente em instantes.",
      );
    } finally {
      if (url) URL.revokeObjectURL(url);
      running.current = false;
      setGenerating(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={exportFile}
      disabled={generating}
      aria-busy={generating}
    >
      {generating ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet className="size-4" aria-hidden />
      )}
      {generating ? "Gerando Excel..." : "Exportar Excel"}
    </Button>
  );
}

/**
 * Os filtros em português, para as propriedades do arquivo e para o nome dele.
 *
 * Loja e profissional chegam como id na URL; quem tem o rótulo é a própria
 * tela, que já os carregou para o seletor e para o chip — daí virem por prop,
 * sem consulta nova.
 */
function describeFilters(
  filters: OpportunityFilters,
  stores: OpportunityStore[],
  professionalName: string | null,
): { filters: string[]; storeName: string | null } {
  const parts: string[] = [];

  if (filters.status === "abertas") {
    parts.push("Status = Em aberto");
  } else if (filters.status) {
    parts.push(`Status = ${STATUS_LABELS[filters.status]}`);
  }

  const store = stores.find((item) => item.id === filters.storeId) ?? null;
  if (store) parts.push(`Loja = ${store.name}`);

  if (filters.professionalId) {
    parts.push(`Profissional = ${professionalName ?? "selecionado"}`);
  }

  if (filters.period !== "todos") {
    const label = PERIOD_LABELS[filters.period as PeriodPreset];
    const range =
      filters.period === "personalizado" && (filters.from || filters.to)
        ? ` (${formatDate(filters.from || null)} a ${formatDate(filters.to || null)})`
        : "";
    parts.push(`Período = ${label}${range}`);
  }

  if (filters.q.trim()) parts.push(`Busca = ${filters.q.trim()}`);

  return { filters: parts, storeName: store?.name ?? null };
}
