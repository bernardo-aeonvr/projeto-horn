import { headers } from "next/headers";

/**
 * Origem pública da aplicação, usada para montar o link do e-mail de
 * recuperação de senha.
 *
 * Prefere NEXT_PUBLIC_SITE_URL (obrigatório em produção, para que o link não
 * dependa do host da requisição) e cai para os headers de encaminhamento.
 */
export async function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
