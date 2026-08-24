"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { createAdminClient, SECRET_KEY_ENV_NAME } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { StoreAccessFormState, StoreAccessResult } from "./types";

/**
 * Provisionamento do acesso de uma loja.
 *
 * Divisão de responsabilidades, de propósito:
 *
 *  - criar a conta em `auth.users` e trocar senha exigem credencial
 *    privilegiada, e são as únicas coisas feitas pelo cliente administrativo;
 *  - definir papel, loja e status é feito com a sessão do próprio admin, pela
 *    RPC `claim_store_user`, que confere no banco se a loja é de quem chama.
 *    A autorização continua sendo do banco, não deste arquivo.
 *
 * A senha provisória existe em texto em um único ponto: o retorno da ação, que
 * o administrador lê uma vez e entrega à loja. Ela não é gravada em tabela
 * nenhuma — o banco guarda só o hash do Supabase Auth. A troca no primeiro
 * acesso não é exigida por ora: quem quiser trocar usa /redefinir-senha.
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
    provisionalPassword: null,
    provisionalEmail: null,
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
 * Alfabeto da senha provisória.
 *
 * Sem 0/O, 1/l/I e sem símbolos: a senha vai ser lida em voz alta, digitada à
 * mão do WhatsApp e às vezes copiada de um print. Ambiguidade aqui vira
 * chamado de suporte, não segurança.
 */
const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

/**
 * Senha provisória aleatória.
 *
 * Usa `crypto.getRandomValues` — `Math.random` não serve para credencial. Com
 * 56 símbolos e 14 posições são ~81 bits de entropia.
 *
 * O descarte do resto da divisão evita o viés de módulo, que tornaria as
 * primeiras letras do alfabeto mais prováveis.
 */
function generateProvisionalPassword() {
  const limit =
    Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  const out: string[] = [];

  while (out.length < PASSWORD_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH));

    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
      if (out.length === PASSWORD_LENGTH) break;
    }
  }

  return out.join("");
}

/**
 * Cria o acesso de uma loja.
 *
 * A conta nasce com uma senha provisória aleatória, devolvida uma única vez
 * para o administrador entregar junto com o e-mail. O lojista entra direto com
 * ela — a troca obrigatória no primeiro acesso está desligada por enquanto.
 *
 * A senha não é gravada em lugar nenhum — o banco guarda só o hash do Supabase
 * Auth, e este retorno é a única vez que ela existe em texto.
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

  const password = generateProvisionalPassword();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    });

  if (createError) return failure(translateAuthError(createError));

  const userId = created.user?.id;
  if (!userId) {
    return failure("Não foi possível criar o acesso. Tente novamente.");
  }

  /*
    O trigger `handle_new_auth_user` já criou o perfil, mas ele nasce sem dono:
    quem cria a conta é a chave secreta, e dentro do trigger não existe
    `auth.uid()` de onde derivar um. Um perfil sem dono é invisível para todo
    admin — é isso que impede um administrador de adotar o acesso que o outro
    acabou de provisionar.

    `claim_store_user` é o caminho legítimo dessa adoção. Ela roda com a sessão
    do admin, confere que a loja é dele e reivindica o perfil num UPDATE
    atômico, então continua sendo o banco quem autoriza — não este arquivo.
  */
  const { error: profileError } = await supabase.rpc("claim_store_user", {
    p_user_id: userId,
    p_store_id: storeId,
    p_full_name: fullName || store.name,
  });

  if (profileError) {
    // Sem perfil configurado a conta não serve para nada e ainda ocuparia o
    // e-mail. Desfaz para o administrador poder tentar de novo.
    await admin.auth.admin.deleteUser(userId);

    console.error("[lojas] falha ao configurar o perfil do acesso", profileError);
    return failure(
      "A conta foi criada, mas não foi possível vinculá-la à loja. Nada foi mantido — tente novamente.",
    );
  }

  revalidatePath(LOJAS_PATH);

  return {
    status: "success",
    message: `Acesso criado para ${email}.`,
    fieldErrors: {},
    provisionalPassword: password,
    provisionalEmail: email,
    succeededAt: Date.now(),
  };
}

/**
 * Gera uma nova senha provisória para um acesso existente.
 *
 * É o caminho de recuperação enquanto o projeto não tem SMTP próprio: o
 * "Esqueci minha senha" do lojista não chega, então quem redefine é o
 * administrador, entregando a senha nova pelo mesmo canal de sempre.
 *
 * A senha anterior para de valer no instante em que esta roda.
 */
export async function resetStoreAccessPasswordAction(
  userId: string,
): Promise<StoreAccessResult> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) {
    return { ok: false, message: authorization.message };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: MISSING_SECRET_KEY };

  const supabase = await createClient();

  // Confere pela sessão do admin que o alvo é mesmo um acesso de loja: o
  // cliente administrativo ignora RLS, então a validação precisa vir antes.
  //
  // A mesma leitura resolve o isolamento entre administradores: a policy de
  // `user_profiles` só devolve os perfis do próprio admin, então o acesso de
  // uma loja do outro não é encontrado aqui e nunca chega a ter a senha
  // trocada pela chave secreta.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, store_id")
    .eq("id", userId)
    .maybeSingle<{ id: string; role: string; store_id: string | null }>();

  if (!profile || profile.role !== "store" || !profile.store_id) {
    return { ok: false, message: "Este acesso não pertence a uma loja." };
  }

  const password = generateProvisionalPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password,
  });

  if (updateError) {
    return { ok: false, message: translateAuthError(updateError) };
  }

  revalidatePath(LOJAS_PATH);

  return {
    ok: true,
    message: "Senha provisória gerada. A anterior deixou de valer.",
    password,
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
