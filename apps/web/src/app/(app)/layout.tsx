import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return <AppShell name={user?.displayName ?? "Guest"}>{children}</AppShell>;
}
