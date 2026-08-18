"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/auth/site-url";
import {
  createAdminClient,
  isAdminApiConfigured,
  SECRET_KEY_ENV_NAME,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { StoreAccessFormState, StoreAccessResult } from "./types";

/**
 * Provisionamento do acesso de uma loja.
 *
 * Divisão de responsabilidades, de propósito:
 *
 *  - criar a conta em `auth.users` exige credencial privilegiada e é a única
 *    coisa feita pelo cliente administrativo;
 *  - definir papel, loja e status é feito com a sessão do próprio admin, então
 *    a policy `user_profiles_admin_update` continua sendo a autorização real;
 *  - a senha nunca passa pela aplicação: o lojista define a dele por um link
 *    de recuperação do Supabase Auth, de uso único.
 *
 * Nenhuma senha é gerada, exibida, enviada ou gravada em tabela própria.
 */

const LOJAS_PATH = "/lojas";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Instrução mostrada quando a credencial administrativa não foi configurada. */
const MISSING_SECRET_KEY =
  `Criação de acesso indisponível: falta a variável ${SECRET_KEY_ENV_NAME} ` +
  "no ambiente do servidor. Peça ao responsável técnico para configurá-la — " +
  "ela não pode ficar no navegador.";

function failure(
  message: string,
  fieldErrors: Record<string, string> = {},
): StoreAccessFormState {
  return {
    status: "error",
    message,
    fieldErrors,
    setupLink: null,
    succeededAt: null,
  };
}

/** Traduz os erros do Auth que o administrador pode realmente provocar. */
function translateAuthError(error: AuthError): string {
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
      return "Já existe um usuário com este e-mail. Use outro endereço ou peça ao responsável técnico para revisar esse acesso.";
    case "validation_failed":
      return "E-mail inválido. Confira o endereço digitado.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.";
    default:
      console.error("[lojas] falha no provisionamento de acesso", error);
      return "Não foi possível concluir a operação. Tente novamente.";
  }
}

function readTrimmed(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Monta o link de definição de senha.
 *
 * É um link de recuperação do próprio Supabase Auth: expira em cerca de uma
 * hora e só funciona uma vez. `generateLink` devolve o endereço sem disparar
 * e-mail, o que permite ao administrador entregá-lo pelo canal que já usa com
 * a loja — importante porque o projeto ainda não tem SMTP próprio.
 */
async function buildPasswordSetupLink(email: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const siteUrl = await getSiteUrl();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/redefinir-senha` },
  });

  if (error || !data?.properties?.action_link) {
    console.error("[lojas] falha ao gerar link de definição de senha", error);
    return null;
  }

  return data.properties.action_link;
}

/**
 * Cria o acesso de uma loja.
 *
 * A conta nasce sem senha e já confirmada; quem define a senha é o lojista,
 * pelo link devolvido no fim.
 */
export async function provisionStoreAccessAction(
  _prevState: StoreAccessFormState,
  formData: FormData,
): Promise<StoreAccessFormState> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) return failure(authorization.message);

  const storeId = readTrimmed(formData, "storeId");
  const email = readTrimmed(formData, "email").toLowerCase();
  const fullName = readTrimmed(formData, "fullName");

  if (!storeId) {
    return failure("Loja não identificada. Recarregue a página.");
  }

  if (!EMAIL_PATTERN.test(email)) {
    return failure("Revise os campos destacados.", {
      email: "Informe um e-mail válido.",
    });
  }

  const admin = createAdminClient();
  if (!admin) return failure(MISSING_SECRET_KEY);

  const supabase = await createClient();

  // A loja precisa existir antes de criar a conta: assim um id inválido não
  // deixa um usuário órfão em auth.users.
  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle<{ id: string; name: string }>();

  if (!store) {
    return failure("Loja não encontrada. Recarregue a página.");
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      // Sem senha: o lojista define a dele pelo link de recuperação.
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    });

  if (createError) return failure(translateAuthError(createError));

  const userId = created.user?.id;
  if (!userId) {
    return failure("Não foi possível criar o acesso. Tente novamente.");
  }

  /*
    O trigger `handle_new_auth_user` já criou o perfil como loja inativa e sem
    vínculo. Ativar e associar é feito com a sessão do admin, para que a policy
    `user_profiles_admin_update` seja a autorização de verdade.
  */
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .update({
      full_name: fullName || store.name,
      role: "store",
      store_id: storeId,
      is_active: true,
    })
    .eq("id", userId)
    .select("id");

  if (profileError || !profile || profile.length === 0) {
    // Sem perfil configurado a conta não serve para nada e ainda ocuparia o
    // e-mail. Desfaz para o administrador poder tentar de novo.
    await admin.auth.admin.deleteUser(userId);

    console.error("[lojas] falha ao configurar o perfil do acesso", profileError);
    return failure(
      "A conta foi criada, mas não foi possível vinculá-la à loja. Nada foi mantido — tente novamente.",
    );
  }

  const setupLink = await buildPasswordSetupLink(email);

  revalidatePath(LOJAS_PATH);

  return {
    status: "success",
    message: setupLink
      ? `Acesso criado para ${email}. Envie o link abaixo para a loja definir a senha.`
      : `Acesso criado para ${email}. Não foi possível gerar o link agora — use "Gerar novo link" para tentar de novo.`,
    fieldErrors: {},
    setupLink,
    succeededAt: Date.now(),
  };
}

/**
 * Gera um novo link de definição de senha para um acesso existente.
 *
 * É o caminho de recuperação quando o lojista perde o link, nunca entrou ou
 * esqueceu a senha — sem que ninguém precise conhecer ou digitar a senha dele.
 */
export async function createStoreAccessLinkAction(
  userId: string,
): Promise<StoreAccessResult> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) {
    return { ok: false, message: authorization.message };
  }

  if (!isAdminApiConfigured()) {
    return { ok: false, message: MISSING_SECRET_KEY };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: MISSING_SECRET_KEY };

  const supabase = await createClient();

  // Confere pela sessão do admin que o alvo é mesmo um acesso de loja: o
  // cliente administrativo ignora RLS, então a validação precisa vir antes.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, store_id")
    .eq("id", userId)
    .maybeSingle<{ id: string; role: string; store_id: string | null }>();

  if (!profile || profile.role !== "store" || !profile.store_id) {
    return { ok: false, message: "Este acesso não pertence a uma loja." };
  }

  const { data: target, error } = await admin.auth.admin.getUserById(userId);

  if (error || !target.user?.email) {
    return { ok: false, message: "Não foi possível localizar este acesso." };
  }

  const link = await buildPasswordSetupLink(target.user.email);

  if (!link) {
    return {
      ok: false,
      message: "Não foi possível gerar o link agora. Tente novamente.",
    };
  }

  return {
    ok: true,
    message: "Link gerado. Ele vale por cerca de uma hora e só pode ser usado uma vez.",
    link,
  };
}

/**
 * Ativa ou desativa o acesso de uma loja.
 *
 * Não usa credencial privilegiada: é um UPDATE comum em `user_profiles`, e
 * quem autoriza é a policy `user_profiles_admin_update`. Um perfil inativo
 * para de entrar no sistema na próxima requisição, sem apagar histórico.
 */
export async function setStoreAccessActiveAction(
  userId: string,
  isActive: boolean,
): Promise<StoreAccessResult> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) {
    return { ok: false, message: authorization.message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("role", "store")
    .select("id");

  if (error) {
    console.error("[lojas] falha ao alterar o status do acesso", error);
    return {
      ok: false,
      message: "Não foi possível alterar o status deste acesso.",
    };
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Acesso não encontrado ou você não tem permissão para alterá-lo.",
    };
  }

  revalidatePath(LOJAS_PATH);

  return {
    ok: true,
    message: isActive ? "Acesso reativado." : "Acesso desativado.",
  };
}
