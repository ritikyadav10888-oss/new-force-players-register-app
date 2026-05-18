# Force Sports Player Register

Tournament registration platform — public signup, Razorpay payments, and an admin dashboard.

## Setup

1. Copy `.env.local.example` → `.env.local` and fill in all keys (including `SUPABASE_SERVICE_ROLE_KEY`).
2. Run `supabase_schema.sql` then `supabase/migrations/20260516100000_production_rls.sql` in the Supabase SQL Editor.
3. Create an admin user in Supabase Auth, then run:
   `INSERT INTO admin_users (user_id) VALUES ('your-user-uuid');`
4. Install and start:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production deploy: **[DEPLOY.md](./DEPLOY.md)** (Vercel + Supabase + Razorpay).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |

## Routes

- `/` — Public home and tournament list
- `/register/[slug]` — Player registration
- `/admin` — Admin dashboard (Supabase auth)
