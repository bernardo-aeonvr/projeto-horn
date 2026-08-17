/** Esqueleto exibido enquanto a listagem é consultada no servidor. */
export default function ProjetosLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando projetos">
      <div className="mb-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-11 flex-1 animate-pulse rounded-lg bg-graphite-100 sm:max-w-xs" />
          <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:ml-auto sm:w-40" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:w-52" />
          <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:w-56" />
          <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:w-44" />
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-graphite-200 bg-white shadow-card">
        <div className="h-11 border-b border-graphite-200 bg-graphite-50/70" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-graphite-100 px-4 py-4 last:border-0"
          >
            <div className="h-4 flex-[2] animate-pulse rounded bg-graphite-100" />
            <div className="hidden h-4 flex-1 animate-pulse rounded bg-graphite-100 sm:block" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-graphite-100" />
            <div className="hidden h-4 flex-1 animate-pulse rounded bg-graphite-100 lg:block" />
            <div className="hidden h-4 w-20 animate-pulse rounded bg-graphite-100 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
