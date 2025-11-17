# SNOOOM waitlist platform

The SNOOOM drop experience now ships with a lightweight Node.js backend that powers the double opt-in waitlist, referral tracking, and admin analytics for the hoodie program.

## Getting started

1. **Install dependencies** (only built-in Node modules are used, so this step simply creates the lockfile):

   ```bash
   npm install
   ```

2. **Configure environment variables** by copying `.env.example` and filling in your production values (never commit secrets):

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `PORT` | Port for the Node server (defaults to `4000`). |
   | `APP_BASE_URL` | Public URL used inside confirmation emails and referral links. |
   | `ADMIN_TOKEN` | Shared secret for hitting `/admin` APIs or downloading CSV exports. |
   | `EMAIL_FROM` | From address used when sending confirmation emails (Resend or another SMTP provider). |
   | `RESEND_API_KEY` | API key for [Resend](https://resend.com/) email delivery. Leave blank locally to skip sending. |

3. **Run the server**:

   ```bash
   npm run dev
   ```

   The static site, APIs, and the passwordless admin dashboard are served from `http://localhost:4000`.

## Data model

All state is persisted inside `data/store.json`, which the server manages automatically. The file-backed store tracks:

- `signups`: name, email, size preference, referral codes, confirmation token/status, and unique early-access codes with usage counters and expiry timestamps.
- `fieldNotes` & `testimonials`: copy surfaces that can be edited via the admin UI.
- `dropWindows`: start/end timestamps plus copy to control CTA state (waitlist vs live vs post-drop).
- `events`: lightweight analytics stream for page views, CTA clicks, form submissions, and section scrolls.

## Key API routes

| Route | Method | Description |
| --- | --- | --- |
| `/api/signups` | `POST` | Create or upsert a waitlist signup (double opt-in email sent with confirmation link). |
| `/api/signups/confirm?token=` | `GET` | Confirmation landing page that flips the signup to `confirmed`. |
| `/api/drop-state` | `GET` | Returns the current drop window state (`waitlist`, `live`, `post`) and copy for CTA messaging. |
| `/api/field-notes` | `GET` | Public Field Notes feed consumed by the front-end. |
| `/api/events` | `POST` | Logs analytics events (page views, CTA clicks, etc.). |
| `/api/codes/validate` | `POST` | Validates and consumes an early-access code (tracks usage counts). |
| `/api/insights/sizes` | `GET` | Aggregate waitlist counts per size. |
| `/api/insights/signups` | `GET` | Signup totals grouped by day. |
| `/api/admin/signups` | `GET` | Filterable signup list (requires `X-Admin-Token` header or `?token=` query). |
| `/api/admin/export` | `GET` | CSV export of signups (requires admin token). |
| `/api/admin/referrals` | `GET` | Top referrers with counts. |
| `/api/admin/field-notes` | `POST` | Create Field Notes from the dashboard (PUT/DELETE supported per ID). |
| `/api/admin/testimonials` | `POST` | CRUD endpoints for testimonials. |

## Admin dashboard

Visit `http://localhost:4000/admin`, paste the value from `ADMIN_TOKEN`, and use the controls to:

- Inspect waitlist rows with live filters (size, confirmation state).
- Download CSV exports for manufacturing planning.
- View inline charts for size distribution and signups over time.
- Manage Field Notes/testimonials copy without touching HTML.
- Review referral leaderboards and raw event summaries.

## Front-end integration highlights

- The waitlist form now collects **name, email, and size**, forwards the referral code (if present), and surfaces the server-generated early-access code plus referral link after a successful submission.
- Drop CTAs dynamically switch between “Get early access,” “Buy now,” and “Join next drop” based on `/api/drop-state`.
- Field Notes are sourced from `/api/field-notes` so updates made in the dashboard appear instantly.
- A site-wide analytics helper logs page views, CTA clicks, waitlist conversions, gallery lightbox events, and section scrolls back to `/api/events` for the custom analytics stream.
- The rotating Field Notes stack, email capture micro-interactions, referral helper text, and weight visualizations all continue to respect the premium navy + gold art direction.
