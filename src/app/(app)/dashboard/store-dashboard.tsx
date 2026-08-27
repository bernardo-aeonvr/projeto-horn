import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { ContactedProfessionalsTable } from "@/components/dashboard/contacted-professionals-table";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { DashboardExportActions } from "@/components/dashboard/export-actions";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Section } from "@/components/dashboard/section";
import { TopProfessionals } from "@/components/dashboard/top-professionals";
import { StatusSummaryCards } from "@/components/opportunities/status-summary-cards";
import { ErrorState } from "@/components/ui/empty-state";
import type { ContactChannel } from "@/lib/contacts/types";
import type { DashboardPeriod, PeriodRange } from "@/lib/dashboard/period";
import { buildStoreReport } from "@/lib/dashboard/report";
import type { StoreDashboardData } from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/stores/format";
import { cn } from "@/lib/utils";

import { DashboardFilters } from "./dashboard-filters";

type StoreDashboardProps = {
  data: StoreDashboardData;
  range: PeriodRange;
  period: DashboardPeriod;
  from: string;
  to: string;
  /** Canal do contato; vazio = todos. Só o que nasce de contato responde. */
  channel: ContactChannel | "";
  /** URL pública do logotipo da loja, ou null quando ela não tem um. */
  logoUrl: string | null;
};

const integer = (value: number) => value.toLocaleString("pt-BR");

/**
 * Visão da loja.
 *
 * Bem mais enxuta que a do admin e sem nenhum filtro de loja: não existe
 * parâmetro para trocar. Todos os números vêm de funções travadas em
 * `current_store_id()`, então o recorte é decidido no banco, pelo perfil do
 * usuário — não pela interface.
 */
export function StoreDashboard({
  data,
  range,
  period,
  from,
  to,
  channel,
  logoUrl,
}: StoreDashboardProps) {
  const { metrics, statusCounts } = data;

  const filters = (
    <>
      {/*
        A loja não escolhe qual loja vê: o recorte vem do usuário autenticado.
        Este cabeçalho existe para deixar isso explícito também no celular,
        onde a identificação do topo não cabe.

        Com logotipo, ele passa a valer em qualquer largura — é a marca da loja
        no painel dela. Sem logotipo, nada muda: continua só no celular, como
        sempre foi, e nenhuma loja das que já existem vê a tela mexer de lugar.
      */}
      {data.storeName ? (
        <div
          className={cn(
            "mb-4 flex items-center gap-3",
            logoUrl ? "" : "sm:hidden",
          )}
        >
          {logoUrl ? (
            /*
              Moldura com altura fixa e `object-contain`: logotipo deitado, em
              pé ou quadrado entra sem esticar e sem cortar, e nunca empurra o
              nome da loja para fora da tela.

              <img> e não next/image: a imagem vem do Storage do Supabase, e o
              otimizador exigiria declarar o host remoto do projeto no build
              para ganhar pouco em um arquivo que já é limitado a 1 MB.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`Logotipo de ${data.storeName}`}
              className="h-11 w-auto max-w-[7.5rem] shrink-0 object-contain sm:h-12 sm:max-w-[10rem]"
            />
          ) : null}

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-700">
              Ambiente da loja
            </p>
            <p className="truncate text-base font-semibold text-graphite-900">
              {data.storeName}
            </p>
          </div>
        </div>
      ) : null}

      {/*
        Mesmo relatório, montado do payload da loja: sem carteira, sem
        comparativo entre lojas e sem lista de contatados, porque esta tela não
        recebe nenhuma dessas coisas.
      */}
      <DashboardFilters
        period={period}
        from={from}
        to={to}
        rangeLabel={range.label}
        channel={channel}
        actions={
          data.error ? null : (
            <DashboardExportActions
              report={buildStoreReport(data, range, period, channel)}
            />
          )
        }
      />
    </>
  );

  if (data.error) {
    return (
      <>
        {filters}
        <ErrorState
          icon={TriangleAlert}
          title="Não foi possível carregar os indicadores"
          message={data.error}
        />
      </>
    );
  }

  return (
    <>
      {filters}

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4 lg:grid-cols-3 xl:grid-cols-5">
        {/*
          Alcance DESTA loja: profissionais distintos a quem ela foi
          apresentada no período (migration 0012). Antes este número era o da
          HORN inteira e saía igual em todos os painéis; agora ele descreve o
          trabalho feito com esta marca na mão.
        */}
        <KpiCard
          emphasis
          label="Profissionais contatados"
          value={integer(metrics.professionals_contacted)}
          hint="pessoas distintas a quem sua loja foi apresentada"
        />
        <KpiCard
          label="Projetos recebidos"
          value={integer(metrics.projects_received)}
          hint="demandas encaminhadas à sua loja"
        />
        <KpiCard
          label="Propostas enviadas"
          value={integer(metrics.proposals_sent)}
          hint="levadas ao profissional"
        />
        <KpiCard
          label="Negócios fechados"
          value={integer(metrics.proposals_closed)}
          hint="aceites registrados"
        />
        <KpiCard
          tone="negative"
          label="Negócios perdidos"
          value={integer(metrics.proposals_lost)}
          hint="recusas registradas"
        />
      </div>

      {/*
        Duas colunas em qualquer largura: com dois cards, a grade de quatro
        deixaria metade da linha vazia.
      */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4">
        <KpiCard
          size="sm"
          label="Valor total de fechamentos"
          value={formatCurrency(metrics.total_closed_value)}
          hint="volume de venda dos negócios fechados"
        />
        <KpiCard
          size="sm"
          emphasis
          label="Comissão HORN"
          value={formatCurrency(metrics.total_commission_value)}
          hint="sobre os negócios fechados no período"
        />
      </div>

      {/*
        Os mesmos cards de Projetos & Propostas, sem clique. Só os projetos
        desta loja: o recorte vem da policy do banco, não da tela.
      */}
      <Section
        title="Situação dos seus projetos"
        description="Onde estão hoje os projetos que entraram no período. “Proposta recebida” não tem card, então a soma pode ficar abaixo de “Projetos recebidos”."
      >
        <StatusSummaryCards counts={statusCounts} />
      </Section>

      {/*
        Diferente do alcance, que é o trabalho da HORN inteira, este ranking é
        estritamente desta loja: ele sai dos projetos que a policy
        `opportunities_read` devolve, e ela só devolve os da própria loja. Um
        profissional que gerou dez projetos para outra marca não aparece aqui,
        e nenhum número dele atravessa.
      */}
      <Section
        title="Top 5 profissionais"
        description="Quem mais gerou projeto para a sua loja no período. Cada projeto conta uma vez, esteja em que status estiver hoje."
      >
        <TopProfessionals items={data.topProfessionals} />
      </Section>

      {/*
        O KPI do topo diz quantos; esta seção diz quais — os mesmos contatos,
        abertos nome a nome. Sem a coluna "Lojas" da versão do admin: quantas
        marcas dividiram a conversa é informação das concorrentes.
      */}
      <Section
        title="Profissionais contatados no período"
        description="Quem recebeu a sua marca em um contato do período. Uma linha por profissional: quem foi contatado mais de uma vez aparece uma vez só, com a contagem na última coluna."
      >
        {data.contactedProfessionalsError ? (
          <p className="py-6 text-sm leading-relaxed text-graphite-500">
            {data.contactedProfessionalsError}
          </p>
        ) : (
          <ContactedProfessionalsTable
            rows={data.contactedProfessionals}
            showStores={false}
          />
        )}
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section
          title="Segmentos alcançados"
          description="Profissionais a quem sua loja foi apresentada no período, por área de atuação."
        >
          <DistributionChart
            items={data.segments.map((slice) => ({
              label: slice.label,
              value: slice.active_count,
            }))}
            shareOf="profissionais alcançados no período"
            emptyMessage="Nenhum profissional alcançado neste período."
          />
        </Section>

        <Section
          title="Regiões alcançadas"
          description="Cobertura geográfica dos profissionais a quem sua loja foi apresentada."
        >
          <DistributionChart
            items={data.regions.map((slice) => ({
              label: slice.label,
              value: slice.active_count,
            }))}
            shareOf="atuações por região dos alcançados"
            emptyMessage="Nenhuma região alcançada neste período."
            note="Um profissional pode atuar em mais de uma região, então a soma passa do total de alcançados."
          />
        </Section>
      </div>

      <p className="mt-4 text-sm text-graphite-500">
        Seus projetos e propostas, com valores e PDFs, ficam em{" "}
        <Link
          href="/projetos-propostas"
          className="font-medium text-gold-700 underline-offset-2 hover:underline"
        >
          Projetos &amp; Propostas
        </Link>
        .
      </p>
    </>
  );
}
