import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_ROUTE, safeRedirectTo } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Converte o link enviado por e-mail em uma sessão.
 *
 * Suporta os dois formatos de template do Supabase: `?code=` (PKCE) e
 * `?token_hash=&type=` (verificação por OTP).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectTo(searchParams.get("next"));

  const failureUrl = new URL(LOGIN_ROUTE, request.url);
  failureUrl.searchParams.set("erro", "link_invalido");

  // O próprio Supabase pode devolver o erro na query string.
  if (searchParams.get("error")) {
    return NextResponse.redirect(failureUrl);
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    return NextResponse.redirect(
      error ? failureUrl : new URL(next, request.url),
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    return NextResponse.redirect(
      error ? failureUrl : new URL(next, request.url),
    );
  }

  return NextResponse.redirect(failureUrl);
}
