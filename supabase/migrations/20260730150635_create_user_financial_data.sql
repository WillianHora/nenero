create table public.user_financial_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_financial_data_payload_object
    check (jsonb_typeof(payload) = 'object')
);

comment on table public.user_financial_data is
  'Estado financeiro privado e sincronizado de cada usuário do Nenero.';

alter table public.user_financial_data enable row level security;

revoke all on table public.user_financial_data from anon;
grant select, insert, update, delete on table public.user_financial_data to authenticated;

create policy "users_select_own_financial_data"
on public.user_financial_data
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users_insert_own_financial_data"
on public.user_financial_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users_update_own_financial_data"
on public.user_financial_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users_delete_own_financial_data"
on public.user_financial_data
for delete
to authenticated
using ((select auth.uid()) = user_id);
