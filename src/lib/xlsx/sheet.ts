import type { Workbook, Worksheet } from "exceljs";

/**
 * Como esta aplicação escreve uma planilha.
 *
 * Nasceu dentro da exportação do dashboard e saiu de lá quando Profissionais
 * passou a exportar também: cabeçalho em negrito, primeira linha congelada,
 * autofiltro, largura contida e — o que mais importa — a célula com o TIPO
 * certo. Duas exportações com estilos diferentes seriam duas manutenções.
 *
 * A CÉLULA CARREGA AS DUAS CARAS DO DADO
 *
 * `text` é o que a tela mostra (e o que o PDF imprime, no caso do dashboard);
 * `value` é o dado cru, que vai para a planilha. É a diferença entre uma coluna
 * que soma e ordena e uma coluna de texto que não faz nem uma coisa nem outra.
 * As duas saem juntas, do mesmo lugar, então não têm como discordar.
 *
 * Telefone, Instagram e CEP são `text` de propósito: o Excel adora transformar
 * "(41) 3456-7890" em número, comer o zero à esquerda e estragar o dado.
 */

export type SheetCell = (
  | { kind: "text"; text: string }
  | { kind: "number"; text: string; value: number }
  | { kind: "currency"; text: string; value: number }
  /** Fração de 0 a 1 — o formato de porcentagem é aplicado por cima. */
  | { kind: "percent"; text: string; value: number }
  | { kind: "date"; text: string; value: Date }
  | { kind: "datetime"; text: string; value: Date }
) & {
  /**
   * Formato próprio, quando o do tipo não serve. Um percentual de comissão de
   * 3,5% arredondado para "4%" pelo formato padrão diria outro número.
   */
  format?: string;
};

export type SheetColumn = {
  header: string;
  /** Largura fixa; sem ela, sai do conteúdo, presa entre MIN e MAX. */
  width?: number;
  /** Texto longo (observações): quebra dentro da célula em vez de esticar. */
  wrap?: boolean;
};

export type SheetOptions = {
  name: string;
  columns: SheetColumn[];
  /** `null` insere uma linha em branco — separador de blocos. */
  rows: (SheetCell[] | null)[];
  /** Congela o cabeçalho. Ligado por padrão. */
  freeze?: boolean;
  /** Autofiltro no cabeçalho. Ligado por padrão. */
  filter?: boolean;
};

/** Formatos de número por tipo de célula. */
const NUMBER_FORMATS: Record<SheetCell["kind"], string | null> = {
  text: null,
  number: "#,##0",
  currency: "R$ #,##0.00",
  percent: "0%",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

const HEADER_FILL = "FFF6F7F8";
const HEADER_COLOR = "FF626B75";

/** Limites de largura: nome comprido não pode esticar a coluna sem fim. */
const MIN_WIDTH = 10;
const MAX_WIDTH = 38;

export const text = (value: string): SheetCell => ({ kind: "text", text: value });

/**
 * Componentes de um instante no fuso de São Paulo.
 *
 * O Excel serializa datas pelos componentes UTC. Um registro de 31/07 às 22h
 * daqui seria gravado como 01/08 e brigaria com a data que a tela mostra, então
 * a data é remontada a partir do que o `Intl` formata em São Paulo.
 */
function saoPauloParts(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).formatToParts(parsed);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    day: read("day"),
    month: read("month"),
    year: read("year"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** Célula de data (dd/mm/aaaa). Vazia quando não há data. */
export function day(iso: string | null): SheetCell {
  const parts = iso ? saoPauloParts(iso) : null;
  if (!parts) return text("");

  return {
    kind: "date",
    text: `${parts.day}/${parts.month}/${parts.year}`,
    value: new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
    ),
  };
}

/** Célula de data e hora (dd/mm/aaaa hh:mm). Vazia quando não há data. */
export function dateTime(iso: string | null): SheetCell {
  const parts = iso ? saoPauloParts(iso) : null;
  if (!parts) return text("");

  return {
    kind: "datetime",
    text: `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`,
    value: new Date(
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      ),
    ),
  };
}

/** Abre um arquivo novo. O ExcelJS (~900 KB) entra por `import()` aqui. */
export async function createWorkbook(meta: {
  title: string;
  description?: string;
}): Promise<Workbook> {
  /*
    O pacote resolve para o bundle ESM no navegador e para o CJS no Node, e nos
    dois o construtor está em lugar diferente. O `default` cobre os dois casos
    — sem isso o módulo só roda em um deles, e não dá para testá-lo fora do
    navegador.
  */
  const imported = await import("exceljs");
  const ExcelJS =
    (imported as unknown as { default?: typeof imported }).default ?? imported;

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "HORN";
  workbook.created = new Date();
  workbook.title = meta.title;
  if (meta.description) workbook.description = meta.description;

  return workbook;
}

export async function workbookBytes(workbook: Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Uma aba com cabeçalho, linhas e as larguras já resolvidas. */
export function addSheet(workbook: Workbook, options: SheetOptions): Worksheet {
  const { name, columns, rows, freeze = true, filter = true } = options;
  const sheet = workbook.addWorksheet(name);

  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true, color: { argb: HEADER_COLOR } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };

  // Rolar mil linhas sem o cabeçalho na tela torna a planilha inútil.
  if (freeze) sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const cells of rows) {
    if (!cells) {
      sheet.addRow([]);
      continue;
    }

    const row = sheet.addRow(cells.map(valueOf));

    cells.forEach((cell, index) => {
      const format = cell.format ?? NUMBER_FORMATS[cell.kind];
      if (format) row.getCell(index + 1).numFmt = format;
    });
  }

  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);

    /*
      Largura pelo conteúdo quando não vem definida, presa entre 10 e 38: sem o
      piso, uma coluna de "Canal" fica ilegível; sem o teto, uma observação
      longa estica a coluna e empurra o resto da tabela para fora da tela.
    */
    target.width =
      column.width ??
      Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          rows.reduce(
            (longest, cells) =>
              Math.max(longest, cells?.[index]?.text.length ?? 0),
            column.header.length,
          ) + 2,
        ),
      );

    if (column.wrap) target.alignment = { wrapText: true, vertical: "top" };
  });

  if (filter && columns.length > 0) {
    sheet.autoFilter = `A1:${columnLetter(columns.length)}1`;
  }

  return sheet;
}

function valueOf(cell: SheetCell): string | number | Date {
  return cell.kind === "text" ? cell.text : cell.value;
}

/** "A", "B", ... "Z", "AA". */
function columnLetter(index: number): string {
  let letter = "";
  let remaining = index;

  while (remaining > 0) {
    const rest = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + rest) + letter;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letter;
}
