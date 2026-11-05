import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex flex-[1_1_440px] flex-col justify-between gap-10 border-line bg-surface p-8 sm:p-12 lg:border-r">
        <Logo href="/login" />
        <div className="flex max-w-lg flex-col gap-5">
          <h1 className="text-4xl leading-tight font-bold tracking-tight">Your API specs, from GitHub to every partner.</h1>
          <p className="text-base leading-relaxed text-muted">
            One repository is the source of truth. apiHub renders it, versions it, checks every change against your patch
            conventions and shows each partner email only the specs assigned to it.
          </p>
        </div>
        <p className="text-xs text-muted">Partner accounts are created by an apiHub admin.</p>
      </aside>
      <main className="flex flex-[1_1_440px] flex-col gap-6 p-6 sm:p-8">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
