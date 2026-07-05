# Cafe Alf Fresco — Compliance Tracker: Production Setup

This guide takes the app from prototype to production using **Supabase** (database) and **GitHub Pages** (hosting). Follow these steps in order.

---

## Step 1 — Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free account is fine).
2. Click **New project**. Give it a name (e.g. `cafe-alf-fresco`), set a database password, and pick a region closest to you (UK East if available).
3. Wait ~2 minutes for the project to be ready.

---

## Step 2 — Set up the database schema

1. In your Supabase project, go to **SQL Editor** (left sidebar) → **New query**.
2. Open the file `supabase/schema.sql` from this folder, copy its entire contents, paste into the SQL editor, and click **Run**.
3. You should see "Success. No rows returned." The tables, indexes, and policies are now created.

---

## Step 3 — Get your API credentials

1. In Supabase go to **Settings** (bottom of left sidebar) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijklmn.supabase.co`
   - **anon / public** key — a long JWT string starting with `eyJ...`
3. Open `js/config.js` in this folder and replace the placeholder values:

```js
App.Config = {
  SUPABASE_URL:     'https://YOUR_PROJECT_ID.supabase.co',  // ← paste Project URL
  SUPABASE_ANON_KEY: 'YOUR_ANON_KEY_HERE'                  // ← paste anon key
};
```

Save the file.

---

## Step 4 — Restrict the anon key to your domain (security)

Once you know your GitHub Pages URL (Step 5 will give it to you), come back and do this:

1. Supabase → **Settings** → **API** → scroll to **Allowed Origins (CORS)**.
2. Add your GitHub Pages URL: `https://YOUR_GITHUB_USERNAME.github.io`
3. Click Save.

This prevents anyone outside your domain from using the anon key to read or write your data.

---

## Step 5 — Publish to GitHub Pages

1. [Create a new GitHub repository](https://github.com/new). Name it something like `cafe-compliance`. Make it **Public** (required for free GitHub Pages).
2. Push all the files in this folder to that repo. If you're not familiar with git, the easiest way is:
   - Install [GitHub Desktop](https://desktop.github.com/)
   - Choose **File → Add Local Repository**, point it at this folder
   - Commit all files and push to GitHub
3. In GitHub, go to your repo → **Settings** → **Pages** (left sidebar).
4. Under **Source**, select **Deploy from a branch**, choose **main** (or **master**), folder **/ (root)**, and click **Save**.
5. After ~1 minute, GitHub will show you your live URL:
   `https://YOUR_GITHUB_USERNAME.github.io/cafe-compliance`

Open that URL — the app will connect to Supabase and seed itself with the demo data on first load.

---

## First run

On the very first page load, the app detects the database is empty and automatically seeds it with the demo users, tasks, and skills from the prototype. This takes a few seconds.

Demo logins (PIN based — select name on the login screen):

| Name | Role | PIN |
|---|---|---|
| Jason Ashwell | Admin | 1234 |
| Morgan (Manager) | Manager | 1111 |
| Sam (Supervisor) | Supervisor | 2222 |
| Alex (Staff) | Staff | 3333 |
| Jamie (Staff, 17) | Staff | 4444 |

Go to **Admin → Settings → Reset to demo data** at any time to restore the original seed data (this clears all real completions and audit history — use with care).

---

## Troubleshooting

**"Could not connect to the database"** on first load
- Check `js/config.js` — are both values filled in correctly? No extra spaces or quotes around them?
- Open browser DevTools → Console to see the detailed error.

**Data not saving / changes lost on reload**
- Check the browser console for `[Storage] ... error` messages.
- Verify the RLS policies were created by the schema.sql (Supabase → Table Editor → click a table → Policies).

**App works locally but not on GitHub Pages**
- Double-check the CORS allowed origin in Supabase matches your Pages URL exactly (including `https://`).

---

## What changed from the prototype

| | Prototype | Production |
|---|---|---|
| Data storage | Browser `localStorage` (per-device) | Supabase Postgres (shared, synced) |
| Data visibility | One browser only | All devices / browsers |
| Auth | PIN check in JS only | PIN check in JS + Supabase as data store |
| Hosting | Local file / `localhost` | GitHub Pages (public URL) |
| Reset | Admin → Settings | Admin → Settings (clears Supabase too) |

The UI, task logic, and all features are unchanged.

---

## Next steps (optional)

- **Deputy rota integration** — see the README for the planned approach once this Supabase backend is in place.
- **Real Supabase Auth** — replace PIN login with email/password and proper Row Level Security per user. This would be the logical next upgrade for tighter security.
