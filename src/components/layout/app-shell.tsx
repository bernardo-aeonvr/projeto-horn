"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { UserMenuProfile } from "@/components/layout/user-menu";
import type { AppRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** Cookie que guarda a preferência de menu recolhido entre sessões. */
const SIDEBAR_COOKIE = "horn-sidebar";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

type AppShellProps = {
  user: UserMenuProfile & { role: AppRole };
  defaultCollapsed: boolean;
  children: ReactNode;
};

export function AppShell({ user, defaultCollapsed, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
      return next;
    });
  }, []);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  // Fecha a gaveta ao navegar (inclusive por voltar/avançar do navegador),
  // ajustando o estado durante a renderização em vez de num efeito.
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-svh">
      {/* Navegação permanente — desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 border-r border-graphite-200/70 transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <Sidebar
          role={user.role}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Navegação em gaveta — mobile e tablet */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobileNav}
            className="absolute inset-0 bg-graphite-950/40 animate-fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navegação principal"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-graphite-200 bg-white shadow-popover"
          >
            <button
              type="button"
              onClick={closeMobileNav}
              aria-label="Fechar menu"
              className="absolute right-3 top-3.5 z-10 flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
            >
              <X className="size-5" aria-hidden />
            </button>
            <Sidebar role={user.role} onNavigate={closeMobileNav} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenNavigation={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
