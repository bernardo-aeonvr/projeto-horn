import { formatCurrency, formatPercent } from "@/lib/stores/format";
import { exportFileName } from "@/lib/xlsx/file-name";
import {
  addSheet,
  createWorkbook,
  dateTime,
  day,
  text,
  workbookBytes,
  type SheetCell,
  type SheetColumn,
} from "@/lib/xlsx/sheet";

import { STATUS_LABELS, type Opportunity } from "./types";

/**
 * O funil em planilha.
 *
 * Uma aba, UMA LINHA POR PROJETO — não uma por movimentação de status. Um
 * negócio que passou por seis etapas continua sendo um registro só, no status
 * em que está hoje; a timeline é assunto do detalhe, não da planilha.
 *
 * O estilo (cabeçalho, congelamento, autofiltro, largura, tipo de célula) vem
 * de `@/lib/xlsx/sheet`, o mesmo de Profissionais e do dashboard.
 *
 * OS QUATRO NÚMEROS NÃO SE MISTURAM
 *
 * Valor inicial, valor final, percentual e comissão gerada são conceitos
 * diferentes e ocupam colunas diferentes. O valor inicial de um negócio
 * perdido continua sendo o que a loja propôs — quem diz que ele não virou
 * venda é a coluna de status, ao lado. Nada é recalculado aqui: a comissão é
 * coluna gerada pelo banco, e a planilha só a repete.
 *
 * Vazio é vazio: um projeto em negociação não tem valor final nem comissão, e
 * escrever zero ali faria uma soma dizer que ele fechou por nada.
 */

/** Rótulo do recorte, para as propriedades do arquivo e para o nome dele. */
export type OpportunityExportContext = {
  /** Filtros ativos já legíveis, ex.: "Status = Em negociação". */
  filters: string[];
  /** Loja do recorte: a escolhida no filtro, ou a do próprio usuário de loja. */
  storeName: string | null;
  /** Observações internas da HORN. Falso para o usuário de loja. */
  includeNotes: boolean;
};

/**
 * Percentual com duas casas.
 *
 * O formato padrão do tipo (`0%`) mostraria uma comissão de 3,5% como "4%".
 */
const PERCENT_FORMAT = "0.00%";

function columns(includeNotes: boolean): SheetColumn[] {
  return [
    { header: "Demanda", width: 34, wrap: true },
    { header: "Profissional", width: 26 },
    { header: "Segmento", width: 20 },
    { header: "Loja", width: 24 },
    { header: "Status", width: 26 },
    { header: "Data do projeto", width: 16 },
    { header: "Valor inicial", width: 16 },
    { header: "Valor final", width: 16 },
    { header: "Comissão %", width: 12 },
    { header: "Comissão gerada", width: 17 },
    { header: "Motivo da perda", width: 32, wrap: true },
    ...(includeNotes
      ? [{ header: "Observações", width: 38, wrap: true } as SheetColumn]
      : []),
    { header: "Última atualização", width: 18 },
  ];
}

/** Moeda, ou célula vazia quando o valor não existe. */
function money(value: number | null): SheetCell {
  if (value === null) return text("");
  return { kind: "currency", text: formatCurrency(value), value };
}

/**
 * Percentual como número, não como texto.
 *
 * O banco guarda 4 para 4%; o Excel entende porcentagem como fração, então a
 * célula leva 0,04 e o formato mostra "4,00%". A conversão existe só para o
 * arquivo — nada é gravado de volta.
 */
function percent(value: number | null): SheetCell {
  if (value === null) return text("");

  return {
    kind: "percent",
    text: formatPercent(value),
    value: value / 100,
    format: PERCENT_FORMAT,
  };
}

function row(
  opportunity: Opportunity,
  includeNotes: boolean,
): SheetCell[] {
  return [
    /*
      O título como está gravado. A tela mostra "Projeto — Loja A" quando ele
      falta, mas isso é rótulo de interface: na planilha a coluna Loja já diz
      isso, e inventar texto atrapalharia quem filtra por demanda.
    */
    text(opportunity.title ?? ""),
    text(opportunity.professional?.name ?? ""),
    text(opportunity.professional?.segment_name ?? ""),
    text(opportunity.store?.name ?? ""),
    /*
      O rótulo canônico do status atual, o mesmo do detalhe e da timeline —
      nunca o valor do enum. Os sete status saem como são: "Proposta recebida"
      é "Proposta recebida", mesmo que o resumo do dashboard não tenha um card
      só para ela.
    */
    text(STATUS_LABELS[opportunity.status]),
    // A data em que a demanda entrou — a mesma que o filtro de período recorta.
    day(opportunity.created_at),
    money(opportunity.proposal_initial_value),
    /*
      O valor final fica gravado mesmo se o negócio for reaberto por correção,
      e a planilha o mostra como o detalhe mostra. Ler isso como venda é erro
      de leitura que a coluna de status desfaz.
    */
    money(opportunity.final_closed_value),
    percent(opportunity.commission_percent),
    // Coluna gerada pelo banco, e só quando o negócio está fechado.
    money(opportunity.commission_value),
    text(opportunity.loss_reason ?? ""),
    ...(includeNotes ? [text(opportunity.notes ?? "")] : []),
    dateTime(opportunity.updated_at),
  ];
}

/** "horn-projetos-propostas-loja-a-2026-08-26.xlsx" */
export function opportunitiesFileName(
  context: OpportunityExportContext,
  now = new Date(),
): string {
  return exportFileName("horn-projetos-propostas", context.storeName, now);
}

export async function renderOpportunitiesWorkbook(
  opportunities: Opportunity[],
  context: OpportunityExportContext,
  now = new Date(),
): Promise<Uint8Array> {
  const generated = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(now);

  const description =
    context.filters.length > 0
      ? `Filtros: ${context.filters.join("; ")}`
      : "Sem filtros";

  const workbook = await createWorkbook({
    title: "Projetos e Propostas",
    // O recorte vive nas propriedades do arquivo, e não em linhas acima da
    // tabela: o autofiltro precisa que o cabeçalho seja a primeira linha.
    description: `${description} · Gerado em ${generated}`,
  });

  addSheet(workbook, {
    name: "Projetos e Propostas",
    columns: columns(context.includeNotes),
    rows: opportunities.map((opportunity) =>
      row(opportunity, context.includeNotes),
    ),
  });

  return workbookBytes(workbook);
}
