import {
  FolderKanban,
  LayoutDashboard,
  PhoneCall,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { isAdminOnlyRoute } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/session";

export type NavItem = {
  href: string;
  label: string;
  /** Frase curta exibida abaixo do título no cabeçalho. */
  description: string;
  icon: LucideIcon;
  /** Texto alternativo quando quem vê é uma loja. */
  storeDescription?: string;
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
    storeDescription: "Resultados do trabalho da HORN para a sua loja",
  },
  {
    href: "/profissionais",
    label: "Profissionais",
    description: "Gerencie a carteira de profissionais da HORN",
    icon: Users,
  },
  {
    href: "/contatos",
    label: "Contatos",
    description:
      "Registre e acompanhe os contatos realizados com os profissionais",
    icon: PhoneCall,
  },
  {
    href: "/projetos-propostas",
    label: "Projetos & Propostas",
    description: "Acompanhe as demandas e propostas comerciais da HORN",
    icon: FolderKanban,
    storeDescription: "Os projetos e propostas encaminhados à sua loja",
  },
  {
    href: "/lojas",
    label: "Lojas",
    description: "Gerencie as empresas representadas pela HORN",
    icon: Store,
  },
];

/**
 * Menu do perfil.
 *
 * A divisão sai de `isAdminOnlyRoute`, a mesma lista que o proxy e as páginas
 * usam para autorizar — o menu não pode discordar da proteção de rota.
 */
export function getNavItems(role: AppRole): NavItem[] {
  if (role === "admin") return NAV_ITEMS;

  return NAV_ITEMS.filter((item) => !isAdminOnlyRoute(item.href));
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
