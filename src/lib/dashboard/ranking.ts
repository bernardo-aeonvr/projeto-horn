import type { TopProfessional } from "./types";

/**
 * Ranking "Top 5 profissionais".
 *
 * Recebe pronta a contagem de projetos por profissional — a mesma que sai de
 * `summarizeOpportunitiesInRange`, já com o recorte de período e de loja do
 * dashboard aplicado — e devolve as posições que vão à tela.
 *
 * O módulo é puro de propósito: nenhuma consulta, nenhum `@/` em tempo de
 * execução. A ordenação é a parte que precisa ser conferível caso a caso, e
 * assim ela roda isolada.
 *
 * NÃO é um ranking de contatos. Quem foi contatado vinte vezes e não gerou
 * projeto não aparece aqui: a entrada é o conjunto de projetos do período, e
 * um profissional sem projeto simplesmente não está nele.
 */

/** Quantas posições o card mostra. */
export const TOP_PROFESSIONALS_SIZE = 5;

/**
 * Teto de candidatos que vão ao banco só para resolver o empate do último
 * lugar. Empatar em quinto é comum; empatar em quinto com cinquenta pessoas
 * significa que todo mundo gerou um projeto só, e nesse cenário o ranking já
 * não é a ferramenta certa. O corte mantém a URL do `in(...)` sob controle e
 * continua determinístico: acima do teto, quem decide é o id.
 */
const CANDIDATE_LIMIT = 50;

/**
 * Nome de reserva. Hoje é inalcançável: a FK de `opportunities` é
 * `on delete restrict`, então um profissional com projeto não pode ser
 * excluído. Existe para o card não quebrar caso a leitura do nome falhe.
 */
export const UNKNOWN_PROFESSIONAL = "Profissional não identificado";

/** Empate resolvido pelo id: estável, e não depende de nome nenhum. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Quem precisa ter o nome buscado.
 *
 * Só o topo, mais todos os que empatam com a quinta colocação — é entre eles
 * que o nome desempata. Sem isso, um período com trezentos profissionais
 * mandaria trezentos ids ao banco para exibir cinco.
 */
export function rankingCandidates(
  projectsByProfessional: Map<string, number>,
): string[] {
  const sorted = [...projectsByProfessional.entries()].sort(
    (a, b) => b[1] - a[1] || compareIds(a[0], b[0]),
  );

  const cutoff = sorted[TOP_PROFESSIONALS_SIZE - 1]?.[1];
  const candidates =
    cutoff === undefined
      ? sorted
      : sorted.filter(([, projects]) => projects >= cutoff);

  return candidates.slice(0, CANDIDATE_LIMIT).map(([id]) => id);
}

/**
 * Monta as posições finais.
 *
 * Ordem: mais projetos primeiro; empate resolvido pelo nome em ordem
 * alfabética e, se ainda empatar (dois homônimos), pelo id. Nenhum critério
 * depende da ordem em que o banco devolveu as linhas, então duas renderizações
 * dos mesmos dados produzem exatamente a mesma lista.
 *
 * `names` cobre os candidatos de `rankingCandidates`; profissionais fora dali
 * não disputam as cinco vagas e não precisam de nome.
 */
export function buildTopProfessionals(
  projectsByProfessional: Map<string, number>,
  names: Map<string, string>,
): TopProfessional[] {
  return rankingCandidates(projectsByProfessional)
    .map((id) => ({
      professional_id: id,
      name: names.get(id) ?? UNKNOWN_PROFESSIONAL,
      projects: projectsByProfessional.get(id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.projects - a.projects ||
        a.name.localeCompare(b.name, "pt-BR") ||
        compareIds(a.professional_id, b.professional_id),
    )
    .slice(0, TOP_PROFESSIONALS_SIZE);
}
