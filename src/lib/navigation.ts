import {
  FolderKanban,
  LayoutDashboard,
  PhoneCall,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AppRole } from "@/lib/auth/session";

export type NavItem = {
  href: string;
  label: string;
  /** Frase curta exibida abaixo do título no cabeçalho. */
  description: string;
  icon: LucideIcon;
  roles: AppRole[];
};

/**
 * Navegação definida na especificação (seção 5).
 * Admin vê as cinco áreas; a loja tem uma experiência reduzida.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Visão consolidada da carteira e dos resultados",
    icon: LayoutDashboard,
    roles: ["admin", "store"],
  },
  {
    href: "/profissionais",
    label: "Profissionais",
    description: "Gerencie a carteira de profissionais da HORN",
    icon: Users,
    roles: ["admin"],
  },
  {
    href: "/contatos",
    label: "Contatos",
    description:
      "Registre e acompanhe os contatos realizados com os profissionais",
    icon: PhoneCall,
    roles: ["admin"],
  },
  {
    href: "/projetos-propostas",
    label: "Projetos & Propostas",
    description: "Acompanhe as demandas e propostas comerciais da HORN",
    icon: FolderKanban,
    roles: ["admin", "store"],
  },
  {
    href: "/lojas",
    label: "Lojas",
    description: "Gerencie as empresas representadas pela HORN",
    icon: Store,
    roles: ["admin"],
  },
];

export function getNavItems(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Encontra o item de navegação correspondente à rota atual. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
