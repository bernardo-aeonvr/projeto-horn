import type { Metadata } from "next";

import { requireSessionUser } from "@/lib/auth/session";
import {
  loadAdminDashboard,
  loadStoreDashboard,
} from "@/lib/dashboard/queries";
import { parseChannel } from "@/lib/contacts/types";
import { parsePeriod, resolvePeriod } from "@/lib/dashboard/period";
import { storeLogoUrl } from "@/lib/stores/logo";

import { AdminDashboard } from "./admin-dashboard";
import { StoreDashboard } from "./store-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

type DashboardPageProps = {
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    loja?: string;
    canal?: string;
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
    Canal do contato. Vazio = todos, e nesse caso nada é restringido — o mesmo
    `parseChannel` da tela de Contatos, para não existirem duas listas de
    canais no produto.

    Ele recorta só o que nasce de contato. Projeto, proposta, valor e carteira
    seguem com período e loja, porque canal não descreve nenhum deles.
  */
  const channel = parseChannel(params.canal);

  /*
    O papel decide qual experiência renderizar, mas quem garante o isolamento é
    o banco: as funções da loja são travadas em current_store_id() e as do
    admin recusam quem não é admin. Trocar a rota ou o parâmetro na URL não
    abre dado de outra loja.
  */
  if (user.role === "store") {
    const data = await loadStoreDashboard(
      range,
      user.storeId,
      user.storeName,
      channel,
    );

    return (
      <StoreDashboard
        data={data}
        range={range}
        period={period}
        from={from}
        to={to}
        channel={channel}
        // Marca da loja, quando ela tiver uma. Vem da sessão, que já resolve a
        // loja do usuário — nenhuma consulta a mais, e nenhuma outra loja.
        logoUrl={storeLogoUrl(user.storeLogoPath)}
      />
    );
  }

  const storeId = params.loja?.trim() ?? "";
  const data = await loadAdminDashboard(range, storeId, channel);

  return (
    <AdminDashboard
      data={data}
      range={range}
      period={period}
      from={from}
      to={to}
      storeId={storeId}
      channel={channel}
    />
  );
}
