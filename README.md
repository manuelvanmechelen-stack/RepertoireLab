# RepertoireLab

Schaakrepertoire en openingstraining.

## Development

- Node.js 20 or later
- npm install
- npm run dev
- npm run build runs the repertoire regression tests, TypeScript checks and production build.
- npm test runs the standalone repertoire tests.

## Optional cloud backup with Supabase

Cloud backup is optional. Without configuration, all repertoire and training data stays in the browser.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run supabase/migrations/001_repertoirelab_backups.sql. The table has row-level security enabled and policies restrict each account to its own backup.
3. Copy .env.example to .env.local for local development. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the project URL and public anon/publishable key. Add the same variables to the Vercel project's Production, Preview and Development environments as appropriate, then redeploy.
4. In Supabase Authentication settings, configure the allowed site URLs and email confirmation policy for your deployment.
5. Open Mijn repertoires → Cloudsynchronisatie, create an account or sign in, then select Synchroniseer naar cloud.

### Data and security notes

- Never use a Supabase service_role key in a VITE_* variable or browser code. The public anon/publishable key is designed for client use; row-level security is the data boundary.
- Synchronization is explicit: it uploads one full backup. Restoring downloads that backup and replaces current local data after confirmation. It does not merge conflicting changes between devices.
- Authentication tokens are kept in the current browser tab's session storage; sign out when using a shared device.
- Keep a separate exported JSON backup. Cloud restore and local restore validate the backup before changing app data.
- A cloud project and its environment variables must be configured by the project owner; this repository does not contain or invent those credentials.
