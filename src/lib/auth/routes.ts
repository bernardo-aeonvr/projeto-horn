/** Rota inicial de quem já está autenticado. Vale para os dois perfis. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";

export const LOGIN_ROUTE = "/login";

/** Onde para quem está autenticado mas não tem acesso válido ao sistema. */
export const NO_ACCESS_ROUTE = "/sem-acesso";

/** Troca de senha, feita pelo próprio usuário quando ele quiser. */
export const RESET_PASSWORD_ROUTE = "/redefinir-senha";

/**
 * Rotas acessíveis sem sessão.
 *
 * `/api/keep-alive` é chamada pelo cron da Vercel, que não carrega cookie
 * nenhum. Quem protege essa rota é o `CRON_SECRET` conferido nela mesma, e
 * tudo o que ela faz é gravar o heartbeat técnico e ler dois catálogos.
 */
const PUBLIC_ROUTES = [
  "/login",
  "/esqueci-a-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/api/keep-alive",
] as const;

/**
 * Rotas de autenticação das quais um usuário logado deve ser tirado.
 * `/redefinir-senha` fica de fora de propósito: o fluxo de recuperação chega
 * nela já com uma sessão ativa, e ela também serve para trocar a senha.
 */
const AUTH_ONLY_ROUTES = ["/login", "/esqueci-a-senha"] as const;

/**
 * Áreas exclusivas do admin — fonte única desta divisão.
 *
 * A Sidebar (src/lib/navigation.ts) monta o menu a partir daqui, o proxy barra
 * a navegação e cada página chama `requireAdminUser()`. Uma área nova entra
 * nesta lista e passa a ser protegida nos três lugares.
 */
const ADMIN_ONLY_ROUTES = ["/profissionais", "/contatos", "/lojas"] as const;

function matches(pathname: string, routes: readonly string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isPublicRoute(pathname: string) {
  return matches(pathname, PUBLIC_ROUTES);
}

export function isAuthOnlyRoute(pathname: string) {
  return matches(pathname, AUTH_ONLY_ROUTES);
}

export function isAdminOnlyRoute(pathname: string) {
  return matches(pathname, ADMIN_ONLY_ROUTES);
}

/**
 * Valida o `redirectTo` recebido por query string.
 * Só aceita caminhos internos, para não virar um open redirect.
 */
export function safeRedirectTo(value: string | null | undefined) {
  if (!value) return DEFAULT_AUTHENTICATED_ROUTE;
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
  if (isAuthOnlyRoute(value)) return DEFAULT_AUTHENTICATED_ROUTE;

  return value;
}
