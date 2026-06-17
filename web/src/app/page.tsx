import { NavBar } from "@/components/nav/NavBar";
import { HeroSection } from "@/components/path-blocks";
import { PAGE_CONTAINER_CLASS } from "@/styles/pageLayout";

const scrollSections = [
  {
    id: "features",
    label: "Features",
    title: "Registry, installed servers, and topology in one workspace",
    body: "Browse the MCP market, install servers, wire agents, and run probes without leaving the desktop shell.",
  },
  {
    id: "changelog",
    label: "Changelog",
    title: "Shipped weekly with registry-first workflows",
    body: "OAuth for remote MCP, liquid market navigation, graph eligibility, and batch registry probes.",
  },
  {
    id: "docs",
    label: "Docs",
    title: "Guides for agents, headers, and run commands",
    body: "Everything you need to configure stdio and streamable-http transports with the same pipeline as Market → Add.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <NavBar />

      <HeroSection />

      <main className={`${PAGE_CONTAINER_CLASS} pb-32`}>
        {scrollSections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-28 py-24 sm:py-32"
          >
            <div className="mb-8 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                {section.label}
              </span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <div
              className={
                index % 2 === 1 ? "max-w-2xl lg:ml-auto lg:text-right" : "max-w-2xl"
              }
            >
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {section.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
                {section.body}
              </p>
            </div>
          </section>
        ))}

        <div className="h-[100vh]" aria-hidden />
      </main>
    </div>
  );
}
