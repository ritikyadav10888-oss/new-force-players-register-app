# Force Sports Player Register — Production Deployment Plan

Deploy on **Vercel** (Next.js) + **Supabase** (one database) + **Razorpay** (payments). Firebase is **not** used for this deployment.

---

## Quick start — Vercel only

1. Finish [Phase 1](#phase-1--supabase-production-project) (Supabase prod + SQL migrations).
2. Push repo to **GitHub**.
3. [vercel.com/new](https://vercel.com/new) → Import repo → Framework **Next.js**.
4. Add [environment variables](#32-environment-variables-production) → **Deploy**.
5. Copy your `https://your-app.vercel.app` URL into Supabase Auth redirect URLs ([§ 3.4](#34-supabase-auth-for-vercel)).
6. Run [Phase 4](#phase-4--post-deploy-verification) smoke tests.

**CLI (optional):**

```powershell
npm i -g vercel
cd "c:\Users\ritik\OneDrive\Desktop\force player register"
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# … add each variable (see table below)
vercel --prod
```

---

## Architecture (production)

```
Players / Admins
       │
       ▼
┌──────────────────┐     ┌─────────────────────────┐
│  Vercel          │────▶│  Supabase (single DB)   │
│  Next.js 16      │     │  Postgres + Auth +      │
└────────┬─────────┘     │  Storage                │
         │               └─────────────────────────┘
         ▼
┌──────────────────┐
│  Razorpay Live   │
└──────────────────┘
```

| Component | Role |
|-----------|------|
| **Next.js** | UI, API routes (`/api/register`, `/api/razorpay`, `/api/tournaments`) |
| **Supabase** | Tournaments, registrations, players, RLS, admin auth |
| **Razorpay** | Order creation + payment verification on register |
| **Resend / CallMeBot** | Optional contact form email + WhatsApp |

---

## Phase 0 — Pre-deploy checklist

- [ ] **Separate Supabase project for production** (do not use your dev/test project for real users).
- [ ] **Rotate all secrets** if `.env.local` or `.env.local.example` was ever committed or shared.
- [ ] `ALLOW_DEV_MOCK_PAYMENT` is **unset** or `false` in production (mock payments are blocked when `NODE_ENV=production` anyway).
- [ ] Run `npm run build` locally and fix any errors.
- [ ] Code is on **GitHub** (or GitLab/Bitbucket) for Vercel import.
- [ ] Production host: **Vercel** (not Firebase).

---

## Phase 1 — Supabase production project

### 1.1 Create project

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** (production).
2. Note **Project URL** and **API keys** (Settings → API).

### 1.2 Database schema (run in SQL Editor, in order)

| Step | File | Purpose |
|------|------|---------|
| 1 | `supabase_schema.sql` | Base tables, storage bucket, dev storage policy |
| 2 | `supabase/migrations/20260516100000_production_rls.sql` | RLS, `admin_users`, secure policies |
| 3 | `supabase/migrations/20260518120000_tournaments_is_public.sql` | Public vs private tournaments |
| 4 | `supabase/migrations/20260518140000_tournaments_sponsor_name.sql` | Legacy (skip if step 5 already applied) |
| 5 | `supabase/migrations/20260518150000_tournaments_sponsors_jsonb.sql` | Sponsors JSONB + logo/name |
| 6 | `supabase/migrations/20260518160000_tournaments_sport.sql` | Sport column (Cricket/Football/Other) |

**CLI alternative** (if `supabase` is linked to the prod project):

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROD_REF
npx supabase db push
```

### 1.3 Storage

- Confirm bucket **`uploads`** exists (created by `supabase_schema.sql`).
- In production, restrict storage policies (the base schema has a permissive dev policy; RLS migration drops `"Public Access"` on `storage.objects` — add admin-only upload policies if uploads fail).

### 1.4 Auth (admin dashboard)

1. Authentication → **Providers** → enable Email (or your provider).
2. **URL configuration** (use your Vercel URL until custom domain is ready):
   - Site URL: `https://your-project.vercel.app` or `https://register.forcesports.in`
   - Redirect URLs: `https://your-project.vercel.app/**`, `https://register.forcesports.in/**`, `http://localhost:3000/**`
3. Create admin user: Authentication → Users → **Add user**.
4. SQL Editor:

```sql
INSERT INTO admin_users (user_id)
VALUES ('PASTE_AUTH_USER_UUID');
```

### 1.5 Security advisors

In Supabase Dashboard → **Database** → **Advisors**, fix any security lints before go-live.

---

## Phase 2 — Razorpay (live)

1. [Razorpay Dashboard](https://dashboard.razorpay.com) → activate **Live** mode.
2. Copy **Live Key ID** (`rzp_live_…`) and **Live Key Secret**.
3. Set on the host (see Phase 3) — **never** prefix the secret with `NEXT_PUBLIC_`.
4. Test a small real payment on a staging tournament before announcing the site.

---

## Phase 3 — Deploy on Vercel

### 3.1 Connect repository

1. Push code to GitHub (recommended), GitLab, or Bitbucket.
2. [Vercel](https://vercel.com) → **Add New…** → **Project** → Import repo.
3. Framework preset: **Next.js** (auto-detected).
4. **Build & Development Settings** (defaults are fine):
   - Build command: `npm run build`
   - Output: Next.js default
   - Install command: `npm install`
5. Add environment variables **before** first production deploy (§ 3.2).
6. Click **Deploy**.

### 3.2 Environment variables (Production)

In Vercel → Project → **Settings** → **Environment Variables**. Apply to **Production** (and Preview if you want staging).

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Prod Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Sensitive** — server only |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Yes | Live `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | Yes | **Sensitive** — live secret |
| `RESEND_API_KEY` | Optional | Contact form email |
| `CALLMEBOT_PHONE` | Optional | WhatsApp notifications |
| `CALLMEBOT_API_KEY` | Optional | CallMeBot |
| `ALLOW_DEV_MOCK_PAYMENT` | **No** | Do not add in production |

After changing env vars: **Deployments** → … on latest → **Redeploy**.

### 3.3 Custom domain

1. Vercel → Project → **Settings** → **Domains**.
2. Add `register.forcesports.in` (or your domain).
3. Add the DNS records Vercel shows at your registrar.
4. Update Supabase Auth URLs to the custom domain (§ 3.4).

### 3.4 Supabase Auth for Vercel

Supabase → **Authentication** → **URL configuration**:

| Field | Value |
|-------|--------|
| Site URL | `https://your-project.vercel.app` or custom domain |
| Redirect URLs | `https://your-project.vercel.app/**`, `https://your-custom-domain.com/**`, `http://localhost:3000/**` |

Without this, admin login on Vercel will fail after redirect.

### 3.5 Production branch

- **Settings** → **Git** → Production Branch: `main` (or your default).
- Every push to `main` triggers a production deployment.

---

## Appendix A — Firebase App Hosting (not used)

<details>
<summary>Only if you change your mind later — skip for Vercel deploy</summary>

## Phase 3B — Deploy Next.js on **Firebase App Hosting**

Firebase hosts your **Next.js app** (UI + `/api/*` routes). **Keep Supabase** for Postgres, auth, and storage — you do not need to move the database to Firestore unless you plan a full rewrite.

```
Players / Admins → Firebase App Hosting (Next.js) → Supabase + Razorpay
```

### Requirements

| Item | Detail |
|------|--------|
| Firebase plan | **Blaze** (pay-as-you-go) — App Hosting needs it |
| Repo | GitHub with this project at the **repository root** |
| Next.js | 13.5+ (you are on 16.x — supported) |
| Billing | Google Cloud Build + Cloud Run usage (free tier may cover light traffic) |

### 3B.1 One-time Firebase setup

1. [Firebase Console](https://console.firebase.google.com) → create or open a **production** project.
2. **Hosting & App Hosting** → **App Hosting** → **Get started** / **Create backend**.
3. Connect **GitHub** and select this repository.
4. Settings:
   - **Root directory:** `.` (repo root, where `package.json` lives)
   - **Live branch:** `main` (or your production branch)
   - **Automatic rollouts:** enabled
5. **Finish and deploy** — first build takes several minutes.
6. Your URL will look like: `backend-id--project-id.us-central1.hosted.app`

Docs: [App Hosting get started](https://firebase.google.com/docs/app-hosting/get-started)

### 3B.2 Environment variables & secrets

In Firebase Console → **App Hosting** → your backend → **Settings** → **Environment** (or **Configure backend**):

Add the **same variables** as in [Phase 3.2](#32-environment-variables-production). Mark these as **secrets** (not plain text in git):

| Secret / variable | Notes |
|-------------------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |
| `RAZORPAY_KEY_SECRET` | Secret |
| `RESEND_API_KEY` | Secret (optional) |
| `CALLMEBOT_API_KEY` | Secret (optional) |
| `NEXT_PUBLIC_*` | Can be plain env vars |

Do **not** set `ALLOW_DEV_MOCK_PAYMENT` in production.

Redeploy (push to `main` or **Roll out** in console) after changing env vars.

### 3B.3 Supabase auth URLs (required for admin login)

In **Supabase** → Authentication → **URL configuration**, add your Firebase URLs:

- **Site URL:** `https://your-backend.us-central1.hosted.app` (or custom domain)
- **Redirect URLs:**
  - `https://your-backend.us-central1.hosted.app/**`
  - `https://register.forcesports.in/**` (if using custom domain)
  - `http://localhost:3000/**` (local dev only)

### 3B.4 Custom domain

1. Firebase → App Hosting → backend → **Domains** → **Add custom domain**.
2. Add the DNS records Firebase shows (at your registrar).
3. Update Supabase redirect URLs to the custom domain.

Guide: [Connect a custom domain](https://firebase.google.com/docs/app-hosting/custom-domain)

### 3B.5 CI/CD after setup

Every push to the **live branch** triggers a new rollout automatically. Monitor builds under **App Hosting** → **Rollouts**.

Local CLI (optional, without GitHub): [Alternate deploy](https://firebase.google.com/docs/app-hosting/alt-deploy)

### Firebase vs full “Firebase stack”

| Approach | What it means |
|----------|----------------|
| **App Hosting + Supabase** (this app today) | Fastest path — only change where Next.js runs |
| **Firestore + Firebase Auth instead of Supabase** | Large migration — new schema, security rules, rewrite all data access |
| **Two databases (Supabase + Firestore)** | Usually **not recommended** for the same data — see below |

This project is built for **Supabase**; production deploy uses **Vercel**, not Firebase.

</details>

---

## Database (single source of truth)

**Vercel does not host your database.** All app data lives in **Supabase Postgres** only.

| Layer | Service |
|-------|---------|
| App host | **Vercel** |
| Database + admin auth + files | **Supabase** |
| Payments | **Razorpay** |

Do not add Firestore or a second database for tournaments/registrations — this app has no Firebase database code.

---

## Phase 4 — Post-deploy verification

Run through this on the **production URL**:

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /` | Home loads; public tournaments listed |
| 2 | `/register/{slug}` | Banner, sponsors marquee, form steps |
| 3 | Admin `/admin/login` | Sign in with allowlisted user |
| 4 | Create/edit tournament | Sponsors (logo + name), sport, `is_public` |
| 5 | Paid registration | Razorpay checkout → success → `payment_status = Paid` |
| 6 | Free tournament (`fee = 0`) | Registers without Razorpay |
| 7 | `/contact` | Inquiry saved (and email if Resend configured) |
| 8 | Closed tournament | Registration page shows closed state (not 404) |

**Smoke API** (optional):

```bash
curl https://your-domain.com/api/tournaments
curl https://your-domain.com/api/tournaments/YOUR_SLUG
```

---

## Phase 5 — Go-live & operations

### Domain & SEO

- Point DNS to Vercel (or your host).
- Set canonical domain in Vercel; redirect `www` if needed.

### Monitoring

- Vercel → **Logs** / **Analytics** for 5xx on `/api/register` and `/api/razorpay`.
- Supabase → **Logs** for auth failures and RLS denials.
- Razorpay → **Payments** for failed captures.

### Backups

- Supabase Pro: enable **Point-in-time recovery** for production.
- Export critical tournament data periodically from Dashboard or SQL.

### Rollback

| Layer | Action |
|-------|--------|
| **App** | Vercel → Deployments → **Promote** previous deployment |
| **DB** | Do not run destructive migrations without backup; revert via new forward migration |
| **Razorpay** | Switch env back to test keys only on a staging project, not prod |

---

## Environment matrix

| | Development | Production |
|---|-------------|------------|
| App host | `localhost:3000` | **Vercel** |
| Supabase project | Test / dev ref | **Dedicated prod ref** |
| Razorpay | `rzp_test_…` | `rzp_live_…` |
| `ALLOW_DEV_MOCK_PAYMENT` | `true` optional | **unset** |
| `NODE_ENV` | `development` | `production` |

---

## Quick command reference

```powershell
# Local production build test
npm run build
npm run start

# Lint before deploy
npm run lint
```

---

## Files reference

- Schema baseline: `supabase_schema.sql`
- Migrations: `supabase/migrations/*.sql`
- Env template: `.env.local.example` (copy to `.env.local` locally only)
- App entry: `src/app/` (Next.js App Router)

---

## Estimated timeline

| Phase | Effort |
|-------|--------|
| Supabase prod + migrations | 1–2 hours |
| Admin + RLS verification | 30 min |
| Vercel + env + domain | 1 hour |
| Razorpay live test | 30 min |
| Full QA pass | 1–2 hours |

**Total:** ~半 day for a careful first production launch.
