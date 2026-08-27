import { TriangleAlert } from "lucide-react";

import { ContactedProfessionalsTable } from "@/components/dashboard/contacted-professionals-table";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { DashboardExportActions } from "@/components/dashboard/export-actions";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Section } from "@/components/dashboard/section";
import { TopProfessionals } from "@/components/dashboard/top-professionals";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { StatusSummaryCards } from "@/components/opportunities/status-summary-cards";
import { ErrorState } from "@/components/ui/empty-state";
import {
  resolveBucket,
  type DashboardPeriod,
  type PeriodRange,
} from "@/lib/dashboard/period";
import { buildAdminReport } from "@/lib/dashboard/report";
import type { ContactChannel } from "@/lib/contacts/types";
import type { AdminDashboardData } from "@/lib/dashboard/types";
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
  /** Canal do contato; vazio = todos. Só o que nasce de contato responde. */
  channel: ContactChannel | "";
};

const integer = (value: number) => value.toLocaleString("pt-BR");

export function AdminDashboard({
  data,
  range,
  period,
  from,
  to,
  storeId,
  channel,
}: AdminDashboardProps) {
  const { metrics, portfolio, statusCounts } = data;
  const selectedStore = data.stores.find((store) => store.id === storeId);

  /*
    O relatório é montado do mesmo objeto que a tela abaixo renderiza — com o
    período e a loja já aplicados —, e não de uma segunda consulta. Se um
    número muda aqui, muda no PDF junto.
  */
  const filters = (
    <DashboardFilters
      period={period}
      from={from}
      to={to}
      rangeLabel={range.label}
      stores={data.stores}
      storeId={storeId}
      channel={channel}
      actions={
        data.error ? null : (
          <DashboardExportActions
            report={buildAdminReport(data, range, period, storeId, channel)}
          />
        )
      }
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
        Sete números: o funil do período e o dinheiro que ele produziu.
        Nenhum é derivável de outro.

        A régua para entrar aqui é medir um conjunto de eventos que nenhum
        outro card já mede. É o que mantém de fora os que já existiram:

          contatos realizados  -> mesmo conjunto de "profissionais contatados",
                                  contado por evento em vez de por pessoa
          propostas recebidas  -> etapa do mesmo fluxo de "propostas enviadas"
          valor proposto       -> soma do conjunto de "propostas enviadas"
          conversão            -> construída a partir dos dois primeiros cards

        "Negócios perdidos" e "Valor total de fechamentos" passam nessa régua:
        o primeiro conta um desfecho que nenhum outro card conta (fechado e
        perdido não são complementares — a maior parte dos projetos do período
        continua em aberto no fim dele), e o segundo mede o volume de venda,
        que não se deduz da comissão: o percentual varia por loja.

        Os três indicadores de fechamento saem do MESMO conjunto de projetos,
        em uma única passagem no banco (o `closed_ids` de
        get_admin_dashboard_metrics): contagem, soma de `final_closed_value` e
        soma de `commission_value`. Por construção eles não podem discordar.

        Todos são eventos do período; nenhum estado de carteira entra aqui.
      */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4 lg:grid-cols-3 xl:grid-cols-4">
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
          tone="negative"
          label="Negócios perdidos"
          value={integer(metrics.proposals_lost)}
          hint="recusas registradas"
        />
        <KpiCard
          label="Valor total de fechamentos"
          value={formatCurrency(metrics.total_closed_value)}
          hint="volume de venda dos negócios fechados"
        />
        <KpiCard
          emphasis
          label="Comissão gerada"
          value={formatCurrency(metrics.total_commission_value)}
          hint="receita da HORN nos negócios fechados"
        />
      </div>

      {/*
        Os mesmos cards de Projetos & Propostas, aqui sem clique: o dashboard
        não tem listagem para filtrar. O recorte é o do KPI "Projetos
        recebidos" logo acima — os projetos que entraram no período, na loja
        filtrada —, abertos pelo status em que estão hoje.
      */}
      <Section
        title="Situação dos projetos"
        description="Onde estão hoje os projetos que entraram no período. “Proposta recebida” não tem card, então a soma pode ficar abaixo de “Projetos recebidos”."
      >
        <StatusSummaryCards counts={statusCounts} />
      </Section>

      {/*
        Concentração da demanda. O cliente contata centenas de profissionais e
        recebe projeto de poucos: o ranking mostra quem são, do mesmo conjunto
        de projetos do card acima — por isso a soma de TODAS as posições, antes
        do corte no quinto lugar, é o próprio "Projetos recebidos".

        Contato não entra na conta. Quem foi procurado vinte vezes e não gerou
        projeto não aparece aqui, e é justamente essa a informação.
      */}
      <Section
        title="Top 5 profissionais"
        description="Quem mais gerou projeto no período. Cada projeto conta uma vez, esteja em que status estiver hoje; ser contatado não coloca ninguém na lista."
      >
        <TopProfessionals items={data.topProfessionals} storeId={storeId} />
      </Section>

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
            <DistributionChart
              items={data.reachSegments.map((slice) => ({
                label: slice.label,
                value: slice.active_count,
              }))}
              shareOf="profissionais alcançados no período"
              emptyMessage="Esta loja ainda não foi apresentada a nenhum profissional neste período."
            />
          </Section>

          <Section
            title="Regiões alcançadas"
            description="Distribuição dos profissionais alcançados por região de atuação."
          >
            <DistributionChart
              items={data.reachRegions.map((slice) => ({
                label: slice.label,
                value: slice.active_count,
              }))}
              shareOf="atuações por região dos alcançados"
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
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4">
              <KpiCard
                size="sm"
                label="Profissionais ativos"
                value={integer(portfolio.professionals_active)}
                hint={`${integer(portfolio.professionals_total)} cadastrados no total`}
              />
              <KpiCard
                size="sm"
                label="Lojas ativas"
                value={integer(portfolio.stores_active)}
                hint={`${integer(portfolio.stores_total)} cadastradas no total`}
              />
            </div>
          </Section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section
              title="Profissionais por segmento"
              description="Composição da carteira ativa."
            >
              <DistributionChart
                items={data.segments.map((slice) => ({
                  label: slice.label,
                  value: slice.active_count,
                }))}
                shareOf="profissionais na carteira ativa"
                emptyMessage="Nenhum profissional cadastrado ainda."
              />
            </Section>

            <Section
              title="Profissionais por região"
              description="Cobertura geográfica da carteira ativa."
            >
              <DistributionChart
                items={data.regions.map((slice) => ({
                  label: slice.label,
                  value: slice.active_count,
                }))}
                shareOf="atuações por região na carteira ativa"
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

      {/*
        O KPI do topo diz quantos; esta seção diz quais. Fica junto das tabelas
        analíticas, não entre os cards de número, porque é leitura de detalhe.

        Não se confunde com "Top 5 profissionais": lá a pergunta é quem gera
        demanda, e a origem são os projetos; aqui é quem foi procurado, e a
        origem são os contatos. Um profissional muito contatado que nunca gerou
        projeto aparece nesta lista e não aparece no ranking.
      */}
      <Section
        title="Profissionais contatados no período"
        description={
          selectedStore
            ? `Quem a HORN procurou apresentando ${selectedStore.name}. Uma linha por profissional: quem foi contatado mais de uma vez aparece uma vez só, com a contagem na última coluna.`
            : "Quem a HORN procurou no período. Uma linha por profissional: quem foi contatado mais de uma vez aparece uma vez só, com a contagem na última coluna."
        }
      >
        {data.contactedProfessionalsError ? (
          <p className="py-6 text-sm leading-relaxed text-graphite-500">
            {data.contactedProfessionalsError}
          </p>
        ) : (
          <ContactedProfessionalsTable
            rows={data.contactedProfessionals}
            storeId={storeId}
          />
        )}
      </Section>

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
