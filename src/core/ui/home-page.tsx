import Link from "next/link";
import type { ModuleInfo } from "../module";
import { Icon } from "./icon";
import { SectionTitle } from "./page-header";

export function HomePage({ modules }: { modules: ModuleInfo[] }) {
  return (
    <div className="flex flex-col gap-10">
      <section className="card relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
        <span className="chip chip-accent">
          <Icon name="sparkles" className="size-3.5" />
          AllHub Project
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          嗨，<span className="text-gradient">歡迎回來</span>
        </h1>
        <p className="mt-2 max-w-md text-muted">今天也辛苦了！想先去哪裡逛逛呢？</p>
        <div aria-hidden className="pointer-events-none absolute top-1/2 right-6 hidden -translate-y-1/2 sm:right-12 sm:block">
          <Icon name="flower-2" className="size-24 text-brand opacity-25" />
          <Icon name="heart" className="absolute -top-4 -left-8 size-7 text-brand opacity-50" />
          <span data-accent="violet" className="absolute -right-4 -bottom-3 text-accent opacity-70">
            <Icon name="sparkles" className="size-8" />
          </span>
        </div>
      </section>

      <section>
        <SectionTitle icon="house">模組</SectionTitle>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <li key={m.id}>
              <Link href={m.href} data-accent={m.accent} className="card card-interactive group flex h-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="icon-tile">{m.icon ? <Icon src={m.icon} /> : <Icon name="sparkles" />}</span>
                  <h2 className="text-lg font-semibold text-ink">{m.name}</h2>
                  <Icon name="chevron-right" className="ml-auto size-5 text-accent transition-transform motion-safe:group-hover:translate-x-1" />
                </div>
                <p className="text-sm leading-relaxed text-muted">{m.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
