import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { BarList } from "@/components/dashboard/bar-list";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ErrorState } from "@/components/ui/empty-state";
import type { DashboardPeriod, PeriodRange } from "@/lib/dashboard/period";
import type { StoreDashboardData } from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/stores/format";

import { DashboardFilters } from "./dashboard-filters";
import { ReachedProfessionals } from "./reached-professionals";

type StoreDashboardProps = {
  data: StoreDashboardData;
  range: PeriodRange;
  period: DashboardPeriod;
  from: string;
  to: string;
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
}: StoreDashboardProps) {
  const { metrics } = data;

  const filters = (
    <>
      {/*
        A loja não escolhe qual loja vê: o recorte vem do usuário autenticado.
        Este cabeçalho existe para deixar isso explícito também no celular,
        onde a identificação do topo não cabe.
      */}
      {data.storeName ? (
        <div className="mb-4 sm:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-700">
            Ambiente da loja
          </p>
          <p className="text-base font-semibold text-graphite-900">
            {data.storeName}
          </p>
        </div>
      ) : null}

      <DashboardFilters
        period={period}
        from={from}
        to={to}
        rangeLabel={range.label}
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/*
          Alcance é o total da HORN no período, não o recorte desta loja — o
          texto de apoio precisa dizer isso, senão o número vira uma promessa
          que os dados não sustentam.
        */}
        <KpiCard
          emphasis
          label="Profissionais contatados"
          value={integer(metrics.professionals_contacted)}
          hint="pessoas distintas contatadas pela HORN no período"
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
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          size="sm"
          label="Valor proposto"
          value={formatCurrency(metrics.total_proposed_value)}
          hint="valor inicial das propostas enviadas"
        />
        <KpiCard
          size="sm"
          label="Valor fechado"
          value={formatCurrency(metrics.total_closed_value)}
          hint="soma dos negócios fechados"
        />
        <KpiCard
          size="sm"
          emphasis
          label="Comissão HORN"
          value={formatCurrency(metrics.total_commission_value)}
          hint="sobre os negócios fechados no período"
        />
        <KpiCard
          size="sm"
          label="Negócios perdidos"
          value={integer(metrics.proposals_lost)}
          hint="encerrados sem venda"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section
          title="Segmentos alcançados"
          description="Profissionais contatados pela HORN no período, por área de atuação."
        >
          <BarList
            items={data.segments.map((slice) => ({
              label: slice.label,
              value: slice.active_count,
            }))}
            emptyMessage="Nenhum profissional alcançado neste período."
          />
        </Section>

        <Section
          title="Regiões alcançadas"
          description="Cobertura geográfica dos profissionais contatados pela HORN."
        >
          <BarList
            items={data.regions.map((slice) => ({
              label: slice.label,
              value: slice.active_count,
            }))}
            emptyMessage="Nenhuma região alcançada neste período."
            note="Um profissional pode atuar em mais de uma região, então a soma passa do total de alcançados."
          />
        </Section>
      </div>

      <Section
        title="Profissionais contatados"
        description="Detalhamento do trabalho que a HORN realizou no período."
      >
        <ReachedProfessionals reached={data.reached} />
      </Section>

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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-card border border-graphite-200 bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-sm font-semibold text-graphite-900">{title}</h2>
      {description ? (
        <p className="mt-1 mb-4 text-xs leading-relaxed text-graphite-500">
          {description}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}
