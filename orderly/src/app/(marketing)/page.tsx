import Link from "next/link";
import HeroVisual from "@/components/landing/HeroVisual";
import { Reveal } from "@/components/landing/Reveal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PLANS } from "@/lib/stripe";
import { getDict } from "@/i18n/server";

export default function LandingPage() {
  const t = getDict();

  const AGENTS = [
    { ...t.agents.invoicing, glyph: "₣" },
    { ...t.agents.bookkeeping, glyph: "∑" },
    { ...t.agents.documents, glyph: "❧" },
    { ...t.agents.scheduling, glyph: "◷" },
  ];
  const STEPS = [
    { n: "01", t: t.how.s1t, d: t.how.s1d },
    { n: "02", t: t.how.s2t, d: t.how.s2d },
    { n: "03", t: t.how.s3t, d: t.how.s3d },
    { n: "04", t: t.how.s4t, d: t.how.s4d },
  ];
  const SECURITY = [t.security.f1, t.security.f2, t.security.f3, t.security.f4, t.security.f5];

  return (
    <main className="relative overflow-x-hidden bg-ivory">
      {/* ---------------- Nav ---------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-ink/5 bg-ivory/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
            Orderly<span className="text-brass">.</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-ink-muted md:flex">
            <a href="#agents" className="transition hover:text-ink">{t.nav.agents}</a>
            <a href="#how" className="transition hover:text-ink">{t.nav.how}</a>
            <a href="#security" className="transition hover:text-ink">{t.nav.security}</a>
            <a href="#pricing" className="transition hover:text-ink">{t.nav.pricing}</a>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/login" className="text-sm text-ink-muted transition hover:text-ink">{t.nav.signin}</Link>
            <Link href="/signup" className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-ivory transition hover:bg-ink-soft">
              {t.nav.start}
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative flex min-h-screen items-center">
        <HeroVisual />
        <div className="mx-auto w-full max-w-6xl px-6 pt-24">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-brass/30 bg-ivory/60 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-brass-dark">
              {t.hero.badge}
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] text-balance text-ink sm:text-6xl lg:text-7xl">
              {t.hero.title1} <span className="shimmer-text">{t.hero.title2}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">{t.hero.sub}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="rounded-full bg-ink px-7 py-3.5 text-center text-sm font-medium text-ivory shadow-lg shadow-ink/10 transition hover:bg-ink-soft">
                {t.hero.ctaPrimary}
              </Link>
              <a href="#agents" className="rounded-full border border-ink/15 bg-ivory/60 px-7 py-3.5 text-center text-sm font-medium text-ink backdrop-blur transition hover:border-ink/30">
                {t.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-5 text-xs text-ink-muted">{t.hero.note}</p>
          </div>
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section className="border-y border-ink/5 bg-weave">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <p className="font-display text-2xl leading-relaxed text-balance text-ink sm:text-3xl">{t.problem}</p>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Agents ---------------- */}
      <section id="agents" className="mx-auto max-w-6xl px-6 py-28">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">{t.agents.title}</h2>
          <p className="mt-4 text-lg text-ink-muted">{t.agents.sub}</p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {AGENTS.map((a, i) => (
            <Reveal key={a.name} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-ink/10 bg-white/50 p-8 transition hover:border-brass/40 hover:shadow-xl hover:shadow-brass/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-2xl text-brass-light">{a.glyph}</div>
                <h3 className="mt-6 font-display text-2xl font-semibold text-ink">{a.name}</h3>
                <p className="mt-3 leading-relaxed text-ink-muted">{a.line}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="border-y border-ink/5 bg-ink text-ivory">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal className="max-w-2xl">
            <h2 className="font-display text-4xl font-semibold sm:text-5xl">{t.how.title}</h2>
          </Reveal>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-ivory/10 bg-ivory/10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 80} className="bg-ink p-8">
                <span className="font-display text-3xl text-brass-light">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory/60">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Security ---------------- */}
      <section id="security" className="mx-auto max-w-6xl px-6 py-28">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">{t.security.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">{t.security.body}</p>
          </Reveal>
          <Reveal delay={120}>
            <ul className="space-y-4">
              {SECURITY.map((f) => (
                <li key={f} className="flex items-start gap-3 rounded-xl border border-ink/10 bg-white/50 p-5">
                  <span className="mt-0.5 text-brass-dark">✓</span>
                  <span className="text-ink">{f}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section id="pricing" className="border-t border-ink/5 bg-weave">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">{t.pricing.title}</h2>
            <p className="mt-4 text-lg text-ink-muted">{t.pricing.sub}</p>
          </Reveal>
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key, i) => {
              const plan = PLANS[key];
              const popular = "popular" in plan && plan.popular;
              return (
                <Reveal key={key} delay={i * 80}>
                  <div className={`flex h-full flex-col rounded-2xl border p-8 ${popular ? "border-brass bg-ink text-ivory shadow-2xl shadow-brass/10" : "border-ink/10 bg-white/60 text-ink"}`}>
                    {popular && (
                      <span className="mb-4 inline-flex w-fit rounded-full bg-brass px-3 py-1 text-xs font-medium uppercase tracking-widest text-ink">{t.pricing.popular}</span>
                    )}
                    <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                    <p className={`mt-2 text-sm ${popular ? "text-ivory/70" : "text-ink-muted"}`}>{plan.blurb}</p>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="font-display text-5xl font-semibold">{plan.monthly}&nbsp;€</span>
                      <span className={`mb-2 text-sm ${popular ? "text-ivory/60" : "text-ink-muted"}`}>{t.pricing.perMonth}</span>
                    </div>
                    <ul className={`mt-6 flex-1 space-y-3 text-sm ${popular ? "text-ivory/80" : "text-ink-muted"}`}>
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <span className={popular ? "text-brass-light" : "text-brass-dark"}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link href={`/signup?plan=${key}`} className={`mt-8 rounded-full px-6 py-3 text-center text-sm font-medium transition ${popular ? "bg-brass text-ink hover:bg-brass-light" : "bg-ink text-ivory hover:bg-ink-soft"}`}>
                      {t.pricing.cta}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <div className="rounded-3xl bg-ink px-8 py-20 text-center text-ivory sm:px-16">
            <h2 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight text-balance sm:text-6xl">{t.cta.title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-ivory/70">{t.cta.sub}</p>
            <Link href="/signup" className="mt-9 inline-flex rounded-full bg-brass px-8 py-4 text-sm font-medium text-ink transition hover:bg-brass-light">
              {t.cta.button}
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-ink-muted sm:flex-row">
          <span className="font-display text-lg text-ink">Orderly<span className="text-brass">.</span></span>
          <p>© {new Date().getFullYear()} Orderly. {t.footer.tagline}</p>
          <div className="flex gap-6">
            <a href="#" className="transition hover:text-ink">{t.footer.privacy}</a>
            <a href="#" className="transition hover:text-ink">{t.footer.terms}</a>
            <a href="#" className="transition hover:text-ink">{t.footer.contact}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
