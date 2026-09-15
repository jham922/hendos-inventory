# Ordering — Southern (Proof) + Gate City (SipMarket)
**Spec v3 · 2026-09-15 · DRAFT for Jennifer's review — nothing is built or ordered yet**

## Your rules (locked in)

1. **Orders are placed Monday.**
2. **I never decide a substitution** — out of stock, different size, different brand always goes
   to you as a question.
3. **I must know which items are high volume and which aren't** — that's what decides whether a
   case (or a multi-case break) makes sense.
4. **Compare bottle price against price-per-bottle when buying a case.**
5. **Compare 750 ml against 1 L to find the best value.**
6. **Pricing comes from the portal at order time**, not from invoices. Invoice history is a cost
   record only.
7. **Toast sales numbers are irrelevant to ordering** — stock movement is the signal.
8. **Special pricing must be known to me** — the portal's two listed prices don't tell the whole
   story.

Plus the standing safety rule: **I never press submit without your explicit go-ahead.**

---

## What the portals show (per your description)

For most items, both SipMarket and Proof list **two prices**:

- **Bottle price** — the single-unit price
- **Case price** — the price for a full case

So at order time I can compute, for each item: cost per bottle, cost per case, **cost per bottle
inside the case**, and **cost per oz** (dividing by the known bottle size) — which is what makes
750 ml vs 1 L comparable.

---

## The part the portal won't tell me: special / break pricing

> *"Buying 5 cases of Corazon Reposado brings the bottle price down to $13.50 each."*

That's a price point the two displayed prices don't reveal, so it has to be **taught once and
stored**. Proposal:

**`order_price_rules`** — a small table, editable by you in the app's Admin tab:

| Item | Vendor | Buy at least | Effective bottle price | Standing or promo | Note |
|---|---|---|---|---|---|
| Corazon Reposado | Gate City | 5 cases | $13.50 | ? | from Jennifer 2026-09-15 |

Each rule gets an **effective date** (and an optional end date), so a temporary promo expires on
its own instead of quietly affecting orders months later.

### How the engine uses it

For each item it evaluates every price point it knows:

1. bottles only (bottle price)
2. one case (case price ÷ case size)
3. break quantity (e.g. 5 cases at $13.50/bottle)
4. larger break tiers, if you give me any

…then picks the best **$ per oz**. With one guardrail that matters: **a break tier is only
attractive if the resulting stock is sensible.** Buying 5 cases to save $2 a bottle is a bad
trade on a low-volume item (cash tied up, shelf space, slow turnover) and a good one on a
high-mover. So the volume class gates it:

- **High volume** — consider break tiers freely
- **Medium** — break tier only if the need is genuinely near it
- **Low** — never chase a break tier; buy what covers the need

Anything where the best-value choice means carrying noticeably more stock than par gets
**proposed to you**, not decided.

---

## Corrected: where every number comes from

| Decision | Source |
|---|---|
| How much (quantity) | par − (on hand + on order), from the app |
| Bottle price / case price | **the portal, live, at order time** |
| Break / special pricing | **your rules table**, seeded by you, verified against the portal |
| Case vs bottle value | computed from those prices |
| 750 ml vs 1 L value | computed → **$ per oz** |
| High / medium / low volume | stock movement (counts + deliveries), or your list — *not* Toast |
| Substitutions | **always you** |

---

## The decision engine (each Monday)

1. **Need** = par − (on hand + on order).
2. **Open the portal** and read that item's live options: sizes, bottle price, case price.
3. **Apply your price rules** for any break tiers that apply to this item.
4. **Value** — compute $/bottle and **$/oz** for each realistic option.
5. **Volume class decides what's sensible** (case only where it turns over; break tiers only on
   high-movers).
6. **Propose anything unusual** — a size change, a brand change, or carrying extra stock to hit
   a cheaper tier — rather than deciding it.
7. **Draft to you in WhatsApp**: per vendor, every line, price, and the reason.
8. You approve → I fill the cart → screenshot the review screen → you say go → I submit.
9. Logged: what, why, price, screenshot.

---

## Phases

**Phase 0 — you order, I watch (this Monday).** You place it on the shared screen and narrate the
why. I record every click and learn both portals, including whether either accepts a pasted list
of item numbers instead of catalog clicking.

**Phase 1 — I draft, you order (1–2 weeks).** Diff my draft against what you actually ordered.

**Phase 2 — I fill the cart, you approve (1–2 weeks).**

**Phase 3 — routine automatic, exceptions to you.**

---

## Still needed from you

1. **Volume class** — your list, or derived from stock movement?
2. **Price rules** — are the break prices usually **standing** or **temporary promos**? And is
   the Corazon 5-case example typical, or are there many of these?
3. **Where do you learn them?** Rep emails/calls, or does the portal show them anywhere?
4. **Cap** — maximum per order, per vendor?
5. **Cut-off** — what day/time must a Monday order be in for Wednesday delivery?
6. **Minimums** — does either vendor have one?
7. **Phase 0** — can you place this Monday's order on the shared screen with me recording?
