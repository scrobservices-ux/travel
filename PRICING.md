# Kola — Subscription Model (Proposal)

How Kola charges. Prices in FCFA (XAF ≈ 600 = $1). This refines the flat numbers
currently in the app into a model that is **fair across group sizes** and **easy to say
out loud** to a njangi president.

---

## 1. The two pricing axes

A njangi's willingness — and ability — to pay depends on two things, so Kola prices on
both:

1. **What the njangi *does*** (its complexity) → the **feature tier**.
2. **How big the njangi *is*** (its members) → the **size**, priced per member with a
   floor and a cap.

A 10-person family njangi and a 120-member development union should not pay the same,
even on the same tier. Per-member pricing fixes that without a pricing table nobody can
remember.

---

## 2. The three feature tiers (what the njangi can do)

The tier is set by the **njangi style** (money engine) the house runs.

| Tier | Njangi styles unlocked | Also includes |
|---|---|---|
| **Kola Start** | Basic **rotating njangi** | Trouble/funeral fund, receipts (EN/FR/Pidgin), cash recording, ≤ 15 members, 1 house |
| **Kola Standard** | + **Savings / December njangi**, + **Daily collector (asusu)**, + savings caisse & member loans | Unlimited members, fines engine, reports & CSV export, priority WhatsApp support |
| **Kola Elite** | + **Bidding / auction njangi (enchère)**, + **multi-year roll-over savings** | Advanced exports & analytics, Elite badge, diaspora-ready |

**Start is free forever.** It is the basic njangi every Cameroonian already runs on a
notebook — there must be zero reason not to digitize it. Paid tiers are unlocked the
moment a house runs something more sophisticated (a lending caisse, a daily collection, a
bidding round).

---

## 3. Recommended pricing — per member, per year, billed at the share-out

> **Standard: FCFA 1,000 / member / year** · floor **10,000** · cap **50,000**
> **Elite: FCFA 3,500 / member / year** · floor **50,000** · cap **200,000**

- **Billed once a year, at the year-end share-out** — the one day the whole house is
  together and the treasury is full. Paid from the group treasury, like the meeting hall
  or the drinks. One social decision a year = very low churn.
- **The floor** keeps tiny groups viable to serve (a support call costs the same whether
  the group is 6 or 60).
- **The cap** means a 200-member association never feels gouged — past the cap, extra
  members are free.

### What that actually costs a group

| Group | Members | Standard / year | Elite / year |
|---|---|---|---|
| Small family njangi | 8 | **10,000** (floor) | 50,000 (floor) |
| Typical njangi | 24 | **24,000** | 84,000 |
| Big meeting | 50 | **50,000** (cap) | 175,000 |
| Large association | 120 | **50,000** (cap) | 200,000 (cap) |

Sanity check: a member contributing FCFA 5,000/month puts in 60,000/year. Standard at
**1,000/member/year is ~1.7% of one member's own contributions — and less than FCFA 85
per member per month.** That is the price of one beer, once a year, per person. It will
not be the reason a house says no.

---

## 4. Payment options

- **Annual (default & cheapest):** the numbers above, collected at the share-out.
- **Monthly (for cash-flow-shy groups):** Standard from **FCFA 2,500/month**, Elite from
  **FCFA 10,000/month** — deliberately ~20–25% more than annual, to push groups toward the
  once-a-year payment that fits njangi rhythm and lowers our churn.
- Paid by **MoMo / Orange Money** to Kola's collection number; in-app the treasurer enters
  the transaction ID and the house activates for the period. (Auto-verification arrives
  with the payment-aggregator integration in Phase 1.)

---

## 5. Launch & growth levers

- **Founding Houses offer:** the first **200 paying groups** get **50% off year one** and
  keep that rate for as long as they stay subscribed. Creates urgency and a reference base.
- **Free first year on Start → renew free** each year. The basic njangi is always free; we
  monetize complexity and scale, not the entry point.
- **Ambassador / multi-house discount:** an agent or association running **5+ houses** gets
  **20% off** — fuels the field-rep distribution model.
- **Diaspora-led upgrade:** diaspora members (highest ARPU) often *want* to pay for the
  whole home group; the app lets any member settle the house subscription.

---

## 6. Subscription is not the only revenue (for context)

Subscriptions are the predictable base; these stack on top and are documented in
[BUSINESS_MODEL.md](BUSINESS_MODEL.md) §6:

- **Transaction fee:** 1% (capped FCFA 500) on *digital* contributions collected; cash is
  free forever.
- **Diaspora bridge:** ~2.5% FX/convenience margin on contributions paid from abroad.
- **Funeral microinsurance:** 15–25% distribution commission (Year 2, licensed insurer).
- **MFI referrals:** fee for pre-scored borrowers from the savings-caisse history.

Blended, subscriptions are ~30–40% of revenue per active group; the rest is usage-based.

---

## 7. Why per-member-with-caps beats the alternatives

| Model | Verdict |
|---|---|
| **Flat per house** (current app: 24k / 100k) | Simple, but unfair: crushes an 8-person njangi, underprices a 120-member union. |
| **Pure transaction %** | Feels like a tax on every franc; treasurers hate per-transaction deductions on member money. Keep it small and secondary. |
| **Per member, floor + cap** ✅ | Scales with both size and value, easy to explain ("FCFA 1,000 a head a year"), protects tiny groups (floor) and big ones (cap). **Recommended.** |

---

## 8. Live in the app ✅

This model is wired into the **Plan** tab:

- Price is computed `clamp(perMember × activeMembers, floor, cap)` from
  `{ standard: {perMember:1000, floor:10000, cap:50000},
     elite: {perMember:3500, floor:50000, cap:200000} }` — a 24-member house sees
  *FCFA 24,000/year*, an 8-member house *10,000*, a 120-member house *50,000*.
- An **Annual / Monthly** toggle (monthly = annual ÷ 12 × 1.25).
- A **Founding House (−50%)** switch that halves the price and is recorded on the house.
- The upgrade flow charges the exact computed amount and stores
  `{plan, period, amount, members, ref}` in the house's subscription history.
