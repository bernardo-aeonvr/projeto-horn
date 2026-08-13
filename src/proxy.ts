import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_AUTHENTICATED_ROUTE,
  isAuthOnlyRoute,
  isPublicRoute,
  LOGIN_ROUTE,
} from "@/lib/auth/routes";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Renova a sessão do Supabase a cada requisição e faz o gate otimista de rotas.
 *
 * A autorização de verdade continua sendo feita no servidor (layouts, actions)
 * e no banco via RLS — aqui é apenas o redirecionamento de navegação.
 */
export async function proxy(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Não remover: além de validar o usuário, esta chamada renova o token
  // e escreve os cookies atualizados na resposta.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
    }

    return NextResponse.redirect(loginUrl);
  }

  if (user && (isAuthOnlyRoute(pathname) || pathname === "/")) {
    return NextResponse.redirect(
      new URL(DEFAULT_AUTHENTICATED_ROUTE, request.url),
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, exceto:
     * - _next/static, _next/image (assets do build)
     * - arquivos estáticos servidos de /public (logo, ícones, etc.)
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
