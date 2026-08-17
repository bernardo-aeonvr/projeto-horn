import { TriangleAlert } from "lucide-react";

import { BarList } from "@/components/dashboard/bar-list";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { ErrorState } from "@/components/ui/empty-state";
import {
  resolveBucket,
  type DashboardPeriod,
  type PeriodRange,
} from "@/lib/dashboard/period";
import {
  conversionRate,
  type AdminDashboardData,
} from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/stores/format";

import { DashboardFilters } from "./dashboard-filters";
import { StoreResultsTable } from "./store-results-table";

type AdminDashboardProps = {
  data: AdminDashboardData;
  range: PeriodRange;
  period: DashboardPeriod;
  from: string;
  to: string;
  storeId: string;
};

const integer = (value: number) => value.toLocaleString("pt-BR");

export function AdminDashboard({
  data,
  range,
  period,
  from,
  to,
  storeId,
}: AdminDashboardProps) {
  const { metrics, portfolio } = data;
  const selectedStore = data.stores.find((store) => store.id === storeId);
  const conversion = conversionRate(metrics);

  const filters = (
    <DashboardFilters
      period={period}
      from={from}
      to={to}
      rangeLabel={range.label}
      stores={data.stores}
      storeId={storeId}
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

      {selectedStore ? (
        <p className="mb-5 rounded-lg border border-gold-200 bg-gold-50/50 px-4 py-2.5 text-sm text-graphite-700">
          Indicadores comerciais restritos a{" "}
          <strong className="font-semibold text-graphite-900">
            {selectedStore.name}
          </strong>
          . O alcance considera apenas os contatos em que esta loja foi
          apresentada.
        </p>
      ) : null}

      {/*
        Bloco principal. São os seis números que respondem "o que aconteceu no
        período" — todos eventos, nenhum estado de carteira.
      */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          emphasis
          label="Profissionais contatados"
          value={integer(metrics.professionals_contacted)}
          hint="pessoas distintas no período"
        />
        <KpiCard
          label="Projetos recebidos"
          value={integer(metrics.projects_received)}
          hint="demandas que entraram"
        />
        <KpiCard
          label="Propostas enviadas"
          value={integer(metrics.proposals_sent)}
          hint="encaminhadas ao profissional"
        />
        <KpiCard
          label="Negócios fechados"
          value={integer(metrics.proposals_closed)}
          hint="aceites registrados"
        />
        <KpiCard
          label="Valor fechado"
          value={formatCurrency(metrics.total_closed_value)}
          hint="soma dos negócios fechados"
        />
        <KpiCard
          emphasis
          label="Comissão gerada"
          value={formatCurrency(metrics.total_commission_value)}
          hint="percentual preservado em cada negócio"
        />
      </div>

      {/* Faixa de apoio: o mesmo período, em segundo plano. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          size="sm"
          label="Contatos realizados"
          value={integer(metrics.contact_events)}
          hint="eventos, incluindo recontatos"
        />
        <KpiCard
          size="sm"
          label="Propostas recebidas"
          value={integer(metrics.proposals_received)}
          hint="devolvidas pelas lojas"
        />
        <KpiCard
          size="sm"
          label="Negócios perdidos"
          value={integer(metrics.proposals_lost)}
          hint="encerrados sem venda"
        />
        <KpiCard
          size="sm"
          label="Valor proposto"
          value={formatCurrency(metrics.total_proposed_value)}
          hint="valor inicial das propostas enviadas"
        />
        <KpiCard
          size="sm"
          label="Conversão contato → projeto"
          value={
            conversion === null
              ? "—"
              : `${(conversion * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
          }
          hint={
            conversion === null
              ? "sem contatos no período"
              : `${integer(metrics.professionals_with_projects)} de ${integer(metrics.professionals_contacted)} contatados geraram projeto`
          }
        />
      </div>

      <Section
        title="Evolução no período"
        description="Cada ponto usa a data do próprio acontecimento: o contato, a criação do projeto e o fechamento."
      >
        <TrendChart points={data.trend} bucket={resolveBucket(range)} />
      </Section>

      {selectedStore ? (
        /*
          Com uma loja selecionada, a composição da carteira inteira não diz
          nada sobre ela. O que importa é quem esta marca alcançou.
        */
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section
            title={`Segmentos alcançados por ${selectedStore.name}`}
            description="Profissionais distintos que receberam esta marca em um contato do período."
          >
            <BarList
              items={data.reachSegments.map((slice) => ({
                label: slice.label,
                value: slice.active_count,
              }))}
              emptyMessage="Esta loja ainda não foi apresentada a nenhum profissional neste período."
            />
          </Section>

          <Section
            title="Regiões alcançadas"
            description="Distribuição dos profissionais alcançados por região de atuação."
          >
            <BarList
              items={data.reachRegions.map((slice) => ({
                label: slice.label,
                value: slice.active_count,
              }))}
              emptyMessage="Sem alcance registrado neste período."
              note="Um profissional pode atuar em mais de uma região, então a soma passa do total de alcançados."
            />
          </Section>
        </div>
      ) : (
        <>
          <Section
            title="Carteira"
            description="Estado atual da base. Estes números descrevem o cadastro hoje e não mudam com o filtro de período."
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <KpiCard
                size="sm"
                label="Profissionais ativos"
                value={integer(portfolio.professionals_active)}
                hint={`${integer(portfolio.professionals_total)} cadastrados no total`}
              />
              <KpiCard
                size="sm"
                label="Profissionais inativos"
                value={integer(portfolio.professionals_inactive)}
                hint="fora da carteira ativa"
              />
              <KpiCard
                size="sm"
                label="Lojas ativas"
                value={integer(portfolio.stores_active)}
                hint={`${integer(portfolio.stores_total)} cadastradas no total`}
              />
              <KpiCard
                size="sm"
                label="Sem região definida"
                value={integer(portfolio.professionals_without_region)}
                hint="ativos que não entram no gráfico de regiões"
              />
            </div>
          </Section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section
              title="Profissionais por segmento"
              description="Composição da carteira ativa."
            >
              <BarList
                items={data.segments.map((slice) => ({
                  label: slice.label,
                  value: slice.active_count,
                }))}
                emptyMessage="Nenhum profissional cadastrado ainda."
              />
            </Section>

            <Section
              title="Profissionais por região"
              description="Cobertura geográfica da carteira ativa."
            >
              <BarList
                items={data.regions.map((slice) => ({
                  label: slice.label,
                  value: slice.active_count,
                }))}
                emptyMessage="Nenhuma região atribuída ainda."
                note={
                  portfolio.professionals_without_region > 0
                    ? `Um profissional pode atuar em várias regiões, então a soma passa do total. ${integer(portfolio.professionals_without_region)} ativos ainda não têm região definida.`
                    : "Um profissional pode atuar em várias regiões, então a soma passa do total da carteira."
                }
              />
            </Section>
          </div>
        </>
      )}

      <Section
        title="Resultados por loja"
        description="Alcance e resultado comercial de cada loja no período. O alcance vem das lojas apresentadas em cada contato."
      >
        <StoreResultsTable
          results={
            // Com filtro ativo, mostra só a linha da loja escolhida.
            storeId
              ? data.storeResults.filter((row) => row.store_id === storeId)
              : data.storeResults
          }
        />
      </Section>
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
