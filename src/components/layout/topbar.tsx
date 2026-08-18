"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import type { AppShellUser } from "@/components/layout/app-shell";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { findNavItem } from "@/lib/navigation";

type TopbarProps = {
  user: AppShellUser;
  onOpenNavigation: () => void;
};

/** Cabeçalho fixo: título da área atual, notificações e menu do usuário. */
export function Topbar({ user, onOpenNavigation }: TopbarProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  // A loja vê a mesma tela com outra leitura: o texto de apoio muda junto.
  const description =
    user.role === "store"
      ? (current?.storeDescription ?? current?.description)
      : current?.description;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-graphite-200/70 bg-white/90 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenNavigation}
        aria-label="Abrir menu"
        className="-ml-1 flex size-9.5 shrink-0 items-center justify-center rounded-lg text-graphite-600 transition-colors hover:bg-graphite-100 hover:text-graphite-900 lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold leading-tight text-graphite-900">
            {current?.label ?? "HORN"}
          </h1>

          {/* Deixa explícito qual loja está autenticada. */}
          {user.storeName ? (
            <span className="hidden max-w-[16rem] shrink items-center truncate rounded-md bg-gold-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-800 sm:inline-flex">
              {user.storeName}
            </span>
          ) : null}
        </div>

        {description ? (
          <p className="hidden truncate text-xs leading-tight text-graphite-500 sm:block">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationsMenu />
        <span
          aria-hidden
          className="hidden h-6 w-px bg-graphite-200 sm:block"
        />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
