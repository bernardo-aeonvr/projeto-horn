"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu, type UserMenuProfile } from "@/components/layout/user-menu";
import { findNavItem } from "@/lib/navigation";

type TopbarProps = {
  user: UserMenuProfile;
  onOpenNavigation: () => void;
};

/** Cabeçalho fixo: título da área atual, notificações e menu do usuário. */
export function Topbar({ user, onOpenNavigation }: TopbarProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

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
        <h1 className="truncate text-[15px] font-semibold leading-tight text-graphite-900">
          {current?.label ?? "HORN"}
        </h1>
        {current ? (
          <p className="hidden truncate text-xs leading-tight text-graphite-500 sm:block">
            {current.description}
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
