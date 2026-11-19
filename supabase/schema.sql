create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'Colaborador'
    check (role in ('Administrador', 'Responsável', 'Colaborador')),
  department text not null default 'Sem departamento',
  job_title text not null default 'Colaborador',
  hire_date date not null default current_date,
  annual_leave_days smallint not null default 22
    check (annual_leave_days between 22 and 60),
  is_active boolean not null default true,
  email_notifications boolean not null default true,
  in_app_notifications boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists job_title text not null default 'Colaborador';
alter table public.profiles add column if not exists hire_date date not null default current_date;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists email_notifications boolean not null default true;
alter table public.profiles add column if not exists in_app_notifications boolean not null default true;

create table if not exists public.leave_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('Submetido', 'Aprovado', 'Rejeitado', 'Cancelado')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days_count smallint not null check (days_count > 0),
  absence_type text not null default 'Férias',
  note text,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Aprovado', 'Rejeitado', 'Cancelado')),
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'Nexona Area',
  plan_name text not null default 'Plano Equipa',
  annual_days smallint not null default 22 check (annual_days between 22 and 60),
  conflict_limit smallint not null default 2 check (conflict_limit between 1 and 20),
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id) values (1)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.leave_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.leave_audit enable row level security;
alter table public.company_settings enable row level security;

revoke all on table public.profiles, public.leave_requests, public.leave_audit, public.notifications, public.company_settings from anon;
grant select on table public.profiles to authenticated;
grant select on table public.company_settings to authenticated;
grant select, insert, update, delete on table public.leave_requests to authenticated;
grant select, update on table public.notifications to authenticated;
revoke update on table public.profiles from authenticated;
grant update on table public.company_settings to authenticated;
grant select on table public.leave_audit to authenticated;
grant insert on table public.leave_audit to authenticated;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('Administrador', 'Responsável')
  );
$$;

drop policy if exists "profiles_select_own_or_manager" on public.profiles;
create policy "profiles_select_own_or_manager"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

drop policy if exists "leave_select_own_or_manager" on public.leave_requests;
create policy "leave_select_own_or_manager"
  on public.leave_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

drop policy if exists "leave_insert_own" on public.leave_requests;
create policy "leave_insert_own"
  on public.leave_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "leave_update_own_cancel_or_manager" on public.leave_requests;
create policy "leave_update_own_cancel_or_manager"
  on public.leave_requests for update to authenticated
  using (public.is_manager() or user_id = (select auth.uid()))
  with check (public.is_manager() or (user_id = (select auth.uid()) and status = 'Cancelado'));

drop policy if exists "leave_audit_select_own_or_manager" on public.leave_audit;
create policy "leave_audit_select_own_or_manager"
  on public.leave_audit for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.leave_requests r
      where r.id = request_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "leave_audit_insert" on public.leave_audit;
create policy "leave_audit_insert"
  on public.leave_audit for insert to authenticated
  with check (actor_id = (select auth.uid()));

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "company_settings_read" on public.company_settings;
create policy "company_settings_read"
  on public.company_settings for select to authenticated
  using (true);

drop policy if exists "company_settings_update_manager" on public.company_settings;
create policy "company_settings_update_manager"
  on public.company_settings for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());


create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Colaborador'), '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.notify_leave_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('Aprovado', 'Rejeitado') then
    insert into public.notifications (user_id, title, message)
    values (
      new.user_id,
      case when new.status = 'Aprovado' then 'Pedido aprovado' else 'Pedido rejeitado' end,
      'O seu pedido de ' || to_char(new.start_date, 'DD/MM/YYYY') || ' a ' || to_char(new.end_date, 'DD/MM/YYYY') || ' foi ' || lower(new.status) || '.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_leave_decision on public.leave_requests;
create trigger on_leave_decision
  after update of status on public.leave_requests
  for each row execute procedure public.notify_leave_decision();

create or replace function public.update_employee_profile(
  employee_id uuid,
  employee_name text,
  employee_role text,
  employee_department text,
  employee_title text,
  employee_hire_date date,
  employee_leave_days smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Sem permissão para alterar colaboradores';
  end if;
  if employee_role not in ('Administrador', 'Responsável', 'Colaborador') then
    raise exception 'Perfil inválido';
  end if;
  if employee_leave_days < 22 or employee_leave_days > 60 then
    raise exception 'Saldo inválido';
  end;
  update public.profiles
  set full_name = employee_name,
      role = employee_role,
      department = employee_department,
      job_title = employee_title,
      hire_date = employee_hire_date,
      annual_leave_days = employee_leave_days
  where id = employee_id;
end;
$$;

create or replace function public.notify_new_leave_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, title, message)
  select p.id, 'Novo pedido de férias',
    'Foi submetido um pedido de ' || to_char(new.start_date, 'DD/MM/YYYY') || ' a ' || to_char(new.end_date, 'DD/MM/YYYY') || '.'
  from public.profiles p
  where p.role in ('Administrador', 'Responsável')
    and p.id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists on_leave_request_created on public.leave_requests;
create trigger on_leave_request_created
  after insert on public.leave_requests
  for each row execute procedure public.notify_new_leave_request();

create or replace function public.record_leave_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.leave_audit (request_id, actor_id, action, note)
    values (new.id, new.user_id, 'Submetido', new.note);
  elsif new.status is distinct from old.status then
    insert into public.leave_audit (request_id, actor_id, action, note)
    values (new.id, (select auth.uid()), case new.status
      when 'Aprovado' then 'Aprovado'
      when 'Rejeitado' then 'Rejeitado'
      when 'Cancelado' then 'Cancelado'
      else 'Submetido' end, new.decision_note);
  end;
  return new;
end;
$$;

drop trigger if exists on_leave_audit_insert on public.leave_requests;
create trigger on_leave_audit_insert
  after insert or update of status on public.leave_requests
  for each row execute procedure public.record_leave_audit();
