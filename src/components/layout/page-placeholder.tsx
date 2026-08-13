import { findNavItem } from "@/lib/navigation";

type PagePlaceholderProps = {
  /** Rota da área, usada para recuperar o título e o ícone da navegação. */
  href: string;
  /** O que será construído nesta tela, conforme a especificação. */
  summary: string;
};

/**
 * Estado provisório das áreas do sistema.
 * Substituir pelo conteúdo real conforme cada módulo for implementado.
 */
export function PagePlaceholder({ href, summary }: PagePlaceholderProps) {
  const item = findNavItem(href);
  const Icon = item?.icon;

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center rounded-card border border-dashed border-graphite-300 bg-white px-6 py-14 text-center sm:py-20">
      {Icon ? (
        <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-gold-50">
          <Icon className="size-6 text-gold-600" aria-hidden />
        </span>
      ) : null}

      <span className="mb-3 inline-flex items-center rounded-full border border-graphite-200 bg-graphite-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-graphite-500">
        Em construção
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">{item?.label}</h2>

      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-500">
        {summary}
      </p>
    </section>
  );
}
