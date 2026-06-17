import Link from "next/link";
import { Logo } from "@/components/brand";
import { LiquidGlass } from "@/components/liquid-glass";
import { Button } from "@/components/ui/Button";
import { PAGE_CONTAINER_CLASS } from "@/styles/pageLayout";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Changelog", href: "#changelog" },
  { label: "Docs", href: "#docs" },
] as const;

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 isolate pt-4">
      <LiquidGlass
        as="nav"
        className={`${PAGE_CONTAINER_CLASS} py-3 sm:py-3.5`}
      >
        <div className="flex h-11 items-center gap-6 sm:h-12">
          <Link
            href="/"
            className="flex shrink-0 items-center text-white"
            aria-label="TaseDeck home"
          >
            <Logo className="block h-6 w-auto" />
          </Link>

          <ul className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-pill px-4 py-2.5 text-[15px] font-medium text-ink-muted transition-colors hover:bg-white/[0.08] hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center md:ml-0">
            <Button className="px-5 py-2.5 text-[15px] sm:px-6 sm:py-3">
              Download
            </Button>
          </div>
        </div>
      </LiquidGlass>
    </header>
  );
}
