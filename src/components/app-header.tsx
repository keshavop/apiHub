import { hasRole, type CurrentUser } from "@/lib/auth/current-user";
import { signOut } from "@/app/actions/auth";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader({ user }: { user: CurrentUser | null }) {
  const links = [{ href: "/apis", label: user?.kind === "partner" ? "My APIs" : "Registry" }];
  if (hasRole(user, "designer")) links.push({ href: "/apis/new", label: "New API" });
  if (hasRole(user, "admin")) links.push({ href: "/admin", label: "Admin" });

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-2.5 sm:px-6">
        <Logo />
        {user ? <NavLinks links={links} /> : null}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-right text-xs leading-tight text-muted md:block">
                <span className="block font-medium text-fg">{user.label}</span>
                {user.kind === "partner" ? `Partner${user.company ? ` · ${user.company}` : ""}` : `Staff · ${user.role}`}
              </span>
              <form action={signOut}>
                <button type="submit" className="h-10 rounded-lg px-3 font-medium text-muted hover:bg-surface-2 hover:text-fg">
                  Sign out
                </button>
              </form>
            </>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
