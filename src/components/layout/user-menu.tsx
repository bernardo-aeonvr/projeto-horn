"use client";

import Link from "next/link";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";

import { Dropdown } from "@/components/ui/dropdown";
import { signOutAction } from "@/lib/auth/actions";

export type UserMenuProfile = {
  name: string;
  email: string;
  /** Rótulo do perfil: "Administrador" ou o nome da loja. */
  roleLabel: string;
};

export function UserMenu({ user }: { user: UserMenuProfile }) {
  return (
    <Dropdown
      triggerLabel="Menu do usuário"
      triggerClassName="flex max-w-36 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-graphite-100 aria-expanded:bg-graphite-100 sm:max-w-56"
      panelClassName="w-64"
      trigger={
        <>
          {/*
            Sem avatar: o nome é quem identifica o usuário. Ele aparece em
            todas as larguras porque, no celular, o gatilho ficaria reduzido a
            uma seta solta — e o rótulo do perfil, que dá o contexto de "quem
            eu sou aqui", só cabe a partir do sm.
          */}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium leading-tight text-graphite-900">
              {user.name}
            </span>
            <span className="hidden truncate text-xs leading-tight text-graphite-500 sm:block">
              {user.roleLabel}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-graphite-400 transition-transform duration-150 group-aria-expanded:rotate-180"
            aria-hidden
          />
        </>
      }
    >
      <div className="min-w-0 border-b border-graphite-100 px-3.5 py-3.5">
        <p className="truncate text-sm font-medium text-graphite-900">
          {user.name}
        </p>
        <p className="truncate text-xs text-graphite-500">{user.email}</p>
        <span className="mt-1.5 inline-flex max-w-full items-center truncate rounded-md bg-gold-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-800">
          {user.roleLabel}
        </span>
      </div>

      <div className="p-1.5">
        <Link
          href="/redefinir-senha"
          role="menuitem"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-graphite-700 transition-colors hover:bg-graphite-50 hover:text-graphite-900"
        >
          <KeyRound className="size-4 text-graphite-400" aria-hidden />
          Alterar senha
        </Link>
      </div>

      <div className="border-t border-graphite-100 p-1.5">
        <form action={signOutAction}>
          <button
            type="submit"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </button>
        </form>
      </div>
    </Dropdown>
  );
}
