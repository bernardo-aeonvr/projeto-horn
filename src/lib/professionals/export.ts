import { exportFileName } from "@/lib/xlsx/file-name";
import {
  addSheet,
  createWorkbook,
  day,
  text,
  workbookBytes,
  type SheetCell,
  type SheetColumn,
} from "@/lib/xlsx/sheet";

import {
  formatBirthdayLong,
  MONTHS,
  toInstagramHandle,
} from "./format";
import type { Professional } from "./types";

/**
 * A carteira em planilha.
 *
 * Uma aba, uma linha por profissional, os mesmos rótulos que a tela mostra —
 * "Arquiteto", "Agosto" — e nunca o valor interno. Quem abre o arquivo
 * é a mesma pessoa que usa o sistema; ela não deveria precisar de um dicionário
 * para ler a própria base.
 *
 * O estilo (cabeçalho, congelamento, autofiltro, largura, tipo de célula) vem
 * de `@/lib/xlsx/sheet`, o mesmo do Excel do dashboard.
 *
 * TELEFONE, CEP E INSTAGRAM SÃO TEXTO
 *
 * De propósito, e é o detalhe que mais estraga uma exportação quando passa
 * despercebido: o Excel transforma "(41) 3456-7890" em número, come o zero à
 * esquerda de um CEP e às vezes vira notação científica. Como texto, o dado
 * chega do outro lado exatamente como saiu daqui.
 */

/** Rótulo do recorte, para o cabeçalho da planilha e o nome do arquivo. */
export type ExportContext = {
  /** Filtros ativos já legíveis, ex.: "Segmento = Arquiteto". */
  filters: string[];
  /** Sufixo do nome do arquivo, já em minúsculas e sem acento. */
  slug: string;
};

const COLUMNS: SheetColumn[] = [
  { header: "Nome", width: 32 },
  { header: "Segmento", width: 22 },
  { header: "Telefone", width: 18 },
  { header: "E-mail", width: 30 },
  { header: "Instagram", width: 20 },
  { header: "Regiões", width: 34, wrap: true },
  { header: "Cidade", width: 20 },
  { header: "UF", width: 10 },
  { header: "Endereço", width: 34, wrap: true },
  { header: "CEP", width: 12 },
  { header: "Aniversário", width: 16 },
  { header: "Mês de aniversário", width: 18 },
  { header: "Observações", width: 38, wrap: true },
  { header: "Cadastrado em", width: 16 },
];

function row(professional: Professional): SheetCell[] {
  const handle = toInstagramHandle(professional.instagram);

  return [
    text(professional.name),
    text(professional.segment?.name ?? ""),
    text(professional.phone ?? ""),
    text(professional.email ?? ""),
    // Guardado e exibido como @usuario; a planilha repete isso, sem inventar URL.
    text(handle ? `@${handle}` : ""),
    /*
      Um profissional pode atuar em várias regiões, e continua sendo uma linha
      só: duplicar a pessoa por região quebraria qualquer contagem feita em
      cima da planilha.
    */
    text(professional.regions.map((region) => region.name).join("; ")),
    text(professional.city ?? ""),
    text(professional.state ?? ""),
    text(professional.address ?? ""),
    text(professional.postal_code ?? ""),
    text(
      professional.birthday_day && professional.birthday_month
        ? formatBirthdayLong(
            professional.birthday_day,
            professional.birthday_month,
          )
        : "",
    ),
    // Coluna própria para o mês: é por ela que se filtra "aniversariantes de".
    text(
      professional.birthday_month
        ? MONTHS[professional.birthday_month - 1]
        : "",
    ),
    text(professional.notes ?? ""),
    day(professional.created_at),
  ];
}

/** "horn-profissionais-arquiteto-2026-08-26.xlsx" */
export function professionalsFileName(
  context: ExportContext,
  now = new Date(),
): string {
  return exportFileName("horn-profissionais", context.slug, now);
}

export async function renderProfessionalsWorkbook(
  professionals: Professional[],
  context: ExportContext,
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
    title: "Profissionais",
    // O recorte vive nas propriedades do arquivo, e não em linhas acima da
    // tabela: o autofiltro precisa que o cabeçalho seja a primeira linha.
    description: `${description} · Gerado em ${generated}`,
  });

  addSheet(workbook, {
    name: "Profissionais",
    columns: COLUMNS,
    rows: professionals.map(row),
  });

  return workbookBytes(workbook);
}
