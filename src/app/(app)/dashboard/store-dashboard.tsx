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
    <DashboardFilters
      period={period}
      from={from}
      to={to}
      rangeLabel={range.label}
    />
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
        <KpiCard
          emphasis
          label="Profissionais alcançados"
          value={integer(metrics.professionals_contacted)}
          hint="pessoas distintas a quem sua marca foi apresentada"
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
          description="Profissionais distintos que receberam sua marca, por área de atuação."
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
          description="Cobertura geográfica dos profissionais alcançados."
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
        title="Profissionais alcançados"
        description="Detalhamento do trabalho realizado no período."
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
