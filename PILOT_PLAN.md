# Tamarun — Lean Pilot Plan

**Start small. Prove it. Then scale.**

This is the low-cost path to validating Tamarun before building the full product or
raising money. The full vision lives in [BUSINESS_MODEL.md](BUSINESS_MODEL.md); this
document is about spending as little as possible to find out whether that vision is real.

The principle for every phase: **don't build what you can fake, don't scale what you
haven't proven.**

---

## Phase 0 — Concierge pilot (Months 1–4)

**Budget: ~FCFA 2–4M (~$3,500–6,500). No app. No company-critical hires. No fundraising.**

### What you run it with

| Need | Lean solution | Cost |
|---|---|---|
| Ledger | **The Tamarun MVP app in [`app/`](app/)** — offline, runs in any phone browser, handles 5 or 200 members; Google Sheet as fallback | FCFA 0 |
| Member receipts & reminders | WhatsApp Business app (free) sent manually; SMS via a bulk-SMS reseller for non-WhatsApp members | ~FCFA 15–25K/mo |
| Digital contributions | The group opens its **own MoMo/OM merchant or collection number** (group-owned — important for trust *and* it keeps you regulatory-clean) | FCFA 0 setup |
| Cash contributions | Recorded in the sheet at the meeting; member gets a WhatsApp receipt same evening | FCFA 0 |
| Trouble-fund levy | A WhatsApp broadcast + MoMo prompt to all members, payout tracked in the sheet | FCFA 0 |
| Your time | You (or one trusted partner) personally act as "the app" for every group | Sweat |
| Transport, airtime, meeting visits | — | ~FCFA 50–80K/mo |

You are the software. Every receipt you send by hand teaches you exactly what the real
product must do — and in what language, at what hour, with what tone.

### Who you pilot with

**5–10 groups, all within personal reach** — your own njangi(s), family members'
meetings, a church group (CWF/CMF type), one market traders' group, and ideally **one
group with diaspora members** (this tests the highest-value stream early). One city
only — wherever you live. Do not pilot with strangers; Phase 0 runs on existing trust.

### Charge from day one

**FCFA 1,000/month per group** (symbolic, paid from the group treasury). This is not for
revenue — it's the only honest test of willingness to pay. A group that won't pay 1,000
for the service will never pay 2,500. Frame it at the general assembly as a service fee,
like the hall rental.

### What "it works" means — Gate 1 (end of Month 4)

Proceed to Phase 1 only if:

- [ ] **≥7 of 10 groups still active** and using you for every sitting (retention)
- [ ] **≥8 groups paid the monthly fee at least 3 times** without being chased (willingness to pay)
- [ ] **≥40% of contribution value arrives digitally** by Month 4 (the fee engine works)
- [ ] **≥1 trouble-fund levy executed end-to-end in under 72 hours** (the killer feature is real)
- [ ] **≥3 groups arrived by referral** you didn't solicit (organic pull exists)
- [ ] You can name, from field notes, the **top 5 features** treasurers begged for

If 3+ boxes fail: stop or pivot. You will have spent under FCFA 4M to learn that —
cheaper than any other lesson in fintech.

---

## Phase 1 — Minimal real product, one city (Months 5–12)

**Budget: ~FCFA 12–20M (~$20–33K). Fundable from savings, friends-and-family, or a
small angel — or run as a diaspora investment njangi, which is perfectly on-brand.**

### Build only what Phase 0 proved

- **Treasurer-side Android app or mobile-web dashboard** (members still need nothing
  but WhatsApp/SMS): group setup, ledger, automatic receipts, fines, trouble-fund levy.
- **One payment aggregator integration** (Maviance/Smobilpay or CinetPay) so MoMo + OM
  collection is automatic instead of you reconciling screenshots.
- Automated WhatsApp notifications (WhatsApp Business API) with SMS fallback.
- Nothing else. No USSD yet, no insurance, no credit scoring, no web diaspora portal —
  diaspora members in pilot groups keep paying via the manual workaround.

Team: **you + one full-stack developer** (FCFA 400–600K/month freelance in Douala/Yaoundé,
or a committed technical co-founder for equity) + 1–2 commissioned part-time ambassadors
in Month 9+.

### Targets

- Migrate the Phase 0 groups, then grow to **60–100 groups** in the one city, mostly via
  referral and two ambassadors.
- Raise price to the real **FCFA 2,500/month Standard tier** + **1% on digital
  contributions** (capped FCFA 500). Grandfather pilot groups at 1,000 for a year —
  they're your references and your testimonial machine.

### Gate 2 (Month 12)

Scale (Phase 2) only if:

- [ ] **≥70 active groups**, group churn **<20%** over the period
- [ ] **≥60% of groups on the paid tier** at full price
- [ ] **Digital contribution share ≥50%** and rising
- [ ] Revenue **≥FCFA 700K/month** and ambassador-acquired groups cost **≤FCFA 20K** each
- [ ] At least **one group you've never met** (fully self-onboarded or ambassador-onboarded,
      zero founder involvement) is running smoothly — proof it scales beyond your charisma

At this point you have what seed investors in this market actually fund: **12 months of
retention data and paying users**, not a deck. The ~$580K raise in the business model
becomes dramatically easier and cheaper in equity terms.

---

## Phase 2 — Scale (Year 2+)

Now, and only now, execute the full BUSINESS_MODEL.md playbook: seed raise, second and
third cities (Bafoussam next — densest tontine culture), ambassador network to 20+,
USSD, the diaspora bridge as a real product, insurance partnership, and the path to
4,600 paying groups / $1M.

---

## What to do this week (literally)

1. **List your 10 candidate groups** and rank by trust-distance to you. Talk to the
   president of the top 3 — pitch the trouble-fund story, not "an app."
2. **Open a WhatsApp Business profile** for Tamarun and design the receipt message
   format (FR + EN + Pidgin versions).
3. **Build the ledger sheet template** once: contributions, fines, loans, trouble fund,
   auto-totals, member view link.
4. **Visit one MoMo agent / MTN service center** and learn the exact process and fees
   for a group collection account, so you can set one up alongside each president.
5. **Attend the next sitting of group #1** and run the meeting's money through the
   sheet live, receipts the same evening.

Total cost of week one: transport and airtime.

---

## Why this sequence protects you

- **Regulatory:** in Phases 0–1 money only ever moves between members and group-owned
  accounts; you touch nothing, so no BEAC/COBAC license question even arises.
- **Financial:** worst case across Phase 0 + a failed Gate 2 is ~FCFA 20M — recoverable.
  The business model's FCFA 350M seed is only deployed *after* paying retention is proven.
- **Product:** every feature in Phase 1 is bought with evidence from Phase 0, so the
  small dev budget builds only things groups already demonstrated they'll pay for.
- **Trust (the real currency):** you scale at the speed referrals allow, which in njangi
  culture is the only speed that doesn't break things.
