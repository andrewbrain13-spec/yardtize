# Yardtize — Build Brief for Claude Code

## Who you're working with

Andrew is the founder and is **not a developer**. He knows very little about coding and wants Claude Code to do essentially all of the work. That means:

- Run every command yourself; never hand him a command to run unless there is truly no alternative (e.g., pasting an API key).
- Explain what you're doing in plain business language, briefly, as you go.
- When he needs to do something manually (create an account, get an API key, buy a domain setting), give exact click-by-click steps.
- Verify your own work: run the dev server, take screenshots with Playwright, run the tests, check the deploy — don't ask him to QA raw code.
- Commit early and often with clear messages. Deploy to a live preview URL as soon as anything renders, and keep it deployed — the whole point of this build is showing it to investors.

## What Yardtize is

A two-sided marketplace where homeowners lease yard space for small advertising signs and businesses/campaigns rent it. Placements are priced with **official state traffic-count data (AADT)** and screened by a **per-city sign-compliance rules engine** — those two things are the entire differentiation. Pilot market: Kansas City metro (Missouri + Kansas). Anchor demo property: **3103 Karnes Blvd, KCMO 64111** (corner of SW Trafficway & W 31st St — verified 2025 MoDOT counts: 33,316 + 25,244 vehicles/day on the Trafficway south/north of the signal, ~11,070 on W 31st).

## Read these files in this folder before writing code

- `Yardtize-Plan-v1.md` — business plan, competitive landscape, roadmap.
- `Yardtize-Zoning-Deep-Dive.md` — verified sign-code text for KCMO and Overland Park, the political/nonprofit/weekend-corner legal lanes, MoDOT/KDOT endpoints, pricing logic. **The compliance rules and traffic-data sections are implementation specs, not background.**
- `yardtize-mockup.html` — the approved clickable prototype. This is the design reference: palette (deep green #166534 family on warm off-white), tone of copy, screen flow, card layouts. The real site should feel like this mockup, matured.
- `Yardtize-Adviser-Memo.docx` — context on strategy/risks (optional read).

## Phase 1 scope — "functional investor demo" (build this now)

A deployed, working web app at a public URL where:

1. **Auth**: email magic-link sign-in (Supabase Auth). Two roles: homeowner, business. Role picked at first login.
2. **Homeowner listing flow** (mirrors the mockup's 3-step wizard):
   - Enter address → geocode → satellite view centered on the property (Google Maps JS API, satellite tiles).
   - Drag a sign pin. Server queries nearest counted road segments and shows real AADT (see Traffic data below).
   - Compliance card: jurisdiction detected from the address; show that city's actual rules with pass/fail checks (see Rules engine below).
   - Suggested monthly rate from the rate formula; owner can override with a slider.
   - Publish → listing stored in Postgres.
3. **Business portal**: map + list of live listings (traffic count, rate, badges like "Signalized corner"); listing detail; booking request form — advertiser type (business / campaign / nonprofit), sign size (18×24″ / 24×36″ / 2×4 ft), duration (1/3/6/12 months + "Election window Sep 19–Nov 5"), install choice (self-install with $500 refundable deposit noted, or platform install +$99 each way — display only, no payments yet), sign rendering upload (Supabase Storage), message.
4. **Owner inbox**: homeowner sees requests, views the rendering, approves/declines. Status flow: requested → approved → active (manual). Email notifications if easy (Resend free tier), otherwise in-app only.
5. **Public landing page**: adapt the mockup's landing (hero, how-it-works, why-a-yard-beats-a-billboard, the Karnes featured-corner card with real numbers). One tasteful sign per yard is a stated platform rule.

**Explicitly cut from Phase 1** (mention on the site as "coming", build later): payments/escrow (Stripe), in-platform lease e-signing (Docusign), automated payouts, the ML rate engine, HOA checks, metros beyond KC.

## Stack (chosen for speed + AI-friendliness; don't relitigate without a strong reason)

- **Next.js (App Router, TypeScript) + Tailwind** — one repo, in a `app/` subfolder of this folder (this folder is OneDrive-synced; that's fine, but put `node_modules` in `.gitignore` and consider advising Andrew to move the repo to `C:\dev\yardtize` if OneDrive sync causes file-lock pain).
- **Supabase** — Postgres + PostGIS, Auth, Storage. Free tier.
- **Google Maps JavaScript API** — satellite imagery + Places autocomplete for addresses. (~$0 at demo volumes with Google's monthly credit.)
- **Vercel** — hosting + previews. Connect the `yardtize.com` domain when Andrew is ready (he owns yardtize.com and yartize.com; 301 yartize → yardtize).
- Keys Andrew must provide (walk him through each, step by step): Supabase project URL + anon key + service key; Google Maps API key (Maps JavaScript API + Geocoding/Places enabled, key restricted to his domains); Vercel account login.

## Traffic data (AADT) — implementation spec

Phase 1: query live with caching. (Phase 2: annual bulk load into PostGIS.)

- **Missouri (MoDOT)** — `https://mapping.modot.mo.gov/arcgis/rest/services/BusinessInt/TrafficInfoSegAADT/MapServer`, layers **16–19** (all-roads, directional). One row per segment per YEAR — **always filter to the latest YEAR (2025 as of now)**. Use point + `distance` (meters) queries. `AADT` = directional; `ROADWAY_AADT` = both directions (use for display). Quirks: names are unreliable (`SOUTHWEST TRFY`, `W 31ST ST` vs `31ST ST`; coincident rows may carry the cross-street's name) — do **spatial nearest-segment** lookup, never name matching. Segments can exist with AADT 0/stale YEAR (e.g. Karnes Blvd) — treat 0/null/stale as "no data" and fall back to next-nearest counted segment.
- **Kansas (KDOT)** — `https://wfs.ksdot.org/arcgis_web_adaptor/rest/services/Transportation/AADT_Flow_Map/FeatureServer` (state highways) and `.../AADT_NonState/FeatureServer/0` (arterials/collectors, 2024). KDOT uptime is flaky — cache aggressively and degrade gracefully. Pure residential KS streets have no counts; show nearest classified road and label it as such.
- **National backstop** — FHWA HPMS per-state services at geo.dot.gov (e.g. `hosted/HPMS_FULL_MO_2023/FeatureServer/0`, lowercase fields) for cross-checks and the "scales to 50 states" story.
- Cache every lookup (segment geometry + AADT + year + source) in Postgres keyed by rounded lat/lng so repeat pins are instant and demos never depend on state-server uptime. Show the source and year in the UI ("MoDOT 2025") — the credibility comes from it being real.

## Compliance rules engine v1 — implementation spec

A `jurisdictions` table + rules JSON, evaluated against the listing's address (city boundary lookup; Phase 1 can key off geocoder city name). Encode these **verified** rules:

**Kansas City, MO** (Zoning Code § 88-445-06, § 88-445-14, § 88-810-1770):
- Max sign: 8 sq ft, 4 ft tall; no permit under 10 sq ft; setback 5 ft from ROW (corner lots: behind a 20-ft diagonal at the corner).
- Noncommercial aggregate: 16 sq ft per lot, **no duration limit**; cap lifted from 6 weeks before to 2 weeks after a KC election.
- Commercial messages only for activity on the premises; off-premise commercial ads prohibited citywide (outside highway corridors) — gate commercial listings accordingly.
- Political signs: allowed year-round within the size rules; MO law (RSMo 442.404) blocks HOA bans on political signs.

**Overland Park, KS** (UDO § 18.440, verified from live code):
- Stake signs: up to 3/lot, 9 sq ft total (a single sign may be the full 9), 6 ft tall, **60 days on, then 30 days off** — build this display-period rhythm into listing scheduling.
- Off-site commercial signs prohibited (for-profit, off-premises content) EXCEPT: **corner lots get 1 extra temp sign every Fri 6 a.m.–Sun 9 p.m., ≤3 sq ft/face, ≤4 ft** — this is a legal weekend commercial product; model it as a distinct inventory type ("Weekend corner").
- Nonprofit advertisers are outside the off-site prohibition entirely (definition covers for-profit only).
- Kansas statute K.S.A. 25-2711: cities cannot limit number/placement of political signs on private property from 45 days before to 2 days after an election (Sep 19 – Nov 5, 2026).
- Penalties can reach the advertiser and the property owner; each day a separate offense — platform posture: 48-hour takedown on any notice.

Every listing shows a compliance card: jurisdiction, what's allowed, what the platform enforces (one sign per yard — a Yardtize rule everywhere; size presets that fit the strictest applicable limit). Unknown city → conservative defaults + "compliance review pending" badge.

## Rate suggestion v1

`suggested = clamp(round_to_5(ROADWAY_AADT_sum / 1000 * $6), $40, $600)` with multipliers: signalized intersection ×1.25 (Phase 1: detect via a manual flag on the listing; auto-detect later), corner lot ×1.15, election window ×1.6. Show the math to the user ("traffic × eye-level CPM") — transparency is the brand. Owner can always override.

## Milestones (in order; deploy after each)

1. Repo scaffold, Tailwind theme matching the mockup, landing page live on Vercel.
2. Supabase wired: auth + roles, `listings`/`requests`/`jurisdictions` schema.
3. Homeowner wizard with maps + live MoDOT/KDOT AADT + compliance card + rate → publish (the demo money-shot; get the Karnes address flawless).
4. Business portal + booking requests + rendering upload.
5. Owner inbox + approve/decline + status flow. Seed 6–10 realistic KC-metro listings.
6. Polish pass: mobile, empty states, error states, `robots.txt` noindex until launch, basic analytics (Vercel).

## Guardrails

- Never invent traffic numbers — if the lookup fails, say "no data" honestly.
- Keep the "demo data" disclaimer on seeded listings; the Karnes traffic numbers are real and may be presented as real.
- No payment collection, no legal documents generated in Phase 1 — informational display only.
- Don't market the political product as evading anything; the platform's stance is compliance-first (it happens to be genuinely legal).
