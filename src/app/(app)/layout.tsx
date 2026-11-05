import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <>
      <AppHeader user={user} />
      {children}
    </>
  );
}
