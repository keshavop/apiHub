import { AdminNav } from "@/components/admin/admin-nav";
import { requireStaff } from "@/lib/auth/current-user";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireStaff("admin");
  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
      <AdminNav />
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">{children}</main>
    </div>
  );
}
