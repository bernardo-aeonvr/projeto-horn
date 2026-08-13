"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { HornLockup, HornMark } from "@/components/brand/horn-logo";
import type { AppRole } from "@/lib/auth/session";
import { getNavItems, isNavItemActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarProps = {
  role: AppRole;
  /** Rail de ícones. Só é usado no desktop. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Chamado ao navegar — usado para fechar o drawer no mobile. */
  onNavigate?: () => void;
};

export function Sidebar({
  role,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const items = getNavItems(role);

  return (
    <div className="flex h-full flex-col bg-white">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-graphite-200/70",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="HORN — ir para o dashboard"
          className="flex items-center rounded-md"
        >
          {collapsed ? <HornMark className="h-7 w-auto" /> : <HornLockup />}
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className={cn(
          "flex-1 px-3 py-5",
          collapsed ? "overflow-visible" : "overflow-y-auto scrollbar-slim",
        )}
      >
        {!collapsed ? (
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite-400">
            Menu
          </p>
        ) : null}

        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <SidebarLink
                item={item}
                active={isNavItemActive(pathname, item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      {onToggleCollapse ? (
        <div className="shrink-0 border-t border-graphite-200/70 p-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-graphite-500 transition-colors hover:bg-graphite-50 hover:text-graphite-900",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="size-[18px] shrink-0" aria-hidden />
            )}
            {!collapsed ? <span>Recolher menu</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type SidebarLinkProps = {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
};

function SidebarLink({ item, active, collapsed, onNavigate }: SidebarLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/link relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-gold-50 font-medium text-gold-800"
          : "text-graphite-600 hover:bg-graphite-50 hover:text-graphite-900",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors",
          active
            ? "text-gold-600"
            : "text-graphite-400 group-hover/link:text-graphite-600",
        )}
        aria-hidden
      />

      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>

      {collapsed ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 whitespace-nowrap rounded-md bg-graphite-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-popover transition-opacity duration-100 group-hover/link:opacity-100"
        >
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}
