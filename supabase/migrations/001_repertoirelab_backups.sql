-- RepertoireLab cloud backup storage.
-- Run in the Supabase SQL Editor. RLS ensures users can only access their own row.
create table if not exists public.repertoirelab_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.repertoirelab_backups enable row level security;

drop policy if exists "Users can read their own RepertoireLab backup" on public.repertoirelab_backups;
create policy "Users can read their own RepertoireLab backup"
  on public.repertoirelab_backups for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own RepertoireLab backup" on public.repertoirelab_backups;
create policy "Users can insert their own RepertoireLab backup"
  on public.repertoirelab_backups for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own RepertoireLab backup" on public.repertoirelab_backups;
create policy "Users can update their own RepertoireLab backup"
  on public.repertoirelab_backups for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.repertoirelab_backups to authenticated;
revoke all on public.repertoirelab_backups from anon;
