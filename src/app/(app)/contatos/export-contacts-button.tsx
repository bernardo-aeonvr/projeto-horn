"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportContactsAction } from "@/lib/contacts/actions";
import type { StoreOption } from "@/lib/contacts/queries";
import {
  CHANNEL_LABELS,
  PERIOD_LABELS,
  type ContactFilters,
} from "@/lib/contacts/types";
import { formatDate } from "@/lib/stores/format";

/**
 * Exportar o histórico filtrado.
 *
 * O recorte é o da tela: os mesmos `filters` que a listagem usa viajam para a
 * action, que refaz a MESMA consulta sem a paginação. Não existe um segundo
 * conjunto de filtros nem um diálogo de exportação, e nada é lido do HTML — a
 * planilha não depende de qual página está aberta nem de linha truncada.
 *
 * O arquivo é desenhado no navegador (o ExcelJS entra por `import()` no
 * clique), e as linhas vêm do servidor já autorizadas.
 */
export function ExportContactsButton({
  filters,
  stores,
}: {
  filters: ContactFilters;
  /** Lojas do filtro, para dar nome ao recorte escolhido. */
  stores: StoreOption[];
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

      const payload = await exportContactsAction(filters);

      if (payload.error) {
        showToast("error", payload.error);
        return;
      }

      if (payload.contacts.length === 0) {
        showToast("error", "Nenhum contato encontrado para exportar.");
        return;
      }

      // Import dinâmico: o ExcelJS só desce quando alguém exporta.
      const { renderContactsWorkbook, contactsFileName } = await import(
        "@/lib/contacts/export"
      );

      const context = describeFilters(filters, stores);
      const bytes = await renderContactsWorkbook(payload.contacts, context);

      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = contactsFileName(context);
      link.click();

      if (payload.truncated) {
        showToast(
          "error",
          "A exportação chegou ao limite de 5.000 contatos. Estreite os filtros para levar o restante.",
        );
      }
    } catch (error) {
      console.error("[contatos] falha ao gerar o Excel", error);
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
 * A loja chega como id na URL; quem tem o rótulo é a própria tela, que já
 * carregou a lista para o seletor — daí vir por prop, sem consulta nova.
 */
function describeFilters(
  filters: ContactFilters,
  stores: StoreOption[],
): { filters: string[]; storeName: string | null } {
  const parts: string[] = [];

  if (filters.channel) parts.push(`Canal = ${CHANNEL_LABELS[filters.channel]}`);

  const store = stores.find((item) => item.id === filters.storeId) ?? null;
  if (store) parts.push(`Loja apresentada = ${store.name}`);

  if (filters.period !== "todos") {
    const range =
      filters.period === "personalizado" && (filters.from || filters.to)
        ? ` (${formatDate(filters.from || null)} a ${formatDate(filters.to || null)})`
        : "";
    parts.push(`Período = ${PERIOD_LABELS[filters.period]}${range}`);
  }

  if (filters.q.trim()) parts.push(`Busca = ${filters.q.trim()}`);

  return { filters: parts, storeName: store?.name ?? null };
}
