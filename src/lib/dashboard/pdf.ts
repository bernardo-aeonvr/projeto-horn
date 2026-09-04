import type { jsPDF } from "jspdf";

import { formatBucketLabel } from "./period";
import type {
  DashboardReport,
  ReportChart,
  ReportRow,
  ReportTable,
} from "./report";

/**
 * O relatório desenhado em PDF.
 *
 * ESTRATÉGIA
 *
 * jsPDF + jspdf-autotable, no navegador, a partir do payload que o dashboard
 * já tem em mãos. Três razões:
 *
 *   - texto vetorial. Um `html2canvas` viraria uma folha rasterizada por
 *     página: texto borrado ao imprimir, arquivo enorme e tabela cortada no
 *     meio da linha. Aqui cada valor é texto selecionável e o arquivo fica na
 *     casa de dezenas de KB;
 *   - as tabelas longas são o problema central deste relatório, e é o que o
 *     autotable resolve: quebra de página, cabeçalho repetido e largura de
 *     coluna calculada;
 *   - permissão. O gerador roda sobre `DashboardReport`, montado a partir das
 *     props da tela. Não existe consulta nova, nem endpoint novo, nem caminho
 *     para dado que o usuário já não tenha recebido — um usuário de loja não
 *     tem como exportar o que a tela dele não carregou.
 *
 * As duas bibliotecas entram por `import()` dentro da função: são ~400 KB que
 * só o clique em "Exportar PDF" baixa, e nunca o carregamento do dashboard.
 *
 * O que ele NÃO faz: tocar na tela. Nada aqui lê o DOM, então recolher um
 * card, esconder uma série do gráfico ou virar a página de uma tabela não
 * muda uma linha do arquivo gerado.
 */

/** A4 retrato, em pontos. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 48, right: 40, bottom: 52, left: 40 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

/** As cores da marca, as mesmas do tema (globals.css). */
const GOLD = "#cd9738";
const GRAPHITE_900 = "#282c30";
const GRAPHITE_600 = "#626b75";
const GRAPHITE_400 = "#9aa3ac";
const GRAPHITE_200 = "#dcdfe3";
const GRAPHITE_50 = "#f6f7f8";

type Cursor = { y: number };

export async function renderDashboardPdf(
  report: DashboardReport,
): Promise<Uint8Array> {
  const [{ jsPDF: JsPdf }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPdf({
    unit: "pt",
    format: "a4",
    orientation: "portrait",
    compress: true,
  });

  doc.setProperties({
    title: `HORN — ${report.title}`,
    subject: report.context
      .map((row) => `${row.label}: ${row.cell.text}`)
      .join(" · "),
    creator: "HORN",
  });

  const cursor: Cursor = { y: MARGIN.top };

  drawHeader(doc, report, cursor);
  drawKpis(doc, report, cursor);
  drawFunnel(doc, report, cursor);

  if (report.chart) drawChart(doc, report.chart, cursor);

  if (report.portfolio.length > 0) {
    sectionTitle(doc, "Carteira", cursor);
    caption(
      doc,
      "Estado atual da base. Estes números descrevem o cadastro hoje e não mudam com o filtro de período.",
      cursor,
    );
    drawDefinitions(doc, report.portfolio, cursor);
  }

  for (const table of report.distributions) drawTable(doc, table, cursor, autoTable);
  drawTable(doc, report.ranking, cursor, autoTable);
  for (const table of report.tables) drawTable(doc, table, cursor, autoTable);

  drawFooters(doc, report);

  return new Uint8Array(doc.output("arraybuffer"));
}

/* -------------------------------------------------------------------------- */
/* Blocos                                                                     */
/* -------------------------------------------------------------------------- */

function drawHeader(doc: jsPDF, report: DashboardReport, cursor: Cursor): void {
  /*
    A marca é desenhada, não embutida como imagem: o PNG do logotipo entraria
    rasterizado e é o único elemento que ficaria borrado na impressão. As
    barras douradas repetem o símbolo, e "HORN" sai na mesma tipografia do
    resto do documento.
  */
  const barTop = cursor.y;
  const heights = [10, 16, 22];
  doc.setFillColor(GOLD);
  heights.forEach((height, index) => {
    doc.rect(MARGIN.left + index * 6, barTop + (22 - height), 4, height, "F");
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(GRAPHITE_900);
  const wordmarkX = MARGIN.left + 24;
  doc.text("HORN", wordmarkX, barTop + 20);
  /*
    A largura é medida AQUI, com a fonte da marca ainda ativa.
    `getTextWidth` responde sobre o estado corrente do documento: medida depois
    do `setFont("normal")`/`setFontSize(9)` abaixo, ela devolvia a largura de
    "HORN" em 9pt — menos da metade do que a palavra ocupa em 18pt negrito — e
    a assinatura era desenhada por cima do logotipo.
  */
  const wordmarkWidth = doc.getTextWidth("HORN");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GRAPHITE_400);
  doc.text(
    "Representação comercial",
    wordmarkX + wordmarkWidth + 8,
    barTop + 20,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(GRAPHITE_900);
  doc.text(report.title, PAGE.width - MARGIN.right, barTop + 12, {
    align: "right",
  });

  cursor.y = barTop + 40;

  // Contexto do recorte: é o que diz a que período e a que loja tudo abaixo se
  // refere. Sem isso o relatório impresso não significa nada.
  doc.setFillColor(GRAPHITE_50);
  doc.setDrawColor(GRAPHITE_200);
  const boxHeight = 18 * report.context.length + 14;
  doc.roundedRect(MARGIN.left, cursor.y, CONTENT_WIDTH, boxHeight, 4, 4, "FD");

  let line = cursor.y + 20;
  for (const row of report.context) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(GRAPHITE_600);
    doc.text(`${row.label}:`, MARGIN.left + 12, line);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(GRAPHITE_900);
    doc.text(row.cell.text, MARGIN.left + 80, line);
    line += 18;
  }

  cursor.y += boxHeight + 24;
}

function drawKpis(doc: jsPDF, report: DashboardReport, cursor: Cursor): void {
  sectionTitle(doc, "Resumo do período", cursor);

  const columns = 3;
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardHeight = 58;

  report.kpis.forEach((kpi, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    // Uma faixa de cards nunca é partida no meio: se a linha não cabe, a
    // página vira antes de desenhá-la.
    if (column === 0) ensureSpace(doc, cardHeight + 6, cursor);

    const x = MARGIN.left + column * (cardWidth + gap);
    const y = cursor.y + (row === 0 ? 0 : 0);

    doc.setFillColor(GRAPHITE_50);
    doc.setDrawColor(GRAPHITE_200);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(GRAPHITE_600);
    doc.text(kpi.label.toUpperCase(), x + 10, y + 16, {
      maxWidth: cardWidth - 20,
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(GRAPHITE_900);
    doc.text(kpi.cell.text, x + 10, y + 36, { maxWidth: cardWidth - 20 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRAPHITE_400);
    doc.text(kpi.hint, x + 10, y + 49, { maxWidth: cardWidth - 20 });

    if (column === columns - 1 || index === report.kpis.length - 1) {
      cursor.y += cardHeight + gap;
    }
  });

  cursor.y += 14;
}

function drawFunnel(doc: jsPDF, report: DashboardReport, cursor: Cursor): void {
  sectionTitle(doc, "Funil de projetos e propostas", cursor);
  caption(doc, report.funnelNote, cursor);

  const columns = 3;
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardHeight = 40;

  report.funnel.forEach((row, index) => {
    const column = index % columns;
    if (column === 0) ensureSpace(doc, cardHeight + 6, cursor);

    const x = MARGIN.left + column * (cardWidth + gap);

    doc.setDrawColor(GRAPHITE_200);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, cursor.y, cardWidth, cardHeight, 4, 4, "FD");

    /*
      O status é dito por escrito, sempre. A cor entra só como uma barrinha à
      esquerda: em impressão preto e branco o rótulo continua lá, e ninguém
      precisa distinguir âmbar de dourado para ler o funil.
    */
    doc.setFillColor(GOLD);
    doc.rect(x, cursor.y + 6, 2.5, cardHeight - 12, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRAPHITE_600);
    doc.text(row.label, x + 10, cursor.y + 16, { maxWidth: cardWidth - 50 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(GRAPHITE_900);
    doc.text(row.cell.text, x + cardWidth - 10, cursor.y + 28, {
      align: "right",
    });

    if (column === columns - 1 || index === report.funnel.length - 1) {
      cursor.y += cardHeight + gap;
    }
  });

  cursor.y += 14;
}

/**
 * O gráfico de evolução, redesenhado em vetor.
 *
 * Não é uma captura do SVG da tela: são os mesmos pontos (`report.chart`)
 * traçados com as primitivas do PDF. Sai nítido em qualquer zoom, sem fundo
 * preto ou transparente, e sem depender de o gráfico estar visível — ou de o
 * card estar aberto — no momento do clique.
 *
 * Cada série tem cor E marcador próprios (círculo, quadrado, losango), pelo
 * mesmo motivo do funil: um relatório impresso em preto e branco continua
 * legível.
 */
function drawChart(doc: jsPDF, chart: ReportChart, cursor: Cursor): void {
  const height = 170;
  ensureSpace(doc, height + 76, cursor);

  sectionTitle(doc, chart.title, cursor);
  caption(doc, chart.note, cursor);

  const top = cursor.y;
  const left = MARGIN.left + 30;
  const right = PAGE.width - MARGIN.right;
  const bottom = top + height - 22;
  const plotWidth = right - left;

  if (chart.points.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GRAPHITE_400);
    doc.text("Sem movimentação neste período.", MARGIN.left, top + 14);
    cursor.y = top + 30;
    return;
  }

  const max = Math.max(
    1,
    ...chart.points.flatMap((point) =>
      chart.series.map((series) => point[series.key]),
    ),
  );

  // Quatro linhas de grade com o valor à esquerda.
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  for (let step = 0; step <= 4; step += 1) {
    const y = bottom - ((bottom - top) * step) / 4;
    doc.setDrawColor(GRAPHITE_200);
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);

    doc.setTextColor(GRAPHITE_400);
    doc.text(String(Math.round((max * step) / 4)), left - 6, y + 2.5, {
      align: "right",
    });
  }

  const x = (index: number) =>
    chart.points.length === 1
      ? left + plotWidth / 2
      : left + (plotWidth * index) / (chart.points.length - 1);
  const y = (value: number) => bottom - ((bottom - top) * value) / max;

  for (const series of chart.series) {
    doc.setDrawColor(series.color);
    doc.setFillColor(series.color);
    doc.setLineWidth(1.4);

    let previous: [number, number] | null = null;
    chart.points.forEach((point, index) => {
      const px = x(index);
      const py = y(point[series.key]);

      if (previous) doc.line(previous[0], previous[1], px, py);
      previous = [px, py];

      // Só marca os pontos quando eles não viram uma mancha contínua.
      if (chart.points.length <= 40) {
        marker(doc, series.key, px, py);
      }
    });
  }

  // Rótulos do eixo X, ralos o bastante para não colidirem.
  const stride = Math.max(1, Math.ceil(chart.points.length / 8));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(GRAPHITE_400);
  chart.points.forEach((point, index) => {
    if (index % stride !== 0 && index !== chart.points.length - 1) return;
    doc.text(formatBucketLabel(point.bucket_start, chart.bucket), x(index), bottom + 12, {
      align: "center",
    });
  });

  // Legenda: marcador + nome por extenso.
  let legendX = MARGIN.left;
  const legendY = bottom + 26;
  doc.setFontSize(8);
  for (const series of chart.series) {
    doc.setDrawColor(series.color);
    doc.setFillColor(series.color);
    doc.setLineWidth(1.4);
    doc.line(legendX, legendY - 3, legendX + 12, legendY - 3);
    marker(doc, series.key, legendX + 6, legendY - 3);

    doc.setTextColor(GRAPHITE_600);
    doc.text(series.label, legendX + 17, legendY);
    legendX += 17 + doc.getTextWidth(series.label) + 16;
  }

  cursor.y = legendY + 22;
}

/** Um marcador por série, para o gráfico sobreviver ao preto e branco. */
function marker(doc: jsPDF, key: string, px: number, py: number): void {
  if (key === "professionals_contacted") {
    doc.circle(px, py, 2, "F");
    return;
  }

  if (key === "projects_received") {
    doc.rect(px - 1.8, py - 1.8, 3.6, 3.6, "F");
    return;
  }

  doc.triangle(px, py - 2.4, px - 2.2, py + 1.8, px + 2.2, py + 1.8, "F");
}

function drawDefinitions(doc: jsPDF, rows: ReportRow[], cursor: Cursor): void {
  ensureSpace(doc, 18 * rows.length + 10, cursor);

  for (const row of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GRAPHITE_600);
    doc.text(row.label, MARGIN.left, cursor.y + 10);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(GRAPHITE_900);
    doc.text(row.cell.text, PAGE.width - MARGIN.right, cursor.y + 10, {
      align: "right",
    });

    doc.setDrawColor(GRAPHITE_200);
    doc.setLineWidth(0.5);
    doc.line(MARGIN.left, cursor.y + 16, PAGE.width - MARGIN.right, cursor.y + 16);
    cursor.y += 20;
  }

  cursor.y += 14;
}

type AutoTable = typeof import("jspdf-autotable")["default"];

/**
 * Uma tabela do relatório.
 *
 * O autotable cuida do que é difícil: quebra de página no meio da lista,
 * cabeçalho repetido no topo de cada página e largura de coluna. O título
 * sempre é desenhado na mesma página em que a tabela começa — `ensureSpace`
 * garante espaço para o título mais as primeiras linhas, para não sobrar um
 * cabeçalho órfão no pé da página.
 */
function drawTable(
  doc: jsPDF,
  table: ReportTable,
  cursor: Cursor,
  autoTable: AutoTable,
): void {
  ensureSpace(doc, 96, cursor);
  sectionTitle(doc, table.title, cursor);
  if (table.note) caption(doc, table.note, cursor);

  if (table.rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(GRAPHITE_400);
    doc.text(table.emptyMessage, MARGIN.left, cursor.y + 10, {
      maxWidth: CONTENT_WIDTH,
    });
    cursor.y += 30;
    return;
  }

  autoTable(doc, {
    startY: cursor.y,
    head: [table.head],
    // O PDF imprime o texto já formatado; o valor cru da célula não é usado.
    body: table.rows.map((row) => row.map((cell) => cell.text)),
    margin: { left: MARGIN.left, right: MARGIN.right, bottom: MARGIN.bottom },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 5,
      textColor: GRAPHITE_900,
      lineColor: GRAPHITE_200,
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: GRAPHITE_50,
      textColor: GRAPHITE_600,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: "#fbfcfc" },
    columnStyles: Object.fromEntries(
      table.numeric.map((index) => [index, { halign: "right" as const }]),
    ),
    // Repete o cabeçalho no topo de cada página que a tabela ocupar.
    showHead: "everyPage",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;

  cursor.y = (finalY ?? cursor.y) + 24;
}

/* -------------------------------------------------------------------------- */
/* Utilitários de página                                                      */
/* -------------------------------------------------------------------------- */

function sectionTitle(doc: jsPDF, title: string, cursor: Cursor): void {
  ensureSpace(doc, 40, cursor);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(GRAPHITE_900);
  doc.text(title, MARGIN.left, cursor.y);

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(MARGIN.left, cursor.y + 5, MARGIN.left + 22, cursor.y + 5);

  cursor.y += 18;
}

function caption(doc: jsPDF, text: string, cursor: Cursor): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(GRAPHITE_400);

  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  doc.text(lines, MARGIN.left, cursor.y);
  cursor.y += lines.length * 9 + 6;
}

/** Vira a página quando o próximo bloco não cabe inteiro. */
function ensureSpace(doc: jsPDF, needed: number, cursor: Cursor): void {
  if (cursor.y + needed <= PAGE.height - MARGIN.bottom) return;

  doc.addPage();
  cursor.y = MARGIN.top;
}

/**
 * Rodapé em todas as páginas, no fim.
 *
 * Só aqui o total de páginas é conhecido — inclusive as que o autotable criou
 * sozinho ao quebrar uma tabela longa.
 */
function drawFooters(doc: jsPDF, report: DashboardReport): void {
  const total = doc.getNumberOfPages();
  const generated =
    report.context.find((row) => row.label === "Gerado em")?.cell.text ?? "";

  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);

    const y = PAGE.height - MARGIN.bottom + 22;
    doc.setDrawColor(GRAPHITE_200);
    doc.setLineWidth(0.5);
    doc.line(MARGIN.left, y - 12, PAGE.width - MARGIN.right, y - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(GRAPHITE_400);
    doc.text(`HORN · ${report.title}`, MARGIN.left, y);
    doc.text(`Gerado em ${generated}`, PAGE.width / 2, y, { align: "center" });
    doc.text(`Página ${page} de ${total}`, PAGE.width - MARGIN.right, y, {
      align: "right",
    });
  }
}
