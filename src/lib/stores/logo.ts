/**
 * Logotipo da loja — regras compartilhadas pelo formulário e pelas actions.
 *
 * O arquivo sobe direto do navegador para o bucket `store-logos`, com a sessão
 * do próprio usuário, exatamente como os PDFs de proposta: quem autoriza é a
 * policy do Storage, não a aplicação. Depois uma Server Action grava o caminho
 * na loja.
 *
 * Nada aqui é a autorização de verdade. O bucket recusa sozinho tipo e tamanho
 * fora da regra (migration 0011), e as policies recusam pasta de loja alheia —
 * a validação daqui existe para o aviso chegar antes do upload, não no lugar
 * dele.
 */

export const STORE_LOGO_BUCKET = "store-logos";

/**
 * Formatos aceitos. SVG fica de fora: é XML com script possível, e o bucket é
 * público — o navegador receberia o arquivo direto.
 */
export const STORE_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** 1 MB. O mesmo teto declarado no bucket, repetido aqui só para avisar antes. */
export const MAX_STORE_LOGO_BYTES = 1024 * 1024;

export const STORE_LOGO_ACCEPT = STORE_LOGO_MIME_TYPES.join(",");

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type LogoValidation = { ok: true } | { ok: false; message: string };

/** Confere tipo e tamanho antes de gastar uma subida. */
export function validateLogoFile(file: File): LogoValidation {
  if (!(STORE_LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      message: "Envie uma imagem PNG, JPG ou WebP.",
    };
  }

  if (file.size > MAX_STORE_LOGO_BYTES) {
    return {
      ok: false,
      message: "A imagem passa de 1 MB. Envie uma versão mais leve do logotipo.",
    };
  }

  return { ok: true };
}

/**
 * Caminho do objeto: `{loja}/logo-{único}.{ext}`.
 *
 * A pasta é o id da loja porque é isso que as policies conferem. O sufixo
 * único evita colisão e, de quebra, resolve o cache: cada envio produz uma URL
 * nova, então a imagem trocada aparece sem invalidação nenhuma.
 *
 * O nome escolhido pelo usuário não entra no caminho — ele viria com acento,
 * espaço e o que mais o sistema de arquivos dele permitir.
 */
export function buildStoreLogoPath(storeId: string, file: File): string {
  const extension = EXTENSIONS[file.type] ?? "png";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `${storeId}/logo-${unique}.${extension}`;
}

/**
 * URL pública do logotipo.
 *
 * Montada por concatenação, sem cliente e sem rede: é o mesmo endereço que o
 * `getPublicUrl` do SDK devolveria, e serve tanto no servidor quanto no
 * navegador. Devolve null quando a loja não tem logotipo — que é o caso da
 * maioria.
 */
export function storeLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${STORE_LOGO_BUCKET}/${path}`;
}
