/** Rota inicial de quem já está autenticado. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";

export const LOGIN_ROUTE = "/login";

/** Rotas acessíveis sem sessão. */
const PUBLIC_ROUTES = [
  "/login",
  "/esqueci-a-senha",
  "/redefinir-senha",
  "/auth/callback",
] as const;

/**
 * Rotas de autenticação das quais um usuário logado deve ser tirado.
 * `/redefinir-senha` fica de fora de propósito: o fluxo de recuperação chega
 * nela já com uma sessão ativa, e ela também serve para trocar a senha.
 */
const AUTH_ONLY_ROUTES = ["/login", "/esqueci-a-senha"] as const;

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
