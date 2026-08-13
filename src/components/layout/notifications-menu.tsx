"use client";

import { Bell, BellOff } from "lucide-react";

import { Dropdown } from "@/components/ui/dropdown";

/**
 * Central de notificações.
 *
 * Notificações automáticas estão fora do escopo do MVP (spec, seção 22), então
 * por enquanto o painel existe apenas com o estado vazio.
 */
export function NotificationsMenu() {
  return (
    <Dropdown
      triggerLabel="Notificações"
      triggerClassName="relative flex size-9.5 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900 aria-expanded:bg-graphite-100 aria-expanded:text-graphite-900"
      panelClassName="w-[calc(100vw-2rem)] max-w-80"
      trigger={<Bell className="size-[18px]" aria-hidden />}
    >
      <div className="border-b border-graphite-100 px-4 py-3">
        <p className="text-sm font-semibold text-graphite-900">Notificações</p>
      </div>

      <div className="flex flex-col items-center gap-1.5 px-6 py-9 text-center">
        <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-graphite-50">
          <BellOff className="size-5 text-graphite-400" aria-hidden />
        </span>
        <p className="text-sm font-medium text-graphite-800">
          Nenhuma notificação
        </p>
        <p className="text-xs leading-relaxed text-graphite-500">
          Avisos sobre contatos, propostas e fechamentos aparecerão aqui.
        </p>
      </div>
    </Dropdown>
  );
}
