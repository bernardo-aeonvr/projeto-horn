import Link from "next/link";

import { HornLogo } from "@/components/brand/horn-logo";
import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-white px-6 text-center">
      <HornLogo className="mb-8 h-16" />

      <p className="text-sm font-medium uppercase tracking-[0.16em] text-gold-600">
        Erro 404
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-graphite-900">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-graphite-500">
        O endereço acessado não existe ou foi movido.
      </p>

      <Link
        href={DEFAULT_AUTHENTICATED_ROUTE}
        className="mt-7 inline-flex h-11 items-center justify-center rounded-lg bg-gold-500 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gold-600"
      >
        Voltar para o Dashboard
      </Link>
    </div>
  );
}
