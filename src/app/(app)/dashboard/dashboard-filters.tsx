"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { inputBaseClass } from "@/components/ui/text-field";
import {
  CHANNEL_LABELS,
  CONTACT_CHANNELS,
  type ContactChannel,
} from "@/lib/contacts/types";
import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type DashboardPeriod,
} from "@/lib/dashboard/period";
import type { StoreOption } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type DashboardFiltersProps = {
  period: DashboardPeriod;
  from: string;
  to: string;
  /** Rótulo do recorte já resolvido, ex.: "agosto de 2026". */
  rangeLabel: string;
  /** Ausente na visão da loja: ela só tem a si mesma. */
  stores?: StoreOption[];
  storeId?: string;
  /**
   * Canal do contato; vazio = todos.
   *
   * Diferente dos outros dois, este filtro não vale para a tela inteira: ele
   * estreita só o que nasce de contato. Projetos, propostas, valores e
   * carteira ignoram o canal, porque canal não descreve nenhum deles.
   */
  channel?: ContactChannel | "";
  /**
   * Ações da tela (hoje, exportar PDF). Entram nesta faixa, e não em um
   * cabeçalho próprio, porque pertencem ao mesmo recorte que os filtros ao
   * lado definem: o que está selecionado aqui é o que será exportado.
   */
  actions?: React.ReactNode;
};

export function DashboardFilters({
  period,
  from,
  to,
  rangeLabel,
  stores,
  storeId = "",
  channel = "",
  actions,
}: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (next: {
      period?: DashboardPeriod;
      from?: string;
      to?: string;
      storeId?: string;
      channel?: ContactChannel | "";
    }) => {
      const merged = { period, from, to, storeId, channel, ...next };
      const params = new URLSearchParams();

      if (merged.period !== "mes") params.set("periodo", merged.period);
      if (merged.period === "personalizado") {
        if (merged.from) params.set("de", merged.from);
        if (merged.to) params.set("ate", merged.to);
      }
      if (merged.storeId) params.set("loja", merged.storeId);
      if (merged.channel) params.set("canal", merged.channel);

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [period, from, to, storeId, channel, pathname, router],
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <select
        value={period}
        onChange={(event) =>
          apply({ period: event.target.value as DashboardPeriod })
        }
        aria-label="Filtrar por período"
        className={cn(
          inputBaseClass,
          "cursor-pointer sm:w-52",
          period !== "mes" && "border-gold-300 bg-gold-50/60",
        )}
      >
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {PERIOD_LABELS[preset]}
          </option>
        ))}
      </select>

      {period === "personalizado" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(event) => apply({ from: event.target.value })}
            aria-label="Data inicial"
            className={cn(inputBaseClass, "w-auto")}
          />
          <span aria-hidden className="text-sm text-graphite-400">
            até
          </span>
          <input
            type="date"
            value={to}
            onChange={(event) => apply({ to: event.target.value })}
            aria-label="Data final"
            className={cn(inputBaseClass, "w-auto")}
          />
        </div>
      ) : null}

      {stores ? (
        <select
          value={storeId}
          onChange={(event) => apply({ storeId: event.target.value })}
          aria-label="Filtrar por loja"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-56",
            storeId && "border-gold-300 bg-gold-50/60",
          )}
        >
          <option value="">Todas as lojas</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
              {store.is_active ? "" : " (inativa)"}
            </option>
          ))}
        </select>
      ) : null}

      {/*
        Terceiro recorte da tela, no mesmo formato dos outros dois. Os canais
        vêm de CONTACT_CHANNELS/CHANNEL_LABELS, a mesma lista da tela de
        Contatos — não existe uma segunda definição de canal no produto.
      */}
      <select
        value={channel}
        onChange={(event) =>
          apply({ channel: event.target.value as ContactChannel | "" })
        }
        aria-label="Filtrar por canal do contato"
        className={cn(
          inputBaseClass,
          "cursor-pointer sm:w-44",
          channel && "border-gold-300 bg-gold-50/60",
        )}
      >
        <option value="">Todos os canais</option>
        {CONTACT_CHANNELS.map((option) => (
          <option key={option} value={option}>
            {CHANNEL_LABELS[option]}
          </option>
        ))}
      </select>

      <p
        aria-live="polite"
        className={cn(
          "text-sm text-graphite-500 transition-opacity",
          pending && "opacity-50",
        )}
      >
        {rangeLabel}
      </p>

      {/* Empurrado para a direita no desktop; no celular vira a última linha. */}
      {actions ? <div className="sm:ml-auto">{actions}</div> : null}
      </div>

      {/*
        O canal é o único filtro que não vale para a tela inteira, então ele
        precisa dizer isso em voz alta: sem este aviso, "Profissionais
        contatados: 4" ao lado de "Projetos recebidos: 19" parece incoerente,
        quando na verdade os dois estão certos em recortes diferentes.
      */}
      {channel ? (
        <p className="-mt-2 mb-5 rounded-lg border border-gold-200 bg-gold-50/50 px-4 py-2.5 text-sm text-graphite-700">
          Indicadores de contato restritos ao canal{" "}
          <strong className="font-semibold text-graphite-900">
            {CHANNEL_LABELS[channel]}
          </strong>
          . Projetos, propostas e valores seguem sem esse recorte.
        </p>
      ) : null}
    </>
  );
}
