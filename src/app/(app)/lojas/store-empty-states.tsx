import { Plus, SearchX, Store as StoreIcon, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-graphite-300 bg-white px-6 py-14 text-center sm:py-16">
      {children}
    </div>
  );
}

/** Nenhuma loja cadastrada — primeiro uso do módulo. */
export function NoStoresYet({ onCreate }: { onCreate: () => void }) {
  return (
    <Panel>
      <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-gold-50">
        <StoreIcon className="size-6 text-gold-600" aria-hidden />
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">
        Nenhuma loja cadastrada
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-500">
        As lojas são as empresas que a HORN representa. Cadastre a primeira para
        poder vinculá-la aos contatos e às propostas.
      </p>

      <Button onClick={onCreate} className="mt-6">
        <Plus className="size-4" aria-hidden />
        Cadastrar primeira loja
      </Button>
    </Panel>
  );
}

/** Existem lojas, mas nenhuma passou pelos filtros atuais. */
export function NoStoresFound({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <Panel>
      <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-graphite-100">
        <SearchX className="size-6 text-graphite-500" aria-hidden />
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">
        Nenhuma loja encontrada
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-500">
        Nenhum resultado para os filtros aplicados. Ajuste a busca ou volte a
        ver todas as lojas.
      </p>

      <Button variant="secondary" onClick={onClearFilters} className="mt-6">
        Limpar filtros
      </Button>
    </Panel>
  );
}

/** A consulta ao Supabase falhou. */
export function StoresLoadError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-card border border-red-200 bg-red-50/60 px-6 py-12 text-center"
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-red-100">
        <TriangleAlert className="size-6 text-red-600" aria-hidden />
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">
        Não foi possível carregar as lojas
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-600">
        {message}
      </p>
    </div>
  );
}
