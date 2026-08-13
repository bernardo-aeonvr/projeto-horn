import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/** Cliente Supabase para uso em Client Components. */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
