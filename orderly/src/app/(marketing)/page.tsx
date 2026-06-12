import Link from "next/link";
import HeroVisual from "@/components/landing/HeroVisual";
import { Reveal } from "@/components/landing/Reveal";
import { PLANS } from "@/lib/stripe";

const AGENTS = [
  {
    name: "Invoicing & Payments",
    line: "Issues invoices from a sentence, chases the overdue ones, reconciles what's paid.",
    glyph: "₣",
  },
  {
    name: "Bookkeeping & Expenses",
    line: "Categorizes every transaction, keeps the ledger spotless, flags the odd one out.",
    glyph: "∑",
  },
  {
    name: "Documents & Email",
    line: "Reads, classifies, summarizes and files documents and inbox clutter for you.",
    glyph: "❧",
  },
  {
    name: "Scheduling & Clients",
    line: "Books, reminds and follows up — drafts the warm message, you just approve.",
    glyph: "◷",
  },
];

const STEPS = [
  { n: "01", t: "Spin up your instance", d: "Each business gets its own private, isolated workspace. Onboarding takes minutes, not weeks." },
  { n: "02", t: "Connect your tools", d: "Email, bank feed, calendar, storage. Orderly reads the mess so your team doesn't have to." },
  { n: "03", t: "Agents go to work", d: "The four agents handle the repetitive admin continuously — every action logged for you to review." },
  { n: "04", t: "You see order", d: "Clean books, sent invoices, filed documents, a calendar that runs itself. You focus on the work." },
];

export default function LandingPage() {
  return (
    <main className="relative overflow-x-hidden bg-ivory">
      {/* ---------------- Nav ---------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-ink/5 bg-ivory/70 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
            Orderly<span className="text-brass">.</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-ink-muted md:flex">
            <a href="#agents" className="transition hover:text-ink">The agents</a>
            <a href="#how" className="transition hover:text-ink">How it works</a>
            <a href="#security" className="transition hover:text-ink">Security</a>
            <a href="#pricing" className="transition hover:text-ink">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-ink-muted transition hover:text-ink">Sign in</Link>
            <Link
              href="/signup"
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-ivory transition hover:bg-ink-soft"
            >
              Start free
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
              AI agents · for small &amp; medium business
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] text-balance text-ink sm:text-6xl lg:text-7xl">
              Put your business admin on{" "}
              <span className="shimmer-text">autopilot.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Orderly weaves AI agents through your business to handle the endless
              repetitive admin — invoicing, bookkeeping, documents and scheduling —
              and quietly puts your numbers, data and paperwork in perfect order.
              You focus on the work that matters.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-full bg-ink px-7 py-3.5 text-center text-sm font-medium text-ivory shadow-lg shadow-ink/10 transition hover:bg-ink-soft"
              >
                Start your instance free
              </Link>
              <a
                href="#agents"
                className="rounded-full border border-ink/15 bg-ivory/60 px-7 py-3.5 text-center text-sm font-medium text-ink backdrop-blur transition hover:border-ink/30"
              >
                Meet the agents
              </a>
            </div>
            <p className="mt-5 text-xs text-ink-muted">
              No card required · Your own isolated workspace · Every agent action is logged
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section className="border-y border-ink/5 bg-weave">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <p className="font-display text-2xl leading-relaxed text-balance text-ink sm:text-3xl">
              The average small business loses{" "}
              <span className="text-brass-dark">a full working day every week</span> to
              invoicing, chasing payments, sorting receipts, filing paperwork and
              re-typing the same data. Orderly takes all of it off your plate.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Agents ---------------- */}
      <section id="agents" className="mx-auto max-w-6xl px-6 py-28">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
            Four agents. Every repetitive task.
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            Each one is a specialist with its own tools, working only inside your
            business — and showing its work, every step of the way.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {AGENTS.map((a, i) => (
            <Reveal key={a.name} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-ink/10 bg-white/50 p-8 transition hover:border-brass/40 hover:shadow-xl hover:shadow-brass/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-2xl text-brass-light">
                  {a.glyph}
                </div>
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
            <h2 className="font-display text-4xl font-semibold sm:text-5xl">
              From chaos to order in four steps.
            </h2>
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

      {/* ---------------- Security / multi-tenant ---------------- */}
      <section id="security" className="mx-auto max-w-6xl px-6 py-28">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
              Your business, walled off by design.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">
              Every client runs in an isolated instance. Data is separated at the
              database row with strict row-level security, so one company can never
              see another&apos;s numbers. Agents act only for your organization, and
              every outbound message is drafted for your approval — never sent silently.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <ul className="space-y-4">
              {[
                "EU data residency · GDPR / RGPD-aligned",
                "French TVA, EU reverse charge & compliant invoices built in",
                "Per-tenant isolation with row-level security",
                "Full audit trail of every agent action",
                "Human-in-the-loop on all client communication",
              ].map((f) => (
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
            <h2 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
              Simple pricing. One instance per business.
            </h2>
            <p className="mt-4 text-lg text-ink-muted">
              Start free. Upgrade when the agents have already paid for themselves.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key, i) => {
              const plan = PLANS[key];
              const popular = "popular" in plan && plan.popular;
              return (
                <Reveal key={key} delay={i * 80}>
                  <div
                    className={`flex h-full flex-col rounded-2xl border p-8 ${
                      popular
                        ? "border-brass bg-ink text-ivory shadow-2xl shadow-brass/10"
                        : "border-ink/10 bg-white/60 text-ink"
                    }`}
                  >
                    {popular && (
                      <span className="mb-4 inline-flex w-fit rounded-full bg-brass px-3 py-1 text-xs font-medium uppercase tracking-widest text-ink">
                        Most popular
                      </span>
                    )}
                    <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                    <p className={`mt-2 text-sm ${popular ? "text-ivory/70" : "text-ink-muted"}`}>
                      {plan.blurb}
                    </p>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="font-display text-5xl font-semibold">{plan.monthly}&nbsp;€</span>
                      <span className={`mb-2 text-sm ${popular ? "text-ivory/60" : "text-ink-muted"}`}>/mo · HT</span>
                    </div>
                    <ul className={`mt-6 flex-1 space-y-3 text-sm ${popular ? "text-ivory/80" : "text-ink-muted"}`}>
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <span className={popular ? "text-brass-light" : "text-brass-dark"}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/signup?plan=${key}`}
                      className={`mt-8 rounded-full px-6 py-3 text-center text-sm font-medium transition ${
                        popular
                          ? "bg-brass text-ink hover:bg-brass-light"
                          : "bg-ink text-ivory hover:bg-ink-soft"
                      }`}
                    >
                      Get started
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
            <h2 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Let your business run itself in the background.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-ivory/70">
              Spin up your Orderly instance today and watch the admin disappear.
            </p>
            <Link
              href="/signup"
              className="mt-9 inline-flex rounded-full bg-brass px-8 py-4 text-sm font-medium text-ink transition hover:bg-brass-light"
            >
              Start free — no card required
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-ink-muted sm:flex-row">
          <span className="font-display text-lg text-ink">Orderly<span className="text-brass">.</span></span>
          <p>© {new Date().getFullYear()} Orderly. Admin, handled.</p>
          <div className="flex gap-6">
            <a href="#" className="transition hover:text-ink">Privacy</a>
            <a href="#" className="transition hover:text-ink">Terms</a>
            <a href="#" className="transition hover:text-ink">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
