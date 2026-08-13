import { Plus, SearchX, Store as StoreIcon, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

/** Nenhuma loja cadastrada — primeiro uso do módulo. */
export function NoStoresYet({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={StoreIcon}
      title="Nenhuma loja cadastrada"
      description="As lojas são as empresas que a HORN representa. Cadastre a primeira para poder vinculá-la aos contatos e às propostas."
      action={
        <Button onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          Cadastrar primeira loja
        </Button>
      }
    />
  );
}

/** Existem lojas, mas nenhuma passou pelos filtros atuais. */
export function NoStoresFound({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      tone="neutral"
      title="Nenhuma loja encontrada"
      description="Nenhum resultado para os filtros aplicados. Ajuste a busca ou volte a ver todas as lojas."
      action={
        <Button variant="secondary" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      }
    />
  );
}

/** A consulta ao Supabase falhou. */
export function StoresLoadError({ message }: { message: string }) {
  return (
    <ErrorState
      icon={TriangleAlert}
      title="Não foi possível carregar as lojas"
      message={message}
    />
  );
}
