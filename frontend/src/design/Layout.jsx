import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

const links = [
  { to: "/apply", label: "Apply" },
  { to: "/explainability", label: "Explainability" },
  { to: "/plan", label: "Improvement plan" },
  { to: "/lender", label: "Lender" },
];

const linkClass = ({ isActive }) =>
  `relative py-1 text-sm transition-colors duration-200 ${
    isActive ? "text-ink after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-sage" : "text-ink-muted hover:text-ink"
  }`;

export function Layout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
          <NavLink to="/" className="font-display text-xl text-ink">
            CreditClear
          </NavLink>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
            {user ? (
              <button type="button" onClick={signOut} className="text-sm text-ink-muted transition-colors hover:text-ink">
                Sign out
              </button>
            ) : (
              <NavLink to="/signin" className={linkClass}>
                Sign in
              </NavLink>
            )}
          </nav>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:text-ink md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-5 w-5">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h9" />}
            </svg>
          </button>
        </div>

        {open ? (
          <nav className="border-t border-line px-6 py-4 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-4">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} className={linkClass}>
                  {link.label}
                </NavLink>
              ))}
              {user ? (
                <button type="button" onClick={signOut} className="text-left text-sm text-ink-muted hover:text-ink">
                  Sign out
                </button>
              ) : (
                <NavLink to="/signin" className={linkClass}>
                  Sign in
                </NavLink>
              )}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14 md:py-20">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-xs text-ink-faint sm:flex-row sm:justify-between">
          <span>
            CreditClear · Explainable credit for thin-file borrowers ·{" "}
            <NavLink to="/privacy" className="underline-offset-2 hover:text-ink hover:underline">
              Privacy
            </NavLink>
          </span>
          <span>Live data: RBI, MoSPI, World Bank, operator plan pages</span>
        </div>
      </footer>
    </div>
  );
}
