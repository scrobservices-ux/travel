# Kola — Business Model

**Digitized Njangi, Tontines & Funeral Funds for Cameroon**

> *"Your njangi house, in your pocket — without losing the handshake."*

---

## 1. Executive Summary

Kola digitizes Cameroon's most trusted financial institution: the **njangi house**.
Roughly **half of all Cameroonians** save and borrow through njangis/tontines rather than
banks, and nearly every family belongs to at least one "trouble fund" (funeral/emergency
fund). These groups move enormous sums — but they run on paper notebooks, cash carried to
meetings, treasurer memory, and trust that breaks when records are disputed or money
"disappears."

Kola is **not a bank and does not replace the njangi**. It is the digital ledger,
payment rail, and trust layer that sits underneath the existing social institution:

- **Collect** contributions via MTN MoMo and Orange Money (12M+ users in Cameroon)
- **Record** every franc in a tamper-proof shared ledger all members can see
- **Distribute** pots, loans, and funeral payouts automatically and traceably
- **Connect** the diaspora (US/Europe-based members) to their home njangis

**Revenue** comes from group subscriptions, a small fee on digital contributions, diaspora
remittance margin, funeral microinsurance commissions, and (later) credit-scoring
partnerships with licensed microfinance institutions.

**Target:** 5,000 active groups (~150,000 members) by end of Year 3, reaching operating
profitability in Year 3 on ~FCFA 480M (~$800K) annual revenue.

---

## 2. The Problem

### 2.1 How njangis work today

A typical njangi house meets weekly or monthly. Each sitting involves:

| Activity | Today's method | Pain point |
|---|---|---|
| Contributions | Cash handed to treasurer | Theft risk, transport risk, absent members can't pay |
| Records | Paper notebook ("the book") | Disputes, lost books, one person controls truth |
| The pot / rotation | Cash handed over at meeting | "Chop and run" — winners who stop contributing |
| Trouble/funeral fund | Side ledger + emergency cash calls | Slow payouts when a death occurs; under-collection |
| Njangi loans (with interest) | Treasurer's discretion | Favoritism, no repayment tracking, interest disputes |
| Fines & sanctions | Memory + notebook | Constant arguments |
| Diaspora members | Send via relatives / informal channels | Money skimmed, contributions "forgotten," no visibility |

### 2.2 The pains, ranked by what Cameroonians actually complain about

1. **"Njangi don break"** — groups collapse from disputes over records and missing money.
2. **Funeral fund failures** — a member dies, and the fund takes weeks to collect and pay
   out, right when the family needs cash for the mortuary, transport of the corpse to the
   village, and the death celebration. Funerals in Cameroon routinely cost
   **FCFA 1–5 million** and are socially non-negotiable.
3. **Diaspora exclusion** — bushfallers want to stay in the village/family njangi but
   can't attend, can't verify, and get cheated.
4. **Treasurer burden & risk** — carrying FCFA 500K–2M in cash through town after a
   meeting is genuinely dangerous.
5. **No financial history** — decades of perfect njangi discipline earns a member nothing
   at a bank or MFI. The credit history evaporates.

### 2.3 Why now

- Mobile money penetration is ~42% and climbing; MoMo/OM are already how members send
  "absent contributions" informally — Kola formalizes an existing behavior.
- Smartphone penetration in urban Cameroon (Douala, Yaoundé, Bafoussam, Bamenda, Buea)
  has crossed the threshold where the *treasurer and president* reliably have one, even
  if every member doesn't (our design assumes this asymmetry — see §4).
- CEMAC's payment services regulation now allows fintechs to operate through licensed
  partners without becoming banks (see §7).

---

## 3. Market Size

| Layer | Estimate | Basis |
|---|---|---|
| Population | ~29M | — |
| Adults in informal finance (njangi/tontine) | **~8–10M people** | ~50% participation among adults; many belong to 2–3 groups |
| Estimated active groups | **400K–600K groups** | Avg. 15–40 members/group |
| Mobile money users | ~12M | MTN MoMo + Orange Money |
| Annual flow through tontines (est.) | **FCFA 500B+ (~$850M+)** | Conservative: 8M participants × FCFA 5K/month avg |
| Cameroonian diaspora | ~1M+ (US, France, Germany, UK, Belgium) | Heavy remitters; remittances ~$365M+/yr official, far more informal |

**Serviceable obtainable market (5 yrs):** urban + diaspora-connected groups with a
smartphone-holding executive — conservatively **50,000 groups / 1.5M members**. Capturing
10% = the Year 3–5 plan below.

Sources: [Business in Cameroon — Orange Money](https://www.businessincameroon.com/finance/2805-14703-cameroon-emerges-as-key-market-for-orange-money-in-africa),
[Fair Observer — Tontines in Cameroon](https://www.fairobserver.com/region/africa/tontines-informal-financial-sector-and-sustainable-development-cameroon/),
[ResearchGate — Domestic saving mobilisation in Cameroon](https://www.researchgate.net/publication/237475339_Domestic_saving_mobilisation_and_small_business_creation_The_case_of_Cameroon).

---

## 4. The Product

### 4.1 Design principles (cultural, not just technical)

1. **The meeting survives.** Njangi is social: food, palaver, solidarity. Kola
   handles money and records *around* the meeting; it never tells people to stop meeting.
2. **The president and treasurer are the users; members are beneficiaries.** Only the
   executive needs a smartphone. Members interact via **USSD, SMS, and WhatsApp** —
   no app required to contribute or check balances.
3. **Bilingual + Pidgin.** Full French/English, with Pidgin voice notes and prompts
   ("You don pay ya njangi for this month — 10,000 FCFA. Tank you!").
4. **Offline-tolerant.** Cash contributions at the meeting are recorded in-app and
   reconciled; digital is encouraged, never forced.
5. **Radical transparency.** Every member gets an SMS/WhatsApp receipt for every
   transaction. The ledger is append-only; even the treasurer cannot silently edit history.

### 4.2 Core modules

**A. Njangi (rotating pot)**
- Group setup: contribution amount, frequency, rotation order (fixed, drawn by ballot
  in-app, or auction/bidding — all three exist in Cameroon).
- Auto-collection via MoMo/OM on contribution day; cash entries logged by treasurer with
  member SMS confirmation ("Reply 1 to confirm you paid 5,000 cash").
- Pot disbursed to the beneficiary's MoMo/OM wallet, with the full group notified.
- Late/missed payment tracking, automatic fine calculation per the group's own rules.

**B. Tontine savings & in-group lending**
- Accumulating savings ("caisse") with year-end share-out (commonly before Christmas or
  the rentrée scolaire — Kola makes the September/December share-out a marketing moment).
- In-group loans at the group's interest rate, with schedules, reminders, and guarantor
  (surety) tracking — digitizing the "njangi loan with two sureties" practice.

**C. Trouble fund / funeral fund**
- Standing fund with defined benefits ("death of member: 500K; death of parent: 200K;
  hospitalization: 100K" — configurable, because every group's constitution differs).
- **One-tap emergency levy**: when a death occurs, the president triggers a levy and
  every member gets a MoMo prompt simultaneously. Target: **payout in 48 hours, not
  3 weeks.** This is the single most emotionally powerful feature we have.
- Optional **funeral microinsurance top-up** underwritten by a licensed insurer
  (Activa, Prudential Beneficial, Allianz Cameroon — partnership, see §6.4): the group's
  fund pays the first FCFA 300K, insurance tops up to FCFA 1M+.

**D. Diaspora bridge**
- Members abroad pay contributions by card/bank transfer/Apple Pay (via an international
  PSP); Kola converts and settles into the group fund in FCFA.
- Diaspora members see the same ledger as everyone else — the #1 ask of bushfallers.
- Village development associations (réunions de ressortissants) and diaspora cultural
  meetings (in Maryland, Paris, Berlin…) can run *entire* njangis on Kola across borders.

**E. Group governance**
- Digital constitution (rules, fines, benefits) stored in-app.
- Meeting attendance register, agenda, and minutes.
- Elections/ballot drawing for rotation order.
- Exportable PDF reports for the general assembly.

### 4.3 Channels

| Channel | Who | Capability |
|---|---|---|
| Android app (small APK, low-data) | Presidents, treasurers, urban members | Full |
| WhatsApp bot | Most members | Pay, check balance, receipts, ledger view |
| USSD (`*XYZ#`) | Feature-phone members | Pay, confirm cash, check balance |
| SMS | Everyone | Receipts, reminders, levy alerts |
| Web dashboard | Diaspora, large associations | Full + multi-group |

### 4.4 What we deliberately do NOT do (v1)

- We do **not** hold member funds ourselves (regulatory — see §7).
- We do **not** lend our own capital.
- We do **not** match strangers into groups ("open tontines"). Cameroon's njangi trust
  model is social/ethnic/professional; stranger-matching is how fintech tontines die.
  Existing groups only.

### 4.5 Njangi models — the product roadmap (and the tiering ladder)

Cameroonians run njangis in many shapes. Each model is a "house type" Kola can support;
together they form both a product roadmap and the basis for tiering (simple = free,
complex = paid). Built today: **✅**. Designed/next: **▢**.

| Model | How it works | Who relates to it | Build | Tier |
|---|---|---|---|---|
| **Basic rotating njangi** ✅ | Fixed monthly amount; the pot rotates to one member each sitting | Everyone — the default njangi | Done | Start (free) |
| **Trouble / funeral fund** ✅ | Standing fund + one-tap emergency levy; fast payout | Every family & meeting | Done | Start (free) |
| **Savings caisse + member loans** ✅ | 25% of each contribution saved; lends to members at 2%/mo | Traders, associations, "loan njangi" | Done | Standard |
| **Multi-year roll-over savings** ✅ | Year-end: each member cashes out or rolls their stake forward | Long-running investment-minded houses | Done | Elite |
| **Bidding / auction njangi (enchère)** ▢ | Each round members bid a discount for the pot; the discount is shared to the others as interest | **Bamiléké heartland** — deeply familiar, sophisticated | Medium | Elite |
| **Pure savings club ("December / Christmas njangi")** ▢ | No rotation; everyone saves, one big share-out before Christmas / school resumption | Women's groups, salary earners | Easy | Standard |
| **Daily collector ("asusu" / tontine journalière)** ▢ | Fixed daily deposit to a collector for ~31 days; member gets ~30 back, collector keeps a day as fee | **Market buyam-sellam** | Easy | Standard |
| **Goal / project njangi** ▢ | Group saves toward a named target (land, zinc, school fees, equipment); pays out on schedule or at goal | Families, youth, cooperatives | Easy | Standard |
| **Asset / bulk-buy njangi ("njangi for things")** ▢ | The pot buys physical items in rotation — bags of rice, zinc, plates, "kaba" fabric, furniture | **Women's groups** especially | Medium | Standard |
| **Ceremony fund ("born-house / marriage njangi")** ▢ | Reciprocal contributions for members' weddings, births, celebrations — "you helped me, I help you" | Villages, family unions | Medium | Standard |

**Recommendation on what to build next:** the **daily-collector** and **pure-savings
("December njangi")** models are the cheapest to add and unlock two huge, distinct
segments — market traders (daily) and salaried women's groups (Christmas). The
**bidding/auction njangi** is the prestige feature for the Bamiléké tontine heartland and
the strongest Elite differentiator, but it's more complex; build it once the first paid
groups validate the savings caisse. The **asset/bulk-buy** model is the sleeper hit with
women's groups and pairs naturally with merchant partnerships later (a supplier delivers
the rice/zinc the njangi bought).

---

## 5. Competition & Differentiation

| Competitor | Model | Why Kola wins |
|---|---|---|
| Paper notebook + cash (the real competitor) | Free, trusted, familiar | We keep the ritual, remove the disputes; freemium entry costs nothing |
| Raw MoMo/OM transfers to treasurer | Already used informally | No ledger, no group visibility, no rules engine — we sit on top of MoMo, not against it |
| Tontiin and similar W. African tontine apps | App-first, often stranger-matching | Cameroon-specific (Pidgin, trouble-fund benefits, constitution engine), exec-centric design, USSD/WhatsApp for non-smartphone members |
| MaTontine (Senegal) and francophone analogues | Tontine + credit scoring | Not present in CEMAC; we own the Cameroon trust networks first |
| MFIs / cooperative credit unions (CamCCUL etc.) | Formal savings | Partners, not competitors — we feed them scored borrowers (§6.5) |

**Moat:** the group's entire financial history and constitution lives in Kola.
Switching costs grow every meeting. Network effects are *intra-group* (one president
onboards 30 members) and *inter-group* (members belong to 2–3 groups and carry Kola
between them).

---

## 6. Revenue Model

Five streams, sequenced. Prices in FCFA (≈ XAF 600 = $1).

### 6.1 Group subscriptions — billed annually "at the share-out"

The key billing insight is **timing**. Every njangi has one day a year — the **year-end
share-out** ("njangi don end," typically December) — when the whole house is gathered and
the treasury is full. That is the natural, culturally-native moment to collect an annual
fee: the assembly decides together, it's paid once from the group treasury (a line item
like the hall or the drinks), and one social decision per year crushes the churn that
monthly card-billing suffers.

Three named tiers, all renewed yearly at the share-out (live in the app's **Plan** tab):

| Tier | Price | Includes |
|---|---|---|
| **Kola Start** | **Free forever** (renew free each year) | 1 house, ≤ 15 members, **basic rotating njangi**, trouble fund, receipts, cash recording |
| **Kola Standard** | **FCFA 24,000/year** (~$40, ≈ 2,000/mo) | Unlimited members, **savings caisse + member loans at interest**, fines engine, reports & CSV, priority support |
| **Kola Elite** | **FCFA 100,000/year** (~$165) | Everything + **multi-year roll-over savings (members stay or cash out)**, advanced exports & analytics, Elite badge, diaspora-ready — for high-value houses |

**Complexity is the tiering ladder.** The free Start tier is the *basic njangi* every
Cameroonian already knows — a rotating pot and a trouble fund. The more sophisticated a
house's money gets, the higher the tier:

- **Basic rotating njangi + trouble fund → Start (free).** The entry point. Costs nothing,
  so there is no reason not to digitize the notebook.
- **Common savings caisse that lends to members at 2%/month → Standard.** The moment a
  house runs a shared, interest-bearing fund, the stakes (and the disputes a clean ledger
  prevents) are high enough to justify a paid plan.
- **Multi-year roll-over savings → Elite.** At year-end each member chooses to cash out or
  roll their balance (savings + interest share) into next year's caisse; the engine carries
  each member's stake forward and keeps the interest split representative across years. This
  is the most complex njangi to run on paper and the most valuable to get right — Elite.

**Tiering by fund size (the user's instinct, built in):** Kola inspects the money flowing
through a house (contribution size, trouble-fund levies, standing balance) and
*automatically suggests Elite* to houses that are clearly high-value — e.g. those setting
aside FCFA 100K+/member or contributing FCFA 50K+/sitting. The Start tier exists purely to
seed; the conversion triggers are the member cap, MoMo collection, and the trouble fund.

**Non-negotiable principle — books are never held hostage.** When a subscription lapses,
the house silently falls back to Start limits but **keeps full read and export of its
entire ledger forever**. We pause premium features, never the truth. Locking a njangi's
records would destroy the only thing the product sells: trust.

### 6.2 Transaction fees — from Day 1

- **1% capped at FCFA 500** per digital contribution collected (on top of pass-through
  telco fees, displayed transparently). Member pays; framed as "less than your moto-taxi
  fare to the meeting."
- **0.5%** on pot/loan/benefit disbursements, paid by the group fund.
- Cash entries recorded in-app: **free forever** (never tax the offline behavior we're
  trying to convert).

### 6.3 Diaspora bridge — high margin, from Month 6

- **2.5% FX/convenience margin** on international contributions (vs. 5–9% they lose
  today through Western Union + a relative's "commission"). At an average diaspora
  contribution of FCFA 60K/month, this is our richest stream per user.

### 6.4 Funeral microinsurance commission — Year 2

- Group-level funeral/life microinsurance distributed in-app, underwritten by a licensed
  Cameroonian insurer. Typical premium FCFA 500–1,500/member/month; **Kola takes
  15–25% distribution commission.** Insurers badly want this channel — they cannot
  reach njangi houses; we are *inside* them.

### 6.5 Credit-scoring & MFI referrals — Year 2–3

- With member consent, Kola's contribution history becomes a credit score. Licensed
  MFIs and credit unions pay **a referral fee (1–2% of loan value)** for pre-scored
  borrowers. We never lend our own money; we monetize the data exhaust of discipline
  that today earns members nothing.

### 6.6 Explicitly rejected revenue

- **No float interest games** on member money (regulatory + trust suicide).
- **No ads.** A njangi app showing betting ads dies in one church sermon.

---

## 7. Regulatory Strategy (CEMAC/Cameroon)

This is the part most fintechs get wrong. The plan:

**Phase 1 (launch): Pure software + licensed payment partners.**
- Kola is a SaaS/ledger company. All money flows **directly between member wallets and
  the group's own MoMo/OM merchant or collection account** via a licensed payment
  aggregator (e.g., Maviance/Smobilpay, CinetPay, or direct MTN/Orange API agreements).
- Kola never takes custody of funds → outside the perimeter of BEAC Regulation
  No. 04/18/CEMAC on payment services and COBAC's e-money rules.
- Trouble-fund balances sit in the group's own account at their existing MFI/credit
  union or in a group MoMo account — Kola is the ledger and orchestrator.

**Phase 2 (scale): Payment establishment license or MFI partnership.**
- Once volumes justify it (~Year 3), either obtain a **payment institution
  (établissement de paiement) authorization** under the CEMAC framework, or deepen the
  partnership with a Category 1 microfinance institution / CamCCUL-affiliated credit
  union to offer interest-bearing group accounts.

**Always:**
- Tiered KYC matching BEAC rules (phone-number-level for small contributions; ID capture
  for larger flows and disbursements) — leveraging the fact that MoMo/OM wallets are
  already KYC'd by the telcos.
- Data protection compliance (Cameroon's 2024 data protection law) — ledger data is
  sensitive; member consent governs any credit-scoring use.
- Insurance distributed only as agent of a CIMA-licensed insurer.

---

## 8. Go-To-Market

### 8.1 The wedge: presidents and treasurers, not members

One converted president = 30–40 members onboarded at once. CAC is therefore measured
**per group**, not per user.

1. **"Trouble fund first" pitch.** Lead with the 48-hour funeral payout story, not with
   "fintech." Demo: trigger a mock levy, watch 30 phones buzz at once. This sells itself
   at any meeting.
2. **Field ambassadors ("Kola Reps")** — commissioned agents recruited from respected
   meeting members, paid FCFA 5,000 per activated paying group + 5% of Year-1
   subscription. Same playbook that built MoMo's agent network.
3. **Beachheads:** Douala (Akwa, Bonabéri markets), Yaoundé, Bafoussam (the Bamiléké
   tontine heartland — the most sophisticated tontine culture in the country, including
   bidding tontines), Bamenda/Buea (anglophone njangi houses, strong diaspora links).
4. **Channel partnerships:** churches (PCC, Catholic men's/women's groups — CWF, CMF),
   cultural & development associations (Laakam, Nweh, Moghamo unions…), market traders'
   associations, teachers' and drivers' cooperatives.
5. **Diaspora pull:** market in WhatsApp/Facebook groups of Cameroonian associations in
   the US/Europe. Diaspora members *push their home groups onto Kola* because they're
   the ones being cheated by opacity. Diaspora = highest-ARPU users and free distribution.
6. **Radio + sponsorship**, not Facebook ads: community radio in local languages,
   sponsoring death celebrations' public address ("trouble fund paid in 48 hours by
   Kola") — dark but extremely effective social proof in context.

### 8.2 Trust-building (the real product)

- **Public ledger guarantee:** "Even Kola cannot delete a line."
- Local incorporation, local faces, office in Douala — not a faceless foreign app.
- Endorsements from known meeting federations and a few celebrity association presidents.
- A no-questions data-export: groups can leave anytime with their full books (paradoxically
  increases trust → reduces churn).

---

## 9. Unit Economics

Assumptions: avg. group = 30 members; 60% of groups on Standard, 10% Association,
30% free; 40% of contributions digital in Yr 1 → 65% by Yr 3; avg. contribution
FCFA 7,500/member/month.

**Per average *paying* group, per month (steady state):**

| Stream | Calc | Revenue |
|---|---|---|
| Subscription (blended Standard/Association) | — | FCFA 3,570 |
| Contribution fees | 30 × 7,500 × 55% digital × 1% | FCFA 1,238 |
| Disbursement fees | pot ~225K × 0.5% | FCFA 1,125 |
| Diaspora margin | 2 diaspora members × 60K × 2.5% | FCFA 3,000 |
| Insurance commission (Yr 2+) | 12 insured × 800 × 20% | FCFA 1,920 |
| **Total per paying group/month** | | **~FCFA 10,850 (~$18)** |

**Costs per group/month:** SMS/WhatsApp + USSD sessions ~FCFA 1,200; aggregator share of
transaction fees ~FCFA 700; support amortized ~FCFA 800 → **~FCFA 2,700**.

**Gross margin ≈ 75%. CAC per group ≈ FCFA 15,000** (ambassador commission + field
costs) → **payback < 2 months** on paying groups. Group-level churn is the key risk
metric; njangi groups themselves persist for decades, so target <15%/yr.

---

## 10. Financial Projections (FCFA, conservative)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Active groups (total) | 800 | 2,500 | 5,000 |
| Paying groups | 400 | 1,500 | 3,500 |
| Members reached | ~24K | ~75K | ~150K |
| Revenue | 26M (~$43K) | 150M (~$250K) | 480M (~$800K) |
| Costs (team, tech, field, compliance) | 180M | 280M | 420M |
| **EBITDA** | **−154M** | **−130M** | **+60M** |

Funding need: **~FCFA 350M (~$580K) seed** to reach break-even — appropriate for
Cameroon-focused angels, Digital Africa, Proparco/I&P-type vehicles, telco corporate
VC (MTN/Orange both run fintech funds), and diaspora investors (poetically: raise the
seed *like a njangi* — a diaspora investment syndicate is on-brand and viable).

Year 4–5 expansion: Gabon, Congo, Chad, CAR (same BEAC/CEMAC regulatory umbrella and
the same tontine culture — the license/partner stack ports directly), plus
Nigeria/Ghana diaspora corridors.

---

## 11. Team & Operations (lean Year 1)

- CEO/co-founder (commercial, Cameroon networks) + CTO/co-founder
- 2 engineers (Android + backend; USSD/WhatsApp integrations)
- 1 compliance/partnerships lead (BEAC/COBAC, telco & insurer deals) — hire early, this
  is the long pole
- 1 head of field ops + 10–20 commissioned ambassadors (Douala, Yaoundé, Bafoussam, Bamenda)
- Customer support in FR/EN/Pidgin via WhatsApp (support *is* marketing here)

## 12. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Telco API costs/reliability; telcos copy the idea | Multi-aggregator redundancy; our moat is the constitution/ledger/social layer telcos won't build; pursue telco partnership before rivalry |
| Anglophone-crisis instability in NW/SW beachheads | Lead with Douala/Yaoundé/Bafoussam + diaspora; NW/SW via diaspora-driven remote groups |
| Groups try the app, revert to the notebook | Trouble-fund levy + SMS receipts are habit-forming hooks; ambassador attends the first 3 meetings; free tier removes price excuse |
| A fraud incident inside a group gets blamed on the app | Append-only ledger + receipts make Kola the *proof*, not the culprit; PR playbook ready |
| Regulatory reclassification (custody creep) | Phase-1 architecture keeps funds in group-owned accounts; compliance lead from Day 1 |
| Cash culture inertia | Never penalize cash; monetize SaaS + the flows that are already digital |

## 13. Roadmap

- **M0–M4 — MVP:** ledger, group setup, SMS receipts, MoMo/OM collection via one
  aggregator, trouble-fund levy. 20 pilot groups in Douala (hand-held onboarding).
- **M5–M9:** WhatsApp bot, USSD, fines/constitution engine, Standard tier launch,
  50 → 400 groups, ambassador program.
- **M10–M14:** Diaspora bridge (card payments), web dashboard, Association tier,
  Bafoussam + Bamenda expansion.
- **M15–M24:** Insurance partnership live, credit-scoring pilot with one MFI,
  2,500 groups, Series A conversation.

---

### One-line investment thesis

> Cameroonians already run a multi-hundred-billion-FCFA shadow banking system on trust
> and notebooks. Kola doesn't ask them to change what they do — it makes what they
> already do impossible to cheat, and takes a sliver of the flow for the service.
