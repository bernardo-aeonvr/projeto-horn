import { exportFileName } from "@/lib/xlsx/file-name";
import {
  addSheet,
  createWorkbook,
  dateTime,
  text,
  workbookBytes,
  type SheetCell,
  type SheetColumn,
} from "@/lib/xlsx/sheet";

import { CHANNEL_LABELS, contactCompany, type Contact } from "./types";

/**
 * O histórico de alcance em planilha.
 *
 * UMA LINHA POR CONTATO — não uma por profissional. É a diferença desta
 * exportação para a de Profissionais e para a tabela "Profissionais
 * contatados" do dashboard, que agrupam: aqui, se a HORN falou com a mesma
 * pessoa três vezes, saem três linhas, porque o que está sendo exportado é o
 * histórico, e é dele que sai "quantas vezes", "quando" e "por qual canal".
 *
 * O estilo (cabeçalho, congelamento, autofiltro, largura, tipo de célula) vem
 * de `@/lib/xlsx/sheet`, o mesmo de Profissionais, de Projetos & Propostas e
 * do dashboard.
 *
 * UM CONTATO CONTINUA SENDO UMA LINHA MESMO COM VÁRIAS LOJAS
 *
 * Um contato pode ter apresentado cinco lojas de uma vez. Elas vão juntas em
 * uma célula só, separadas por ";". Repetir o contato uma vez por loja
 * inflaria qualquer contagem feita em cima da planilha — cinco linhas para uma
 * conversa que aconteceu uma vez.
 *
 * "Evento" é canal como qualquer outro: mesma coluna, mesmo rótulo canônico,
 * nenhuma coluna a mais.
 */

/** Rótulo do recorte, para as propriedades do arquivo e para o nome dele. */
export type ContactExportContext = {
  /** Filtros ativos já legíveis, ex.: "Canal = Evento". */
  filters: string[];
  /** Loja apresentada escolhida no filtro, quando há uma. */
  storeName: string | null;
};

export const contactColumns: SheetColumn[] = [
  { header: "Data do contato", width: 18 },
  { header: "Profissional", width: 30 },
  { header: "Empresa", width: 30 },
  { header: "Segmento", width: 20 },
  { header: "Canal", width: 14 },
  { header: "Lojas apresentadas", width: 38, wrap: true },
  { header: "Observação", width: 38, wrap: true },
];

export function contactRow(contact: Contact): SheetCell[] {
  return [
    /*
      Data e hora na mesma célula, como a tela mostra ("13/08/2026, 15:42") e
      como o tipo `datetime` do módulo compartilhado grava: uma célula de data
      de verdade, que ordena e filtra por período dentro do Excel. Uma segunda
      coluna só com a hora seria texto solto, capaz de discordar desta.
    */
    dateTime(contact.contacted_at),
    text(contact.professional?.name ?? ""),
    /*
      A MESMA empresa que a listagem mostra, pela mesma função: o snapshot
      gravado no dia do contato, e só na falta dele a empresa atual da pessoa.
      Ler `professional.company` direto aqui faria a planilha reescrever a
      história — um contato de agosto passaria a dizer o escritório para onde o
      profissional foi em outubro, e discordaria da tela ao lado.

      É a empresa DO PROFISSIONAL, não a loja apresentada: a loja tem coluna
      própria, mais adiante.
    */
    text(contactCompany(contact) ?? ""),
    text(contact.professional?.segment_name ?? ""),
    // O rótulo canônico do canal, o mesmo do formulário e do badge da lista.
    text(CHANNEL_LABELS[contact.channel]),
    /*
      As lojas apresentadas naquele dia — o snapshot de `contact_stores`, não
      as lojas ativas hoje. Vêm todas, mesmo quando a tela está filtrada por
      uma: o filtro escolhe QUAIS contatos entram, não o que cada um registrou.
    */
    text(contact.stores.map((store) => store.name).join("; ")),
    text(contact.notes ?? ""),
  ];
}

/** "horn-contatos-loja-a-2026-08-26.xlsx" */
export function contactsFileName(
  context: ContactExportContext,
  now = new Date(),
): string {
  return exportFileName("horn-contatos", context.storeName, now);
}

export async function renderContactsWorkbook(
  contacts: Contact[],
  context: ContactExportContext,
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
    title: "Contatos",
    // O recorte vive nas propriedades do arquivo, e não em linhas acima da
    // tabela: o autofiltro precisa que o cabeçalho seja a primeira linha.
    description: `${description} · Gerado em ${generated}`,
  });

  addSheet(workbook, {
    name: "Contatos",
    columns: contactColumns,
    rows: contacts.map(contactRow),
  });

  return workbookBytes(workbook);
}
