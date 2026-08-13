-- Envelope Budget — Supabase schema.
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor → New query → Run).
-- Creates one table per record type, all scoped to auth.uid() via row-level security so only
-- you (signed in inside the app) can ever read or write your own rows.

create table if not exists meta (
  id text primary key default 'meta',
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists essentials (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists bills (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists debts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create table if not exists goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false
);

create index if not exists meta_user_idx on meta (user_id, updated_at);
create index if not exists essentials_user_idx on essentials (user_id, updated_at);
create index if not exists folders_user_idx on folders (user_id, updated_at);
create index if not exists transactions_user_idx on transactions (user_id, updated_at);
create index if not exists bills_user_idx on bills (user_id, updated_at);
create index if not exists debts_user_idx on debts (user_id, updated_at);
create index if not exists goals_user_idx on goals (user_id, updated_at);

alter table meta enable row level security;
alter table essentials enable row level security;
alter table folders enable row level security;
alter table transactions enable row level security;
alter table bills enable row level security;
alter table debts enable row level security;
alter table goals enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['meta','essentials','folders','transactions','bills','debts','goals']
  loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy owner_all on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
