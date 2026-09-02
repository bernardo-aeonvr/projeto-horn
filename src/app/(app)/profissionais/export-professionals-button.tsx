"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportProfessionalsAction } from "@/lib/professionals/actions";
import type {
  ProfessionalFilters,
  Region,
  Segment,
} from "@/lib/professionals/types";

/**
 * Exportar a carteira filtrada.
 *
 * O recorte é o da tela: os mesmos `filters` que a listagem usa viajam para a
 * action, que refaz a MESMA consulta sem a paginação. Não existe um segundo
 * conjunto de filtros, e nada é lido do HTML — a planilha não depende de qual
 * página está aberta, de coluna escondida ou de texto truncado.
 *
 * O arquivo é desenhado no navegador (o ExcelJS entra por `import()` no
 * clique), e as linhas vêm do servidor já autorizadas.
 */
export function ExportProfessionalsButton({
  filters,
  segments,
  regions,
}: {
  filters: ProfessionalFilters;
  segments: Segment[];
  regions: Region[];
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

      const payload = await exportProfessionalsAction(filters);

      if (payload.error) {
        showToast("error", payload.error);
        return;
      }

      if (payload.professionals.length === 0) {
        showToast("error", "Nenhum profissional encontrado para exportar.");
        return;
      }

      // Import dinâmico: o ExcelJS só desce quando alguém exporta.
      const { renderProfessionalsWorkbook, professionalsFileName } =
        await import("@/lib/professionals/export");

      const context = describeFilters(filters, segments, regions);
      const bytes = await renderProfessionalsWorkbook(
        payload.professionals,
        context,
      );

      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = professionalsFileName(context);
      link.click();

      if (payload.truncated) {
        showToast(
          "error",
          "A exportação chegou ao limite de 5.000 profissionais. Estreite os filtros para levar o restante.",
        );
      }
    } catch (error) {
      console.error("[profissionais] falha ao gerar o Excel", error);
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
 * Segmento e região chegam como id na URL; quem tem o rótulo é a própria tela,
 * que já carregou as duas listas para os seletores — daí virem por prop, sem
 * consulta nova.
 */
function describeFilters(
  filters: ProfessionalFilters,
  segments: Segment[],
  regions: Region[],
): { filters: string[]; slug: string } {
  const parts: string[] = [];
  const slugParts: string[] = [];

  const segment = segments.find((item) => item.id === filters.segmentId);
  if (segment) {
    parts.push(`Segmento = ${segment.name}`);
    slugParts.push(segment.slug);
  }

  const region = regions.find((item) => item.id === filters.regionId);
  if (region) {
    parts.push(`Região = ${region.name}`);
    slugParts.push(region.slug);
  }

  /*
    Empresa e cargo chegam como o próprio nome, não como id: não há lista para
    consultar, é o texto que a linha guarda.

    Eles entram na descrição, e não no nome do arquivo: o sufixo do arquivo é
    montado com os `slug` do catálogo — que empresa e cargo, sendo texto livre,
    não têm. Inventar uma slugificação aqui criaria uma segunda normalização
    justamente onde a etapa anterior tomou o cuidado de ter só uma.
  */
  if (filters.company) parts.push(`Empresa = ${filters.company}`);
  if (filters.jobRole) parts.push(`Cargo = ${filters.jobRole}`);

  if (filters.status !== "todos") {
    parts.push(`Status = ${filters.status === "ativos" ? "Ativos" : "Inativos"}`);
    slugParts.push(filters.status);
  }

  if (filters.q.trim()) parts.push(`Busca = ${filters.q.trim()}`);

  return { filters: parts, slug: slugParts.join("-") };
}
