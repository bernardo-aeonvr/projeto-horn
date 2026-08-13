import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";

/** A raiz não tem conteúdo próprio: o proxy já direciona para login ou dashboard. */
export default function RootPage() {
  redirect(DEFAULT_AUTHENTICATED_ROUTE);
}
