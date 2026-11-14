# Ridge & Beam: codebase research brief

Snapshot of `main` at `0768a18` (14 Nov 2026). Read-only research: nothing was changed to produce it. Findings marked ✔ were checked directly in the code; the rest come from careful reads of the code.

## 1. What it is

Job management for **Australian residential roofers** (1–10 crew firms): lead → quote → sold → build → wrap-up/paid, with state-by-state compliance, supplier price sheets, insurance claims, crew and homeowner portals.

- **Stack:** Next.js 16.4 (App Router, Server Actions, `src/proxy.ts` instead of middleware), React 19.3, Supabase (Postgres + Auth + Storage + RLS), Tailwind v4, TypeScript, Zod 4, pdf.js 4.10 + pdf-lib, Leaflet, `@anthropic-ai/sdk`.
- **Hosting:** Vercel `syd1`, with one cron (`/api/cron/payment-plans`, 21:00 UTC). Supabase is expected in Sydney.
- **Size:** about 44k lines of TS/TSX, 31 migrations, 79 commits. All commits so far were authored by Claude sessions, landed as `stageN-*` feature branches merged into `main`.
- **Health:**
  - ✔ 404/404 Vitest tests pass.
  - ✔ `tsc` is clean after `npx next typegen` (needed for the global `PageProps`/`LayoutProps` types).
  - ✔ ESLint is clean on `src/`. Its errors come only from `e2e/` and `scripts/` (CommonJS `require`) and the copied pdf.js worker in `public/`. Those paths should be added to `globalIgnores`.
  - SQL tests (`supabase/tests/*.sql`) and e2e scripts (`e2e/*.js`) need local Supabase on Docker plus a running app.
  - There are no TODO/FIXME markers anywhere.

## 2. Layout map

| Area | Where |
|---|---|
| Auth/session | `src/proxy.ts` → `lib/supabase/proxy.ts` (optimistic redirect); `lib/dal.ts` (`getUser`, `requireOrg`, `requireAdmin`, `requireMoneyAccess`). `requireOrg` returns `isAdmin`, `canSeeMoney` (not crew_lead), `isCrewLead`, `isSalesRep`. |
| Supabase clients | `lib/supabase/server.ts` (cookie), `lib/public.ts` (anon, for token pages), `lib/admin.ts` (service role). |
| Staff app | `src/app/app/**`: Today (`page.tsx`), Jobs board, estimates, measure, materials, orders, invoices, claims, schedule, canvass, customers, reports, settings. |
| Public token pages | `/q` quote, `/c` change order, `/i` tax invoice, `/p` homeowner portal, `/w` crew, `/o` supplier order, `/l` and `/quote` lead intake, `/invite`. |
| API | `src/app/api/**`: AI (assistant, photo-summary, proposal-notes), cron, export, geocode, Xero, leads intake, SMS inbound, Stripe webhook. |
| Domain logic (pure, tested) | `src/lib/*.ts`: roof/estimating/docket/quote-pricing, au-rules, au-business-days, pay-plan, build-stage, handover, next-step, suppliers/price-sheet, plans/*. |
| Server loaders | `lib/*-server.ts` (`job-docket-server`, `next-step-server`, `build-stage-server`, `docket-server`, …). |
| UI kit | `components/ui.tsx` (Button, Card, Field…; used mostly by older pages), `components/action-form.tsx` (`useActionState` + inline result). |

**Conventions:**
- Server actions return `ActionResult = { error?, ok? }` and are wrapped in `ActionForm`. Older actions instead `throw` from plain `<form action>`.
- Each action writes a `job_notes` audit line, then calls `revalidatePath`.
- Form parsing goes through `lib/form.ts`.
- Visual language: cream background, white "ticket" cards with dashed tear lines, 10px uppercase kickers, `font-display` headings, 44–48px touch targets.
- The stage panels hand-roll Tailwind and copy-paste icon and `aud` helpers. Time zone is hardcoded to `Australia/Brisbane` in the panels.

## 3. Data model essentials

- **Tenancy:** every business table has `org_id`, and the RLS policy is `is_org_member(org_id)`.
  - Roles (`member_role`): `owner, admin, member` (shown as "Office"), `sales_rep, crew_lead`.
  - Helpers: `is_org_admin`, `org_role`, `can_manage_jobs`.
  - Cross-tenant triggers `check_same_org` / `check_parent_org`.
- **`job_stage` enum** (never changed since init): `lead, inspection, estimate_sent, sold, scheduled, in_progress, completed, paid, lost`. The newer UI phases come from the app plus `jobs.closed_at` and `handover_sent_at`.
- **Estimates:**
  - Tables `estimates`, `estimate_items`, `estimate_options`.
  - `estimates.measurements` jsonb holds the source of truth for geometry.
  - `estimates` also carries `margin_pct`, `payment_mode/when/stages` and the `view_count` columns.
  - `estimate_items` carries `extra_status`, `required`, `variants`, `supplier_price_item_id`.
  - The `estimate_totals` view mirrors `lib/estimate-totals.ts`. Saves go through the `save_estimate_content` RPC.
- **Money:**
  - Tables `invoices` (kind incl. `instalment`, `milestone_trigger`), `payments`, and the `invoice_totals` view.
  - The `sync_invoice_status` trigger keeps invoice status in step with payments.
  - `claims` (one per job) plus supplements, scope, checks and `claim_balances`.
- **Suppliers:**
  - Global `suppliers` and `supplier_branches` (591 branches, about 63% of them Reece, all `verified=false`).
  - Per-org `org_suppliers`, `supplier_price_lists`, `supplier_price_items`.
  - Orders in `material_orders` (with a token, supplier invoice and bank fields).
- **Storage:** one private `job-files` bucket at `<org>/<job>/…`. Any org member can read or delete any object.
- **Public RPCs** are SECURITY DEFINER and keyed by 36-hex tokens: `get_public_estimate`, `accept_public_estimate`, `get_public_job`, `get_crew_job`, `confirm_supplier_order`, `submit_public_lead`, and others.
- **Migration style:** big functions are redefined whole in later migrations. `accept_public_estimate` exists in 5 versions and `get_crew_job`/`save_estimate_content` in 4–5. Always edit the **latest** definition.

## 4. The Jobs board (current focus of development)

`src/app/app/jobs/page.tsx` has 5 columns: **New leads · Quoting · Sold · Building · Wrapping up**.

`pipelineColumn()` in `lib/next-step.ts` maps stages to columns:

| Stage | Column |
|---|---|
| `lead` | New leads |
| `inspection`, `estimate_sent` | Quoting |
| `sold`, `scheduled` | Sold |
| `in_progress` | Building |
| `completed` | Wrapping up |
| `paid` | Wrapping up for 30 days |
| `lost` | hidden |

Jobs with `closed_at` set are hidden.

- `?job=<id>` opens the sidebar: `loadDocket()` (`lib/job-docket-server.ts`) feeds `<JobDocket>` (`jobs/job-docket.tsx`).
- `job-docket.tsx:328` picks the panel: `LeadPanel` / `QuotingPanel` / `SoldPanel` / `BuildPanel` / `WrapPanel`. Crew leads get a generic layout.
- Pop-ups are query params rendered by the board: `?preview=1`, `?remind=1`, `?ask=1`, `?pay=<orderId>`.

| Panel | Shows | Actions (file) |
|---|---|---|
| Lead | contact, lead message, docs, send/start quote | `sendQuoteEmail` (`quote-actions.ts`), `createEstimate` |
| Quoting | total, valid-until, SENT/OPENED/SIGNED stamps, call, remind, settled-another-way | `sendQuoteReminder`, `settleQuote` (`quoting-actions.ts`) |
| Sold | getting-ready checklist: deposit, cooling-off, HWI, orders, crew → Start build | `setComplianceItem`, `setStage(in_progress)` |
| Building | payment rows from the quote's plan, deliveries, supplier invoices (AI-read) → Finish build | `requestPayment`, `tickDelivered`, `attachSupplierInvoice`, `paySupplierInvoice` (`build-actions.ts`) |
| Wrapping | final payment, supplier invoices, handover PDF, Google review → Close job, profit card | `sendHandover`, `closeJob` (`wrap-actions.ts`), `requestReview` |

**Legacy alongside the new flow.** `/app/jobs/[id]/**` (7-phase `JobTimeline`, overview page, production, billing, closeout, claim, compliance, change-orders, costs, field, files) is still the only place for several things:
- marking a lead contacted, assignment, lead source
- scheduling and the crew lock
- stage override and lost/un-lost
- walkthrough, punch list and warranty registration
- claims and change orders

Every `nextStep().href` and every Today link points to these old pages.

**Three separate stage mappings** can drift apart: `jobPhase()` (7 phases), `pipelineColumn()` (5 columns) and `STAGE_INDEX` in `job-docket.tsx:245`. `nextStep()` still follows the 7-phase model, so the board card's "next step" can contradict what the sidebar's checklist says.

## 5. Quoting / estimating

**Measure.** All three routes write `estimates.measurements`:
- satellite (Leaflet + Esri)
- plans PDF (pdf.js in the browser → `lib/plans/*` detect/geometry/roof-model/skeleton/sheets/takeoff, with optional AI title-block read)
- by hand, or an imported Nearmap/Roofgraf/CSV report

From there:
1. `lib/roof.ts` `takeoff()` produces `Takeoff[]` keyed by `lib/calc-keys.ts`.
2. `lib/docket.ts` `fillQuoteLines()` builds the line items.
3. Prices come from `quotePriceBook()` (`lib/docket-server.ts`), which lays the supplier sheet over the price book (cost × (1+markup) × 1.1).
4. `saveEstimate` → `save_estimate_content`.
5. The customer opens `/q/[token]` (`model.ts` `buildProposal`) and signs via `accept_public_estimate`, which freezes the notice snapshot and moves the job to sold.
6. Materials go out via `/app/materials/[jobId]`, and the supplier confirms on `/o/[token]`.

**Three quote UIs.** `estimates/[id]/page.tsx:65-67` decides which one opens:
- **`quote-engine.tsx`** is the current default for unsigned single-price quotes: six blocks, autosave, margin-on-sell, price-guide search.
- **`docket-editor.tsx`** is the receipt view, used for accepted quotes and `?view=docket`.
- **`estimate-editor.tsx`** is legacy but still the only home for Good/Better/Best, manual sections, report import, GST toggle, discount and AI proposal notes.

**Two material-order systems:** `/app/orders` (old, CSV/print) and `/app/materials` (new, email + PDF + supplier confirm).

## 6. Integrations

| Integration | Status | Notes |
|---|---|---|
| Anthropic | wired | Single model constant `AI_MODEL` in `lib/ai.ts:10`. Used for assistant chat (`/api/ai/assistant`, `claude-bar.tsx`), lead auto-reply, photo summary, proposal notes, supplier-invoice reading, plan title blocks. Returns 501 or a friendly error without a key. |
| Stripe | wired (REST, no SDK) | Connect Express AU, card + BECS, no surcharge, subscription checkout/cancel, HMAC webhook. |
| Twilio | wired | outbound + inbound SMS |
| Resend | wired | email |
| Xero | partial | OAuth + push contacts/invoices/payments/bills. Manual sync only. |
| Geocode | **broken for AU** | Nominatim + Open-Meteo |
| Weather | wired | Open-Meteo AU |
| State rules | wired | `lib/au-rules.ts` + `au-rules-data.ts`: effective-dated `Dated<T>` tables per state, `rulesFor(state, input)`, applied via `loadJobCompliance`. Still needs legal review before launch. |

## 7. Issues found, by priority

### Bugs that hit real users
1. ✔ **Geocoding is US-only.** `src/app/api/geocode/route.ts:15` uses `countrycodes=us`, and line 35 uses `countryCode=US` plus a 5-digit ZIP regex. Australian addresses fail, which breaks satellite measuring.
2. ✔ **Cancelling the subscription cuts customers off immediately.** `settings/billing/actions.ts:31` sets `subscription_status='cancelled'` while telling the user "keeps working until …". Portal, payment-plan and intake RPCs and the cron check `<> 'cancelled'` without the `cancel_at` grace that `org_is_live` honours.
3. ✔ **AI lead replies offer the wrong times.** `lib/leads.ts:78-90` `inspectionSlots` calls `setHours` in the server's zone (UTC on Vercel), so "9 am" means roughly 7 pm AEST. It also uses business-day maths that ignore holidays.
4. ✔ **Date-triggered payment stages are never due.** `lib/build-stage.ts:66` contains `(s.trigger === "date" && false)`.
5. ✔ **Quote engine saves can race.** `quote-engine.tsx:86` `flush` has no in-flight guard, so an older save can land last. There is also no `beforeunload` warning, unlike the other two editors.
6. **A quote measured on the satellite map stays empty in the engine.** The satellite save doesn't fill lines, and the engine has no "fill from measurements" step or price-book access.
7. **Closed jobs still raise Today tasks** for 30 days (`app/app/page.tsx` doesn't filter `closed_at`).
8. **Milestone invoices ignore the quote's own payment plan.** `invoices/actions.ts:236` uses `organizations.payment_schedule`. The `/q` page never shows `doc.payment` either.

### Security and compliance gaps
1. ✔ **Crew-lead money restrictions are UI-only.** RLS lets crew leads read and write `estimate_items.unit_cost`, `job_costs`, `invoices`, `payments` and `org_suppliers` bank details. They can also bypass the role checks inside `record_cash_payment` and on-site change-order approval by writing to the tables directly.
2. ✔ **Admins can rewrite their own SaaS billing state.** The `org_update` policy (`init.sql:380`) has no column protection over `subscription_status`, `plan` and the Stripe ids.
3. **Signed quotes are only locked inside `save_estimate_content`.** A direct UPDATE on `estimates` or `estimate_items` can still change them.
4. ✔ **Acceptance evidence is client-supplied.** `accept_public_estimate` takes `p_notices`, `p_ip` and `p_user_agent` from the caller, and `p_version = null` skips the version check (`docket_choices.sql:353`).
5. **Legal payment gates are advisory.** The ACL 10-business-day door-knock ban and the HWI-before-deposit rule aren't enforced when invoicing a plan, in `/i` checkout or in the cron. Only the deposit cap is enforced.
6. **Tokens chain and never expire.** A change-order token leads to the portal token, which leads to every quote and invoice token. Legacy anon RPCs are still granted: `get_public_document`, `get_public_invoice_pay`, and the old `accept_public_estimate` overloads.
7. **Other gaps:**
   - Twilio inbound accepts unsigned posts when `TWILIO_AUTH_TOKEN` is unset.
   - The lead-intake rate limit is an in-memory Map, which doesn't work on serverless.
   - `notifications_insert` lets any member post to anyone.
   - Storage has no per-job or role scoping.
   - Sign-out doesn't clear the service-worker cache or the IndexedDB queue.
   - `closeJob` doesn't re-check `canClose` on the server.

### Consistency and maintainability
- There are three quote editors, two material-order systems and three stage mappings.
- Pricing uses margin-on-sell in the engine but markup-on-cost on supplier sheets. GST is hardcoded at 1.1 in `price-sheet.ts`, which breaks non-GST-registered orgs.
- `searchPriceGuide` pulls the whole price list on every keystroke. `loadSupplierChoices` fetches up to 5k branches on every render and measures distance from the business rather than the job site.
- `duplicateEstimate` drops `margin_pct` and the payment fields.
- `supplier-orders-server.ts` (in `lib/`) imports from an app route file.
- US leftovers remain:
  - `shingle_color`
  - sq-ft wording in the proposal-notes prompt
  - the `+1` phone fallback in `notify.ts`
  - EagleView/Hover measurement sources
  - US claim enums
- `supabase/config.toml` references a missing `seed.sql`. The SQL test stub grants anon more than real Supabase does.
- No e2e test covers the stage sidebars or the quote engine.

## 8. Suggested build order (so two people don't collide)

The work splits cleanly into lanes that touch mostly separate files:

| Lane | Scope | Main files |
|---|---|---|
| **A. Jobs flow** | Lead sidebar: mark contacted / log call, assign owner, book inspection → `inspection`, mark lost. One "what's next" source of truth: rebuild `nextStep()` on the 5 columns and share `STAGE_INDEX`. Bring scheduling + lock, walkthrough/punch list and warranty registration into the Sold and Wrapping panels. Fix Today's `closed_at`. | `src/app/app/jobs/*`, `lib/next-step.ts`, `lib/job-docket-server.ts`, `app/app/page.tsx` |
| **B. Quoting** | Engine "fill from measurements" + price book; satellite → lines; save serialisation + beforeunload; G/B/B in the engine so `estimate-editor` can retire; show the payment plan on `/q`; one pricing model. | `src/app/app/estimates/**`, `lib/docket*.ts`, `lib/quote-pricing.ts`, `src/app/q/**`, `measure/**` |
| **C. Platform / security** | Geocode AU fix; billing-cancel grace; crew-lead RLS on money tables; column-guard `organizations`; lock accepted estimates in a trigger; server-side acceptance evidence; drop legacy anon RPCs; Twilio fail-closed; durable rate limit. | `supabase/migrations/*` (new files only), `api/*`, `lib/leads.ts` |

**Collision points to coordinate on:**
- New migrations: use unique timestamp prefixes. The last one is `20261121000100`.
- `src/lib/next-step.ts`
- `src/app/app/jobs/job-docket.tsx`
- `src/lib/types.ts`
- Any SQL function that gets redefined: only one lane should own a given function at a time.
