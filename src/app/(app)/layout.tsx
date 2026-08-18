import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { requireSessionUser } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireSessionUser();
  const cookieStore = await cookies();

  // Lido no servidor para que o menu já renderize no estado certo, sem piscar.
  const defaultCollapsed =
    cookieStore.get("horn-sidebar")?.value === "collapsed";

  return (
    <ToastProvider>
      <AppShell
        defaultCollapsed={defaultCollapsed}
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          // Identifica o ambiente autenticado no cabeçalho. Sempre nulo para
          // admin, que não está dentro de nenhuma loja.
          storeName: user.role === "store" ? user.storeName : null,
          roleLabel:
            user.role === "admin" ? "Administrador" : (user.storeName ?? "Loja"),
        }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
