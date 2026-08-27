/**
 * Código do PostgREST para "faixa pedida não existe".
 *
 * Ele responde 416/PGRST103 quando o `offset` da página passa do total de
 * linhas do resultado — a página 3 de algo que hoje tem uma. Acontece por
 * caminhos normais de uso: URL guardada nos favoritos, botão voltar depois de
 * excluir um registro, e filtro que encolhe o resultado enquanto a tela está
 * numa página adiantada.
 *
 * Não é falha de carregamento, e é importante não tratar como tal: a mensagem
 * de conexão seria mentira e a tela ficaria sem saída, porque a paginação
 * desaparece junto com a lista. Quem recebe este código volta para a primeira
 * página e refaz a consulta.
 */
export const RANGE_NOT_SATISFIABLE = "PGRST103";
