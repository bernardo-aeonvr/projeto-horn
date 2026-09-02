"use client";

import {
  FolderKanban,
  KeyRound,
  Loader2,
  Pencil,
  Power,
  PowerOff,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import type { StoreAccess } from "@/lib/stores/access";
import {
  formatCurrency,
  formatPercent,
  storeResponsibles,
} from "@/lib/stores/format";
import type { Store, StoreResponsible } from "@/lib/stores/types";
import { cn } from "@/lib/utils";

type StoreListProps = {
  stores: Store[];
  /** Acessos provisionados, indexados pelo id da loja. */
  accessByStore: Record<string, StoreAccess[]>;
  onEdit: (store: Store) => void;
  onManageAccess: (store: Store) => void;
  onToggleActive: (store: Store) => void;
  /** Id da loja cujo status está sendo alterado. */
  pendingId: string | null;
};

/** Situação do acesso da loja, resumida em uma palavra. */
function AccessSummary({ accesses }: { accesses: StoreAccess[] }) {
  if (accesses.length === 0) {
    return <span className="text-xs text-graphite-400">Sem acesso</span>;
  }

  const active = accesses.filter((access) => access.isActive);

  if (active.length === 0) {
    return <span className="text-xs text-graphite-500">Desativado</span>;
  }

  const pending = active.every((access) => access.lastSignInAt === null);

  return (
    <span className="text-xs text-graphite-600">
      {active.length > 1 ? `${active.length} acessos` : active[0].email}
      {pending ? (
        <span className="mt-0.5 block text-graphite-400">
          aguardando 1º acesso
        </span>
      ) : null}
    </span>
  );
}

export function StoreStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-graphite-100 text-graphite-600",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-graphite-400",
        )}
      />
      {active ? "Ativa" : "Inativa"}
    </span>
  );
}

function RowActions({
  store,
  onEdit,
  onManageAccess,
  onToggleActive,
  pending,
  variant,
}: {
  store: Store;
  onEdit: (store: Store) => void;
  onManageAccess: (store: Store) => void;
  onToggleActive: (store: Store) => void;
  pending: boolean;
  variant: "table" | "card";
}) {
  const toggleLabel = store.is_active ? "Inativar" : "Ativar";
  const ToggleIcon = store.is_active ? PowerOff : Power;
  /*
    Acesso contextual aos projetos da loja: leva à tela de Projetos & Propostas
    já filtrada. Evita transformar a tela de Lojas em dashboard nesta etapa.
  */
  const projectsHref = `/projetos-propostas?loja=${store.id}`;

  if (variant === "card") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onEdit(store)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={() => onManageAccess(store)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <KeyRound className="size-3.5" aria-hidden />
          Acesso
        </button>
        <Link
          href={projectsHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <FolderKanban className="size-3.5" aria-hidden />
          Projetos
        </Link>
        <button
          type="button"
          onClick={() => onToggleActive(store)}
          disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ToggleIcon className="size-3.5" aria-hidden />
          )}
          {toggleLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={projectsHref}
        title="Projetos & Propostas"
        aria-label={`Ver projetos de ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <FolderKanban className="size-4" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => onManageAccess(store)}
        title="Acesso da loja"
        aria-label={`Acesso da loja ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <KeyRound className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => onEdit(store)}
        title="Editar"
        aria-label={`Editar ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <Pencil className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => onToggleActive(store)}
        disabled={pending}
        title={toggleLabel}
        aria-label={`${toggleLabel} ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ToggleIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function StoreList({
  stores,
  accessByStore,
  onEdit,
  onManageAccess,
  onToggleActive,
  pendingId,
}: StoreListProps) {
  const [, startTransition] = useTransition();

  const handleToggle = (store: Store) => {
    startTransition(() => onToggleActive(store));
  };

  return (
    <>
      {/* Desktop — tabela */}
      <div className="hidden overflow-hidden rounded-card border border-graphite-200 bg-white shadow-card lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Lojas representadas pela HORN
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 bg-graphite-50/70 text-left">
              <Th>Loja</Th>
              <Th>Segmento</Th>
              <Th>Responsáveis</Th>
              <Th align="right">Valor mensal</Th>
              <Th align="right">Comissão</Th>
              <Th>Acesso</Th>
              <Th>Status</Th>
              <Th align="right">
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr
                key={store.id}
                className={cn(
                  "border-b border-graphite-100 last:border-0 transition-colors hover:bg-graphite-50/50",
                  !store.is_active && "text-graphite-500",
                )}
              >
                <td className="px-4 py-3.5">
                  <p
                    className={cn(
                      "font-medium",
                      store.is_active ? "text-graphite-900" : "text-graphite-600",
                    )}
                  >
                    {store.name}
                  </p>
                  {store.phone ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {store.phone}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  {store.category ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  <ResponsibleNames responsibles={storeResponsibles(store)} />
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-graphite-700">
                  {formatCurrency(store.monthly_fixed_fee)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-graphite-700">
                  {formatPercent(store.default_commission_percent)}
                </td>
                <td className="max-w-[13rem] px-4 py-3.5">
                  <AccessSummary accesses={accessByStore[store.id] ?? []} />
                </td>
                <td className="px-4 py-3.5">
                  <StoreStatusBadge active={store.is_active} />
                </td>
                <td className="px-2 py-2.5">
                  <RowActions
                    store={store}
                    onEdit={onEdit}
                    onManageAccess={onManageAccess}
                    onToggleActive={handleToggle}
                    pending={pendingId === store.id}
                    variant="table"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {stores.map((store) => (
          <li
            key={store.id}
            className="rounded-card border border-graphite-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-graphite-900">
                  {store.name}
                </p>
                <p className="mt-0.5 truncate text-sm text-graphite-500">
                  {store.category ?? "Sem segmento"}
                </p>
              </div>
              <StoreStatusBadge active={store.is_active} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-graphite-100 pt-3.5 text-sm">
              <Cell
                label="Responsáveis"
                value={
                  <ResponsibleContacts
                    responsibles={storeResponsibles(store)}
                  />
                }
              />
              <Cell label="Telefone" value={store.phone ?? "—"} />
              <Cell
                label="Valor mensal"
                value={formatCurrency(store.monthly_fixed_fee)}
              />
              <Cell
                label="Comissão"
                value={formatPercent(store.default_commission_percent)}
              />
            </dl>

            <div className="mt-3 border-t border-graphite-100 pt-3">
              <p className="text-xs text-graphite-500">Acesso da loja</p>
              <div className="mt-0.5">
                <AccessSummary accesses={accessByStore[store.id] ?? []} />
              </div>
            </div>

            <div className="mt-4">
              <RowActions
                store={store}
                onEdit={onEdit}
                onManageAccess={onManageAccess}
                onToggleActive={handleToggle}
                pending={pendingId === store.id}
                variant="card"
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Cell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd className="truncate text-graphite-800 tabular-nums">{value}</dd>
    </div>
  );
}

/** "Leandro Pereira — (11) 99999-1111", ou só o nome quando não há telefone. */
function describe(responsible: StoreResponsible): string {
  return responsible.phone
    ? `${responsible.name} — ${responsible.phone}`
    : responsible.name;
}

/**
 * Responsáveis em uma linha só, para a tabela.
 *
 * São oito colunas competindo por espaço, então aparece o primeiro nome e o
 * resto vira "+N". O `title` traz a lista completa COM os telefones — dá para
 * conferir quem mais responde pela loja sem abrir o formulário.
 */
function ResponsibleNames({
  responsibles,
  max = 1,
}: {
  responsibles: StoreResponsible[];
  max?: number;
}) {
  if (responsibles.length === 0) {
    return <span className="text-graphite-400">—</span>;
  }

  const hidden = responsibles.length - max;

  return (
    <span
      className="inline-flex items-baseline gap-1"
      title={responsibles.map(describe).join("\n")}
    >
      <span className="min-w-0 truncate">
        {responsibles
          .slice(0, max)
          .map((item) => item.name)
          .join(", ")}
      </span>
      {hidden > 0 ? (
        <span className="shrink-0 rounded-md bg-graphite-100 px-1.5 py-0.5 text-xs text-graphite-500">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

/** Máximo de responsáveis exibidos no card antes de virar "+N". */
const CARD_RESPONSIBLES = 2;

/**
 * Responsáveis do card, com o telefone de cada um.
 *
 * O card tem mais espaço que a célula da tabela, e é aqui que o telefone
 * importa: é a tela que se usa no celular, do lado de fora da loja. Cada
 * pessoa ocupa uma linha, e o telefone vai embaixo do nome em texto menor —
 * o mesmo desenho do e-mail sob o nome em Profissionais.
 *
 * Texto, e não link: nenhum telefone de loja é clicável em Horn hoje, e criar
 * a primeira exceção aqui seria inventar um comportamento novo.
 */
function ResponsibleContacts({
  responsibles,
}: {
  responsibles: StoreResponsible[];
}) {
  if (responsibles.length === 0) {
    return <span className="text-graphite-400">—</span>;
  }

  const visible = responsibles.slice(0, CARD_RESPONSIBLES);
  const hidden = responsibles.length - visible.length;

  return (
    <span className="block space-y-1">
      {visible.map((item) => (
        <span key={item.name} className="block">
          <span className="block truncate">{item.name}</span>
          {item.phone ? (
            <span className="block truncate text-xs text-graphite-500">
              {item.phone}
            </span>
          ) : null}
        </span>
      ))}
      {hidden > 0 ? (
        <span
          title={responsibles.slice(CARD_RESPONSIBLES).map(describe).join("\n")}
          className="block text-xs text-graphite-500"
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
