# RoofDesk

Multi-tenant SaaS for roofing contractors: CRM, roof-measurement estimating, job pipeline and crew scheduling, invoicing and payments.

**Stack:** Next.js 16 (App Router, Server Actions) · Supabase (Postgres, Auth, Row-Level Security) · Tailwind CSS v4 · TypeScript

## Features

| Module | What it does |
| --- | --- |
| **Customers / CRM** | Leads and homeowners, lead source, insurance carrier / claim # / adjuster, follow-up dates (surfaced on the dashboard). |
| **Jobs** | Pipeline board: Lead → Inspection → Estimate sent → Sold → Scheduled → In progress → Completed → Paid (or Lost). Job notes timeline. |
| **Schedule** | Weekly crew calendar, color-coded crews, list of sold jobs waiting for dates. |
| **Estimates** | Roof calculator: plan area × pitch factor → squares, waste, bundles, underlayment, ice & water, starter, ridge cap, drip edge, ridge vent, nails, tear-off, steep charge, dumpster, permit, priced from the company's price book. Editable line items, discount, tax. |
| **Customer links** | Sent estimates/invoices get an unguessable public URL. Customers can print/save as PDF and **accept & sign** estimates online, which moves the job to *Sold*. |
| **Invoices & payments** | One-click invoice from an accepted estimate. Record deposits/checks/card/insurance payments; status auto-updates (Partial → Paid), and the job moves to *Paid* when every invoice is paid. |
| **Teams** | Each company is its own tenant. Owners/admins invite teammates by link; users can belong to several companies and switch between them. |

## Tenancy & security

Every business table has an `org_id`, and RLS policies restrict all access to members of that org (`is_org_member()`). Triggers also reject cross-tenant references (e.g. a job pointing at another company's customer). Company creation, invites, and public-link access go through `SECURITY DEFINER` RPCs. See `supabase/migrations/` and the test suite in `supabase/tests/rls_test.sql`.

## Getting started

```bash
npm install
npx supabase start          # local Supabase (Docker)
cp .env.example .env.local  # then paste the publishable key from `npx supabase status`
npm run dev
```

Open http://localhost:3000, sign up, and create your company. A starter price book is seeded with placeholder prices; set your real costs under **Settings → Price book**.

### Deploying

1. Create a Supabase project and run `npx supabase db push` (or paste the migration into the SQL editor).
2. In Supabase **Auth → URL configuration**, set the Site URL to your domain. For email confirmation, set the confirm-signup template link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. Deploy the Next.js app (e.g. Vercel) with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.

## Tests

```bash
npm test          # roof calculator + money math (vitest)
npm run test:db   # RLS / tenancy / numbering / payment-status tests against the local Supabase DB
npm run e2e       # full browser walkthrough (needs the app on :3000 and local Supabase)
```

## Not built yet (good next steps)

- Sending estimate/invoice emails (today you copy the customer link)
- Online card payments (Stripe Checkout on the public invoice page)
- Photo uploads for inspections (Supabase Storage)
- Subscription billing for the SaaS itself
- Aerial measurement imports (EagleView / Hover reports)
