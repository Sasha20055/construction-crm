-- API roles have read-only table access; all mutations are narrow authenticated commands.
create schema if not exists private;
revoke all on schema private from public;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'crm_backend') then
    create role crm_backend nologin noinherit;
  end if;
end $$;
-- The trusted migration role needs inherited ownership to REVOKE after owner transfer.
grant crm_backend to postgres with inherit true, set true;
grant usage on schema public, private to crm_backend;
-- Non-superuser Supabase postgres needs the new owner to have CREATE during owner transfer.
grant create on schema public, private to crm_backend;

create function private.trim_text(p_value text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p_value, '^[[:space:] ]+|[[:space:] ]+$', '', 'g')
$$;

-- Supabase owns schema auth as supabase_admin; postgres cannot grant its USAGE to new roles.
-- This narrow identity-only helper retains the migration owner's existing Auth access.
create function private.actor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid()
$$;
alter function private.actor_id() owner to postgres;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'in_review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(private.trim_text(display_name)) between 1 and 200),
  role public.app_role not null
);
create table public.construction_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(private.trim_text(name)) between 1 and 200),
  address text not null check (length(private.trim_text(address)) between 1 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.construction_sites(id),
  title text not null check (length(private.trim_text(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  assignee_id uuid not null references public.profiles(id),
  status public.task_status not null default 'new',
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz
);
create table public.task_status_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  actor_id uuid not null references public.profiles(id),
  from_status public.task_status,
  to_status public.task_status not null,
  comment text check (length(comment) <= 2000),
  created_at timestamptz not null default now(),
  task_version integer not null,
  unique (task_id, task_version),
  check (from_status is distinct from to_status),
  check (to_status <> 'rework' or coalesce(length(private.trim_text(comment)), 0) > 0)
);
create index tasks_assignee_site_live on public.tasks(assignee_id, site_id) where deleted_at is null;
create index tasks_site_created on public.tasks(site_id, created_at desc, id) where deleted_at is null;
create index events_task_order on public.task_status_events(task_id, task_version);
create index tasks_author on public.tasks(author_id);
create index events_actor on public.task_status_events(actor_id);

alter table public.profiles enable row level security;
alter table public.construction_sites enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_events enable row level security;

revoke all on public.profiles, public.construction_sites, public.tasks, public.task_status_events from anon, authenticated, service_role;
grant select on public.profiles, public.construction_sites, public.tasks, public.task_status_events to authenticated;
-- Provisioning scripts run outside the client bundle with a trusted service credential.
grant select, insert, update on public.profiles to service_role;
grant select on public.construction_sites, public.tasks, public.task_status_events to service_role;
grant select on public.profiles to crm_backend;
grant select, insert, update on public.construction_sites, public.tasks to crm_backend;
grant select, insert on public.task_status_events to crm_backend;
create policy backend_profiles on public.profiles for select to crm_backend using (true);
create policy backend_sites on public.construction_sites for all to crm_backend using (true) with check (true);
create policy backend_tasks on public.tasks for all to crm_backend using (true) with check (true);
create policy backend_events_read on public.task_status_events for select to crm_backend using (true);
create policy backend_events_insert on public.task_status_events for insert to crm_backend with check (true);

create function private.current_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = private.actor_id()
$$;
create function private.site_active(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.construction_sites where id = p_id and deleted_at is null)
$$;
alter function private.current_role() owner to crm_backend;
alter function private.site_active(uuid) owner to crm_backend;
grant usage on schema private to authenticated;
revoke execute on function private.current_role(), private.site_active(uuid) from public, anon;
grant execute on function private.current_role(), private.site_active(uuid), private.actor_id() to authenticated;

create policy read_tasks on public.tasks for select to authenticated using (
  deleted_at is null and private.site_active(site_id)
  and (private.current_role() = 'manager' or assignee_id = (select private.actor_id()))
);
create policy read_sites on public.construction_sites for select to authenticated using (
  deleted_at is null and (private.current_role() = 'manager'
    or exists(select 1 from public.tasks t where t.site_id = construction_sites.id))
);
create policy read_events on public.task_status_events for select to authenticated using (
  exists(select 1 from public.tasks t where t.id = task_status_events.task_id)
);
create policy read_profiles on public.profiles for select to authenticated using (
  id = (select private.actor_id()) or private.current_role() = 'manager'
  or exists(select 1 from public.tasks t where t.author_id = profiles.id or t.assignee_id = profiles.id)
  or exists(select 1 from public.task_status_events e where e.actor_id = profiles.id)
);

create function private.require_manager() returns void
language plpgsql set search_path = '' as $$
begin
  if private.actor_id() is null or private.current_role() is distinct from 'manager'::public.app_role then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
end $$;

create function private.lock_sites(p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  -- All commands acquire site locks in UUID order before any task lock.
  perform id from public.construction_sites where id = any(p_ids) order by id for update;
end $$;

create function private.lock_task(p_id uuid, p_expected_version integer, p_target_site uuid default null)
returns public.tasks language plpgsql set search_path = '' as $$
declare v_task public.tasks; v_site uuid;
begin
  if private.actor_id() is null or private.current_role() is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select site_id into v_site from public.tasks where id = p_id and deleted_at is null
    and (private.current_role() = 'manager' or assignee_id = private.actor_id());
  if not found then raise exception using errcode = 'P0002', message = 'NOT_AVAILABLE'; end if;
  perform private.lock_sites(array[v_site, p_target_site]);
  select * into v_task from public.tasks where id = p_id for update;
  if v_task.deleted_at is not null or not private.site_active(v_task.site_id)
     or (private.current_role() <> 'manager' and v_task.assignee_id <> private.actor_id()) then
    raise exception using errcode = 'P0002', message = 'NOT_AVAILABLE';
  end if;
  if p_expected_version is distinct from v_task.version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  return v_task;
end $$;

create function private.guard_site() returns trigger language plpgsql set search_path = '' as $$
begin
  perform private.require_manager();
  new.name := private.trim_text(new.name); new.address := private.trim_text(new.address);
  if tg_op = 'INSERT' then
    new.created_by := private.actor_id(); new.created_at := now(); new.version := 1; new.deleted_at := null;
  else
    if old.deleted_at is not null then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
    if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'IMMUTABLE_FIELDS' using errcode = '42501';
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_site before insert or update on public.construction_sites
for each row execute function private.guard_site();

create function private.guard_task() returns trigger language plpgsql set search_path = '' as $$
declare v_role public.app_role := private.current_role(); v_comment text;
begin
  if private.actor_id() is null or v_role is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  new.title := private.trim_text(new.title);
  if tg_op = 'INSERT' then
    perform private.require_manager();
    if new.status <> 'new' then raise exception 'INVALID_TRANSITION' using errcode = '22023'; end if;
    new.author_id := private.actor_id(); new.created_at := now(); new.version := 1; new.deleted_at := null;
  else
    if old.deleted_at is not null then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
    if new.id <> old.id or new.author_id <> old.author_id or new.created_at <> old.created_at then
      raise exception 'IMMUTABLE_FIELDS' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      -- A transition cannot smuggle edits, reassignment or deletion into the same write.
      if row(new.site_id,new.title,new.description,new.assignee_id,new.deleted_at)
         is distinct from row(old.site_id,old.title,old.description,old.assignee_id,old.deleted_at) then
        raise exception 'INVALID_TRANSITION' using errcode = '22023';
      end if;
      if not (
        (v_role = 'executor' and old.assignee_id = private.actor_id() and (
          (old.status in ('new','rework') and new.status = 'in_progress') or
          (old.status = 'in_progress' and new.status = 'in_review')))
        or (v_role = 'manager' and old.status = 'in_review' and new.status in ('accepted','rework'))
      ) then raise exception 'INVALID_TRANSITION' using errcode = '22023'; end if;
      v_comment := nullif(private.trim_text(current_setting('crm.transition_comment', true)), '');
      if new.status = 'rework' and v_comment is null then
        raise exception 'COMMENT_REQUIRED' using errcode = '22023';
      end if;
      if length(v_comment) > 2000 then raise exception 'COMMENT_TOO_LONG' using errcode = '22023'; end if;
    else
      perform private.require_manager();
    end if;
    new.version := old.version + 1;
  end if;
  -- Soft-deleting a parent also soft-deletes its children; other writes need an active parent.
  if new.deleted_at is null and not private.site_active(new.site_id) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if not exists(select 1 from public.profiles where id = new.assignee_id and role = 'executor') then
    raise exception 'INVALID_ASSIGNEE' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_task before insert or update on public.tasks
for each row execute function private.guard_task();

create function private.audit_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_status_events(task_id,actor_id,from_status,to_status,task_version)
    values(new.id,private.actor_id(),null,new.status,new.version);
  elsif old.status is distinct from new.status then
    insert into public.task_status_events(task_id,actor_id,from_status,to_status,comment,task_version)
    values(new.id,private.actor_id(),old.status,new.status,
      nullif(private.trim_text(current_setting('crm.transition_comment', true)),''),new.version);
  end if;
  return new;
end $$;
alter function private.audit_task() owner to crm_backend;
create trigger audit_task after insert or update on public.tasks
for each row execute function private.audit_task();

create function public.create_site(p_name text, p_address text)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites;
begin
  perform private.require_manager();
  insert into public.construction_sites(name,address,created_by) values(p_name,p_address,private.actor_id()) returning * into v_result;
  return v_result;
end $$;

create function public.update_site(p_id uuid, p_expected_version integer, p_name text, p_address text)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites;
begin
  perform private.require_manager();
  perform private.lock_sites(array[p_id]);
  select * into v_result from public.construction_sites where id=p_id and deleted_at is null;
  if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from v_result.version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  update public.construction_sites set name=p_name,address=p_address where id=p_id returning * into v_result;
  return v_result;
end $$;

create function public.delete_site(p_id uuid, p_expected_version integer)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites;
begin
  perform private.require_manager();
  perform private.lock_sites(array[p_id]);
  select * into v_result from public.construction_sites where id=p_id and deleted_at is null;
  if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from v_result.version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  update public.construction_sites set deleted_at=now() where id=p_id returning * into v_result;
  update public.tasks set deleted_at=now() where site_id=p_id and deleted_at is null;
  return v_result;
end $$;

create function public.create_task(p_site_id uuid, p_title text, p_description text, p_assignee_id uuid)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks;
begin
  perform private.require_manager();
  perform private.lock_sites(array[p_site_id]);
  insert into public.tasks(site_id,title,description,assignee_id,author_id)
    values(p_site_id,p_title,p_description,p_assignee_id,private.actor_id()) returning * into v_result;
  return v_result;
end $$;

create function public.update_task(p_id uuid, p_expected_version integer, p_site_id uuid, p_title text, p_description text, p_assignee_id uuid)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks;
begin
  perform private.require_manager();
  perform private.lock_task(p_id,p_expected_version,p_site_id);
  update public.tasks set site_id=p_site_id,title=p_title,description=p_description,assignee_id=p_assignee_id
    where id=p_id returning * into v_result;
  return v_result;
end $$;

create function public.delete_task(p_id uuid, p_expected_version integer)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks;
begin
  perform private.require_manager();
  perform private.lock_task(p_id,p_expected_version);
  update public.tasks set deleted_at=now() where id=p_id returning * into v_result;
  return v_result;
end $$;

create function public.transition_task(p_id uuid, p_expected_version integer, p_target_status public.task_status, p_comment text default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks; v_old_comment text;
begin
  v_result := private.lock_task(p_id,p_expected_version);
  if p_target_status is null or p_target_status = v_result.status then raise exception 'INVALID_TRANSITION' using errcode = '22023'; end if;
  v_old_comment := current_setting('crm.transition_comment',true);
  perform set_config('crm.transition_comment',coalesce(p_comment,''),true);
  update public.tasks set status=p_target_status where id=p_id returning * into v_result;
  perform set_config('crm.transition_comment',coalesce(v_old_comment,''),true);
  return v_result;
end $$;

-- Prevent accidental execution grants inherited from Supabase default privileges.
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.current_role(), private.site_active(uuid), private.actor_id() to authenticated;
grant execute on all functions in schema private to crm_backend;

alter function public.create_site(text,text) owner to crm_backend;
alter function public.update_site(uuid,integer,text,text) owner to crm_backend;
alter function public.delete_site(uuid,integer) owner to crm_backend;
alter function public.create_task(uuid,text,text,uuid) owner to crm_backend;
alter function public.update_task(uuid,integer,uuid,text,text,uuid) owner to crm_backend;
alter function public.delete_task(uuid,integer) owner to crm_backend;
alter function public.transition_task(uuid,integer,public.task_status,text) owner to crm_backend;

revoke all on function public.create_site(text,text), public.update_site(uuid,integer,text,text),
  public.delete_site(uuid,integer), public.create_task(uuid,text,text,uuid),
  public.update_task(uuid,integer,uuid,text,text,uuid), public.delete_task(uuid,integer),
  public.transition_task(uuid,integer,public.task_status,text) from public, anon, authenticated, service_role;
grant execute on function public.create_site(text,text), public.update_site(uuid,integer,text,text),
  public.delete_site(uuid,integer), public.create_task(uuid,text,text,uuid),
  public.update_task(uuid,integer,uuid,text,text,uuid), public.delete_task(uuid,integer),
  public.transition_task(uuid,integer,public.task_status,text) to authenticated;

-- The backend role has no LOGIN, BYPASSRLS, profile writes, history UPDATE/DELETE or table DELETE.
-- New functions in these schemas must be explicitly granted by future migrations.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated, service_role;
revoke create on schema public, private from crm_backend;
