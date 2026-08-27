"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { DashboardReport } from "@/lib/dashboard/report";

/**
 * Ação do dashboard: o relatório em PDF.
 *
 * Houve um segundo botão aqui, "Exportar Excel", com o mesmo conteúdo em dado
 * bruto. Ele saiu quando cada módulo operacional passou a exportar a própria
 * planilha — Profissionais, Contatos e Projetos & Propostas —, cada uma com os
 * filtros da tela e uma linha por registro. Planilha é dado para trabalhar, e
 * o lugar de trabalhar o dado é o módulo; o dashboard é leitura e apresentação.
 *
 * O PDF sai do `DashboardReport` que chega por prop, montado do mesmo payload
 * que a tela renderiza — este componente não sabe consultar nada.
 *
 * O que ele NÃO faz, de propósito: ler o DOM. Recolher um card, esconder uma
 * série do gráfico ou virar a página de uma tabela não muda o arquivo, e
 * exportar não mexe em nenhuma dessas coisas.
 */
export function DashboardExportActions({ report }: { report: DashboardReport }) {
  const [generating, setGenerating] = useState(false);
  /*
    A trava é o ref, não o estado.

    `disabled` e `generating` só valem no próximo render; cinco cliques no
    mesmo tique leem os dois desatualizados e disparam cinco gerações em
    paralelo — foi o que aconteceu ao testar. O ref muda na hora, então o
    segundo clique já encontra a porta fechada.
  */
  const running = useRef(false);
  const { showToast } = useToast();

  async function exportPdf() {
    if (running.current) return;
    running.current = true;
    setGenerating(true);

    let url: string | null = null;

    try {
      /*
        Um tique de folga para o botão pintar o estado de carregamento antes de
        o desenho começar: o jsPDF trabalha de forma síncrona e segura a
        thread, então sem esta pausa o "Gerando..." só apareceria depois de já
        ter passado.
      */
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Import dinâmico: as ~400 KB do jsPDF só descem quando alguém exporta.
      const { renderDashboardPdf } = await import("@/lib/dashboard/pdf");
      const bytes = await renderDashboardPdf(report);

      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.fileBaseName}.pdf`;
      link.click();
    } catch (error) {
      console.error("[dashboard] falha ao gerar o PDF", error);
      showToast(
        "error",
        "Não foi possível gerar o PDF. Tente novamente em instantes.",
      );
    } finally {
      // Revogar já: o navegador só precisa da URL até o clique do link.
      if (url) URL.revokeObjectURL(url);
      running.current = false;
      setGenerating(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={exportPdf}
      disabled={generating}
      aria-busy={generating}
    >
      {generating ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="size-4" aria-hidden />
      )}
      {generating ? "Gerando PDF..." : "Exportar PDF"}
    </Button>
  );
}
