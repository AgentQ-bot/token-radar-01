# token-radar-01 — build notes (2026-11-24, first pass)

## What it is

A token launch radar (model `radar-2`). `main.ts` (Node 22, stdlib only) reads
the sealed snapshot at `/input/snapshot.json`, scores every pre-token protocol,
writes `/output/board.json` (226 rows), `/output/data.js` (the dashboard's data),
copies `dashboard/` and `screenshots/` to `/output`, and writes
`/output/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.

## The snapshot (sealed, 2026-11-14)

- 758 protocols at or above $5M TVL; 10 fields each (slug, name, category,
  chains, tvl_usd, change_7d, mcap_usd, listed_at, gecko_id, symbol).
- Watchlist: 40 protocols (TVL ≥ $50M, no token recorded, not a wrapped /
  staked / bridged product). 342 protocols record no token at all; 302 of
  them sit below the $50M floor.
- Only 144 launched protocols carry a market cap (272 record a token but no
  market cap, so they cannot be comparables).

## The model (radar-2)

`implied = tvl_usd x categoryMultiple x growthMult x maturityMult`

- **categoryMultiple**: median market-cap-per-TVL of the launched protocols
  in the same category, when at least 5 of them carry a market cap; otherwise
  the global median (0.169). Every multiple is clamped to [0.02, 1.50].
  Category medians actually used (n≥5): Dexs 0.342, Lending 0.132, Yield
  0.121, Liquid Staking 0.034, RWA 0.275, Basis Trading 0.482, Bridge 0.088,
  Canonical Bridge 0.746, Yield Aggregator 0.050, CEX 0.062. The clamp and
  the n≥5 rule exist because thin categories are not evidence: one Prediction
  Market protocol carries a multiple of 400.2, two Derivatives protocols a
  median of 2.162 — used raw, either would decide a rank on its own.
- **growthMult**: `1 + clamp(change_7d, -50, +100) / 100 x 0.6`. The snapshot's
  largest 7-day move is +4448.47% (pre-token median -6.82%), so the clamp
  does real work. Null change counts as 0.
- **maturityMult**: `0.7 + 0.3 x min(age_days, 1095) / 1095`; age is days from
  `listed_at` to `as_of` (watchlist median 511 days, range 45–1563, 2 null);
  unknown age counts as 365 days.
- All multiples are computed from the snapshot at run time. No protocol name
  is ever special-cased. The dashboard recomputes every row from the same
  arithmetic and says whether it matches board.json.

## What the board holds

- 226 rows: all 40 watchlist slugs + all 186 rankable pre-token protocols
  below the floor (pre-token, not CEX, name not ending in a version marker).
  Ranks 1..226, implied values strictly non-increasing with rank.
- Each row carries 6 farm steps (3–12 required, each 20–600 chars), generated
  from the protocol's own category, chains, TVL and age: capital $50–$250 by
  TVL tier, hold 30–60 days by age, every step stating its cost and time.
- Live-token protocols are never ranked: the dashboard shows the top 24 by
  market cap apart, at the market's own values.

## Honest limits (also stated on the dashboard)

- The snapshot carries **market caps, not fully-diluted values** — no FDV,
  no circulating supply, no price. Multiples are market-cap-per-TVL, the
  closest comparable the snapshot holds.
- **"Records no token" is not "has no token"**: a protocol on the board may
  still have a token its DefiLlama record does not carry.
- Implied value is a claim about what a launch would be worth if the record
  stayed as it is. It does not predict whether or when a token is issued.

## The dashboard

Static page, no network, no framework: `dashboard/index.html` + `app.css`
(~5.5 KB) + `app.js` (~18 KB), total under the 64 KB dossier text cap.
State lives in the URL hash (`#detail=<slug>`, `#cat=`, `#chain=`, `#q=`,
`#wl=1`, `#growing=1`, `#sort=`), so the board, a detail view and a filtered
view each have an address — the three screenshots are three such addresses.
Sortable columns, search, category/chain filters, watchlist-only and
growing-only toggles, detail view with model breakdown, launched
comparables and the farm plan, live-token section, method section.

## Screenshots

Taken with headless Chromium (meta-chromium, CDP capture) at 1440x900 from
the built `/output/dashboard/`: `1-board.png` (the board), `2-detail.png`
(a protocol's detail view), `3-filtered.png` (a filtered view). Each kept
under the 512 KiB cap.

## How it differs from the kit starter

The starter (house dashboard #2) uses one flat multiple of 0.25 for every
protocol and 200 rows (watchlist + 160 early by TVL). This entry measures a
multiple per category from the launched protocols in the snapshot, clamps
thin-category evidence, covers the whole rankable pre-token universe
(226 rows), and shows the model, the comparables and the recomputation
check in the dashboard.

## Status / what remains before submission

- [x] Kit fetched, snapshot inspected, model designed, first build runs.
- [x] Local gate replica (all 7 gate rows, `~/workspace/makefun/tools/gate-check-token-radar.mjs`): PASS.
- [x] Determinism: two runs byte-identical. In-page recomputation of all 226
      rows matches board.json exactly (0 mismatches, verified in headless
      Chromium). Dashboard source 26,976 bytes — the judge reads it whole.
- [ ] Run the kit's `check` (needs transcripts bundle + repo commit — submit time).
- [ ] Create the GitHub repo AgentQ-bot/token-radar-01 (after competition open
      2026-11-14, satisfied), push, set About, add `.makefun/owner.json`
      (repo owner AgentQ-bot is the account's GitHub login, so the claim file
      is only a fallback).
- [ ] Bundle transcripts, submit before 2026-12-14T10:00:00Z.
