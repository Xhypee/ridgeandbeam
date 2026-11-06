# Ridge & Beam

Job management software for Australian roofing companies: leads, quotes, jobs, crews, insurance work, invoices and payments, built around the rules of each state and territory.

**Stack:** Next.js 16 (App Router, Server Actions) · Supabase (Postgres, Auth, Storage, Row-Level Security) · Tailwind CSS v4 · TypeScript

## Built for Australia

- **Every state and territory** (NSW, VIC, QLD, WA, SA, TAS, ACT, NT). The job's state (or the customer's, or the company's) decides the licence, written-contract, deposit cap, cooling-off, home-warranty insurance, security-of-payment, permit, WHS and asbestos rules shown on quotes and jobs. Rules are effective-dated, for example the VIC changes on 31 March 2027 and the SA thresholds from 10 November 2025. Each rule links to its source and its verification date, and anything not verified says "check with your regulator". This is general information, not legal advice.
- **National rules**:
  - Australian Consumer Law for door-knock (unsolicited) sales: a 10-business-day cancellation window with no work or payment during it, calling hours, and the front-page notice with a termination form.
  - Single GST-inclusive prices.
  - No card surcharges from 1 October 2026.
- **Money:**
  - AUD, GST 10% (consumer prices include GST).
  - ATO-compliant tax invoices: seller ABN, GST amount, and the buyer's name or ABN from $1,000.
  - ABN check-digit validation.
  - Payment by bank transfer, PayID or BECS.
  - Xero sync and the TPAR (contractor payments) export.
- **Metric roofing:**
  - m², lineal metres, pitch in degrees, true area = plan ÷ cos(pitch).
  - Metal sheet cut lists by profile cover (Custom Orb, Trimdek, Klip-Lok).
  - Tiles, ridge capping, barge, valley iron, sarking, safety mesh, gutters and downpipes, restorations, asbestos flags.
- **Supplier price sheets:** pick Australian suppliers and branches, import their price sheets (CSV/XLSX, or rows mapped to calculator items), and price quotes from a supplier's sheet with your markup. You can compare suppliers and send material orders with the supplier's product codes.
- **Insurance work:** Australian claim stages (lodged → assessor → scope → approved / cash settlement → built → paid), insurer and assessor details, and the General Insurance Code of Practice guide.

## Modules

| Module | What it does |
| --- | --- |
| **Today** | What needs you now: new leads, quotes to chase, jobs to book, money to collect. |
| **Jobs** | A pipeline from lead to paid, and a job page with a 7-step timeline and a "Next step" bar. Also on the job: compliance checklist, claim, production, field photos, costs, change orders. |
| **Quotes** | A metric roof calculator and satellite measuring. Offer Good / Better / Best options priced from your price book or a supplier sheet. The customer link lets them compare, choose and sign online. The state's notices are frozen into the signed quote. |
| **Schedule** | Crew calendar with weather risk and a crew view for leads on site. |
| **Money** | Expected vs received, tax invoices, claim money by payer (insurer / homeowner), payments, reports. |
| **Leads** | Hosted lead form, instant $/m² quote widget, webhooks (Zapier, hipages, Facebook lead ads), round-robin to sales reps, optional AI first reply by SMS. |
| **Settings** | Company (ABN, GST, licences per state, service states), State rules, Price book, Suppliers, Team & roles, Crews & pay, Lead intake, Payments, Integrations. |

## Tenancy & security

Every business table has an `org_id`. RLS policies limit all access to members of that org (`is_org_member()`, with role checks for admin and money screens). Triggers reject cross-tenant references, such as a job pointing at another company's customer. Company creation, invites and public customer links go through `SECURITY DEFINER` RPCs keyed by unguessable tokens. See `supabase/migrations/` and the SQL tests in `supabase/tests/`.

## Getting started

```bash
npm install
npx supabase start          # local Supabase (Docker)
cp .env.example .env.local  # then paste the keys from `npx supabase status`
npm run dev
```

Open http://localhost:3000, sign up, and set up your company (state, ABN, GST). The starter price book has Australian items **with no prices**, because every roofer sets their own. Set prices under **Settings → Price book**, or connect a supplier under **Settings → Suppliers** and import their price sheet.

### Environment variables

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required. |
| `NEXT_PUBLIC_SITE_URL` | Required. Customer links and auth emails. |
| `SUPABASE_SECRET_KEY` | Server only. Public portal file links, web-lead intake, webhooks. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_URL` | SMS to homeowners, reps and crews. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Card payments and the SaaS subscription. |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_SCOPES` | Xero sync. |
| `ANTHROPIC_API_KEY` | AI lead replies and photo summaries. |
| `NEXT_PUBLIC_RULES_REPORT_EMAIL` | Where "Report a change" on Settings → State rules sends. |

Features that need an optional provider degrade gracefully when its keys are unset.

### Deploying

1. Create a Supabase project (Sydney region recommended) and run `npx supabase db push`.
2. In Supabase **Auth → URL configuration**, set the Site URL to your domain. For email confirmation, set the confirm-signup template link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. Deploy the Next.js app (for example on Vercel, Sydney region) with the environment variables above.

## Tests

```bash
npm test          # unit tests: calculator, GST, ABN, state rules, business days, claims, suppliers… (vitest)
npm run test:db   # RLS / tenancy tests against the local Supabase DB (more suites in supabase/tests/)
npm run e2e       # full browser walkthrough (needs the app on :3000 and local Supabase)
```

More browser suites live in `e2e/` (`au-estimating.js`, `au-money.js`, `compliance.js`, `suppliers.js`, `layouts.js`). Run each with `BASE_URL=http://localhost:3000 node e2e/<file> <screenshot dir>`.

## Before going live

- Have a lawyer review the state rules (`src/lib/au-rules-data.ts`) and notice wording (`src/components/state-notices.tsx`). They were researched from legislation and regulator pages on 6 November 2026, and items marked unverified must be checked.
- Confirm the supplier directory (names, branches, ordering emails) with each supplier.
- State-only public holidays are not yet in the business-day maths. Notices say so and add a day of margin.
