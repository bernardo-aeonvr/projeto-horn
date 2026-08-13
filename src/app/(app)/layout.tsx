import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell
      defaultCollapsed={defaultCollapsed}
      user={{
        name: user.name,
        email: user.email,
        initials: user.initials,
        role: user.role,
        roleLabel:
          user.role === "admin" ? "Administrador" : (user.storeName ?? "Loja"),
      }}
    >
      {children}
    </AppShell>
  );
}
