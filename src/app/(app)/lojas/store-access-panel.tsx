"use client";

import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Power,
  PowerOff,
  ShieldAlert,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { formatContactedAt } from "@/lib/contacts/period";
import type { StoreAccess } from "@/lib/stores/access";
import {
  provisionStoreAccessAction,
  resetStoreAccessPasswordAction,
  setStoreAccessActiveAction,
} from "@/lib/stores/access-actions";
import { initialStoreAccessFormState, type Store } from "@/lib/stores/types";

type StoreAccessPanelProps = {
  store: Store;
  accesses: StoreAccess[];
  /** `false` quando a credencial administrativa não está configurada. */
  canProvision: boolean;
  onChanged: () => void;
};

/**
 * Acesso da loja, dentro do próprio cadastro.
 *
 * Substitui um módulo de "Usuários", que a especificação não pede (seção 5.1).
 *
 * O acesso nasce com uma senha aleatória, mostrada uma única vez para o
 * administrador entregar junto com o e-mail. A loja entra direto com ela — a
 * troca obrigatória no primeiro acesso está desligada por enquanto.
 */
export function StoreAccessPanel({
  store,
  accesses,
  canProvision,
  onChanged,
}: StoreAccessPanelProps) {
  const { showToast } = useToast();

  const [state, formAction, pending] = useActionState(
    provisionStoreAccessAction,
    initialStoreAccessFormState,
  );

  const [showForm, setShowForm] = useState(accesses.length === 0);
  const lastHandledRef = useRef<number | null>(null);

  // Recarrega a listagem uma única vez por provisionamento bem-sucedido. As
  // credenciais ficam na tela até o administrador fechar o painel.
  useEffect(() => {
    if (
      state.status === "success" &&
      state.succeededAt !== null &&
      state.succeededAt !== lastHandledRef.current
    ) {
      lastHandledRef.current = state.succeededAt;
      setShowForm(false);
      onChanged();
    }
  }, [state, onChanged]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6">
        {!canProvision ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <ShieldAlert
              className="mt-px size-4.5 shrink-0 text-amber-600"
              aria-hidden
            />
            <p className="leading-relaxed">
              A criação de acessos está indisponível: falta a credencial
              administrativa do Supabase no servidor. Os acessos já existentes
              continuam funcionando, e ativar ou desativar segue disponível.
            </p>
          </div>
        ) : null}

        <section>
          <h3 className="mb-3 border-b border-graphite-100 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
            Acessos desta loja
          </h3>

          {accesses.length === 0 ? (
            <p className="py-2 text-sm leading-relaxed text-graphite-500">
              Nenhum acesso configurado. Crie um para que a loja acompanhe os
              próprios resultados — a visão dela é somente leitura.
            </p>
          ) : (
            <ul className="divide-y divide-graphite-100">
              {accesses.map((access) => (
                <AccessRow
                  key={access.userId}
                  access={access}
                  canProvision={canProvision}
                  onChanged={onChanged}
                  onToast={showToast}
                />
              ))}
            </ul>
          )}
        </section>

        {state.provisionalPassword ? (
          <ProvisionalCredentials
            email={state.provisionalEmail ?? ""}
            password={state.provisionalPassword}
          />
        ) : null}

        {showForm ? (
          <section>
            <h3 className="mb-3 border-b border-graphite-100 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
              Novo acesso
            </h3>

            <form action={formAction} className="space-y-4">
              {state.status === "error" && state.message ? (
                <FormAlert tone="error">{state.message}</FormAlert>
              ) : null}

              <input type="hidden" name="storeId" value={store.id} />

              <TextField
                label="E-mail de acesso"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="financeiro@loja.com.br"
                required
                error={state.fieldErrors.email}
                hint="Será o login da loja. Vamos gerar uma senha para você entregar."
              />

              <TextField
                label="Nome do responsável"
                name="fullName"
                autoComplete="off"
                defaultValue={store.contact_name ?? ""}
                placeholder="Opcional"
              />

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={pending || !canProvision}>
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Criando...
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-4" aria-hidden />
                      Criar acesso
                    </>
                  )}
                </Button>

                {accesses.length > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => setShowForm(false)}
                    disabled={pending}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </section>
        ) : (
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            <KeyRound className="size-4" aria-hidden />
            Adicionar outro acesso
          </Button>
        )}

        <p className="text-xs leading-relaxed text-graphite-500">
          O usuário de loja enxerga apenas o Dashboard e os Projetos &amp;
          Propostas da {store.name}, sempre em modo de leitura. Ele não acessa
          Profissionais, Contatos nem o cadastro de Lojas.
        </p>
      </div>
    </div>
  );
}

function AccessRow({
  access,
  canProvision,
  onChanged,
  onToast,
}: {
  access: StoreAccess;
  canProvision: boolean;
  onChanged: () => void;
  onToast: (tone: "success" | "error", message: string) => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [, startTransition] = useTransition();

  async function handleResetPassword() {
    setGenerating(true);
    const result = await resetStoreAccessPasswordAction(access.userId);
    setGenerating(false);

    onToast(result.ok ? "success" : "error", result.message);
    if (result.ok && result.password) setPassword(result.password);
    if (result.ok) onChanged();
  }

  function handleToggle() {
    setToggling(true);

    startTransition(async () => {
      const result = await setStoreAccessActiveAction(
        access.userId,
        !access.isActive,
      );
      setToggling(false);
      onToast(result.ok ? "success" : "error", result.message);
      if (result.ok) onChanged();
    });
  }

  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-graphite-900">
            {access.email}
          </p>
          <p className="mt-0.5 text-xs text-graphite-500">
            {access.fullName ? `${access.fullName} · ` : ""}
            {access.lastSignInAt
              ? `último acesso em ${formatContactedAt(access.lastSignInAt)}`
              : "ainda não entrou"}
          </p>
        </div>

        <AccessStatusBadge active={access.isActive} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleResetPassword()}
          disabled={generating || !canProvision}
          title={
            canProvision
              ? undefined
              : "Indisponível sem a credencial administrativa"
          }
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="size-3.5" aria-hidden />
          )}
          Gerar nova senha
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleToggle}
          disabled={toggling}
        >
          {toggling ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : access.isActive ? (
            <PowerOff className="size-3.5" aria-hidden />
          ) : (
            <Power className="size-3.5" aria-hidden />
          )}
          {access.isActive ? "Desativar acesso" : "Reativar acesso"}
        </Button>
      </div>

      {password ? (
        <ProvisionalCredentials email={access.email} password={password} />
      ) : null}
    </li>
  );
}

export function AccessStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
          : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-graphite-100 px-2.5 py-1 text-xs font-medium text-graphite-600"
      }
    >
      <span
        aria-hidden
        className={
          active
            ? "size-1.5 rounded-full bg-emerald-500"
            : "size-1.5 rounded-full bg-graphite-400"
        }
      />
      {active ? "Ativo" : "Desativado"}
    </span>
  );
}

/**
 * Credenciais de acesso, para o administrador entregar à loja.
 *
 * Aparecem uma única vez. A senha não é guardada em lugar nenhum — o banco tem
 * só o hash — então não há como recuperá-la depois: só gerar outra.
 *
 * O botão copia e-mail e senha juntos, já com um texto pronto, porque é assim
 * que a informação vai ser entregue de verdade: colada em uma conversa.
 */
function ProvisionalCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        `Acesso HORN\nE-mail: ${email}\nSenha: ${password}`,
      );
      setCopied(true);
    } catch {
      // Navegador sem permissão de área de transferência: o texto continua
      // selecionável na tela.
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gold-200 bg-gold-50/60 px-3.5 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gold-800">
        Senha de acesso
      </p>
      <p className="mt-1 text-xs leading-relaxed text-graphite-600">
        Aparece só agora — depois de fechar não há como vê-la de novo, apenas
        gerar outra. Envie por um canal privado. A loja pode trocá-la quando
        quiser em “Esqueci minha senha”.
      </p>

      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-xs text-graphite-500">E-mail</dt>
          <dd className="min-w-0 flex-1 break-all rounded-md bg-white px-2.5 py-1.5 text-xs text-graphite-800">
            {email}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-xs text-graphite-500">Senha</dt>
          <dd className="min-w-0 flex-1 break-all rounded-md bg-white px-2.5 py-1.5 font-mono text-sm font-medium tracking-wide text-graphite-900">
            {password}
          </dd>
        </div>
      </dl>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleCopy()}
        className="mt-2.5"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-600" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied ? "Copiado" : "Copiar e-mail e senha"}
      </Button>
    </div>
  );
}
