import type { Metadata } from "next";

import { requireSessionUser } from "@/lib/auth/session";
import {
  loadAdminDashboard,
  loadStoreDashboard,
} from "@/lib/dashboard/queries";
import { parsePeriod, resolvePeriod } from "@/lib/dashboard/period";

import { AdminDashboard } from "./admin-dashboard";
import { StoreDashboard } from "./store-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

type DashboardPageProps = {
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    loja?: string;
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const [params, user] = await Promise.all([searchParams, requireSessionUser()]);

  const period = parsePeriod(params.periodo);
  const from = params.de?.trim() ?? "";
  const to = params.ate?.trim() ?? "";
  const range = resolvePeriod(period, from, to);

  /*
    O papel decide qual experiência renderizar, mas quem garante o isolamento é
    o banco: as funções da loja são travadas em current_store_id() e as do
    admin recusam quem não é admin. Trocar a rota ou o parâmetro na URL não
    abre dado de outra loja.
  */
  if (user.role === "store") {
    const data = await loadStoreDashboard(range, user.storeId, user.storeName);

    return (
      <StoreDashboard
        data={data}
        range={range}
        period={period}
        from={from}
        to={to}
      />
    );
  }

  const storeId = params.loja?.trim() ?? "";
  const data = await loadAdminDashboard(range, storeId);

  return (
    <AdminDashboard
      data={data}
      range={range}
      period={period}
      from={from}
      to={to}
      storeId={storeId}
    />
  );
}
