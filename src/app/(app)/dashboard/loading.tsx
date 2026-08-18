/** Esqueleto exibido enquanto os indicadores são agregados no banco. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando indicadores">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:w-52" />
        <div className="h-11 animate-pulse rounded-lg bg-graphite-100 sm:w-56" />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-card border border-graphite-200 bg-white px-5 py-4 shadow-card"
          >
            <div className="h-3 w-2/3 animate-pulse rounded bg-graphite-100" />
            <div className="mt-3 h-8 w-1/2 animate-pulse rounded bg-graphite-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-graphite-100" />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-card border border-graphite-200 bg-white p-5 shadow-card">
        <div className="h-3 w-40 animate-pulse rounded bg-graphite-100" />
        <div className="mt-4 h-[260px] animate-pulse rounded-lg bg-graphite-100" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-card border border-graphite-200 bg-white p-5 shadow-card"
          >
            <div className="h-3 w-44 animate-pulse rounded bg-graphite-100" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 5 }).map((__, row) => (
                <div key={row}>
                  <div className="h-3 w-1/3 animate-pulse rounded bg-graphite-100" />
                  <div className="mt-1.5 h-2 animate-pulse rounded-full bg-graphite-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
