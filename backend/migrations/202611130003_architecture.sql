create or replace function private.lock_sites(p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  perform id from public.construction_sites where id = any(p_ids) order by id for share;
end $$;

create function private.lock_sites_exclusive(p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
begin
  perform id from public.construction_sites where id = any(p_ids) order by id for update;
end $$;

create or replace function private.lock_task(p_id uuid, p_expected_version integer, p_target_site uuid default null)
returns public.tasks language plpgsql set search_path = '' as $$
declare v_task public.tasks; v_site uuid;
begin
  if private.actor_id() is null or private.current_role() is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select site_id into v_site from public.tasks where id = p_id and deleted_at is null
    and (private.current_role() = 'manager' or assignee_id = private.actor_id());
  if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
  perform private.lock_sites(array[v_site, p_target_site]);
  select * into v_task from public.tasks where id = p_id for update;
  if v_task.deleted_at is not null or not private.site_active(v_task.site_id)
     or (private.current_role() <> 'manager' and v_task.assignee_id <> private.actor_id()) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if v_task.site_id is distinct from v_site or p_expected_version is distinct from v_task.version then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  return v_task;
end $$;

create or replace function public.update_site(p_id uuid, p_expected_version integer, p_name text, p_address text)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites;
begin
  perform private.require_manager();
  perform private.lock_sites_exclusive(array[p_id]);
  select * into v_result from public.construction_sites where id=p_id and deleted_at is null;
  if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from v_result.version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  update public.construction_sites set name=p_name,address=p_address where id=p_id returning * into v_result;
  return v_result;
end $$;

create or replace function public.delete_site(p_id uuid, p_expected_version integer)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites;
begin
  perform private.require_manager();
  perform private.lock_sites_exclusive(array[p_id]);
  select * into v_result from public.construction_sites where id=p_id and deleted_at is null;
  if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from v_result.version then raise exception 'VERSION_CONFLICT' using errcode = '40001'; end if;
  update public.construction_sites set deleted_at=now() where id=p_id returning * into v_result;
  update public.tasks set deleted_at=now() where site_id=p_id and deleted_at is null;
  return v_result;
end $$;

create table private.creation_requests (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  command text not null check (command in ('create_site', 'create_task')),
  payload jsonb not null,
  resource_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
revoke all on private.creation_requests from public, anon, authenticated, service_role;
grant select, insert, update on private.creation_requests to crm_backend;

create function private.creation_request(p_request_id uuid, p_command text, p_payload jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare v_request private.creation_requests;
begin
  if p_request_id is null then return null; end if;
  insert into private.creation_requests(actor_id,request_id,command,payload)
  values(private.actor_id(),p_request_id,p_command,p_payload) on conflict do nothing;
  select * into v_request from private.creation_requests
    where actor_id=private.actor_id() and request_id=p_request_id for update;
  if v_request.command <> p_command or v_request.payload <> p_payload then
    raise exception 'REQUEST_MISMATCH' using errcode = '22023';
  end if;
  return v_request.resource_id;
end $$;

create function private.complete_creation(p_request_id uuid, p_resource_id uuid) returns void
language sql set search_path = '' as $$
  update private.creation_requests set resource_id=p_resource_id
    where actor_id=private.actor_id() and request_id=p_request_id
$$;

drop function public.create_site(text,text);
create function public.create_site(p_name text, p_address text, p_request_id uuid default null)
returns public.construction_sites language plpgsql security definer set search_path = '' as $$
declare v_result public.construction_sites; v_id uuid;
begin
  perform private.require_manager();
  v_id := private.creation_request(p_request_id,'create_site',jsonb_build_array(p_name,p_address));
  if v_id is not null then
    select * into v_result from public.construction_sites where id=v_id and deleted_at is null;
    if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
    return v_result;
  end if;
  insert into public.construction_sites(name,address,created_by)
    values(p_name,p_address,private.actor_id()) returning * into v_result;
  perform private.complete_creation(p_request_id,v_result.id);
  return v_result;
end $$;

drop function public.create_task(uuid,text,text,uuid);
create function public.create_task(p_site_id uuid, p_title text, p_description text, p_assignee_id uuid, p_request_id uuid default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks; v_id uuid;
begin
  perform private.require_manager();
  v_id := private.creation_request(p_request_id,'create_task',jsonb_build_array(p_site_id,p_title,p_description,p_assignee_id));
  if v_id is not null then
    select * into v_result from public.tasks where id=v_id and deleted_at is null and private.site_active(site_id);
    if not found then raise exception 'NOT_AVAILABLE' using errcode = 'P0002'; end if;
    return v_result;
  end if;
  perform private.lock_sites(array[p_site_id]);
  insert into public.tasks(site_id,title,description,assignee_id,author_id)
    values(p_site_id,p_title,p_description,p_assignee_id,private.actor_id()) returning * into v_result;
  perform private.complete_creation(p_request_id,v_result.id);
  return v_result;
end $$;

alter policy read_tasks on public.tasks using (
  deleted_at is null and private.site_active(site_id)
  and ((select private.current_role()) = 'manager' or assignee_id = (select private.actor_id()))
);
alter policy read_sites on public.construction_sites using (
  deleted_at is null and ((select private.current_role()) = 'manager'
    or exists(select 1 from public.tasks t where t.site_id = construction_sites.id))
);
alter policy read_profiles on public.profiles using (
  id = (select private.actor_id()) or (select private.current_role()) = 'manager'
  or exists(select 1 from public.tasks t where t.author_id = profiles.id or t.assignee_id = profiles.id)
  or exists(select 1 from public.task_status_events e where e.actor_id = profiles.id)
);
create index profiles_role_name on public.profiles(role, display_name, id);
create index sites_created_live on public.construction_sites(created_at desc, id) where deleted_at is null;
create index tasks_created_live on public.tasks(created_at desc, id) where deleted_at is null;

create table private.client_error_budgets (
  actor_id uuid not null references auth.users(id),
  minute timestamptz not null,
  events integer not null check (events between 1 and 20),
  primary key (actor_id, minute)
);
create table private.client_errors (
  id uuid primary key,
  actor_id uuid not null references auth.users(id),
  source text not null check (source in ('render','query','mutation','runtime')),
  code text not null check (code ~ '^[A-Za-z0-9_]{1,40}$'),
  route text not null check (route in ('/sites','/sites/:id','/tasks/:id','/my-tasks','/sign-in','/unknown')),
  release text not null check (release ~ '^[A-Za-z0-9._-]{1,80}$'),
  created_at timestamptz not null default now()
);
create index client_errors_created on private.client_errors(created_at desc);
revoke all on private.client_errors, private.client_error_budgets from public, anon, authenticated, service_role;
grant insert on private.client_errors to crm_backend;
grant select, insert, update on private.client_error_budgets to crm_backend;

create function public.report_client_error(p_id uuid,p_source text,p_code text,p_route text,p_release text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.actor_id(); v_allowed boolean;
begin
  if v_actor is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into private.client_error_budgets(actor_id,minute,events)
    values(v_actor,date_trunc('minute',now()),1)
    on conflict(actor_id,minute) do update set events=client_error_budgets.events+1
      where client_error_budgets.events<20 returning true into v_allowed;
  if not coalesce(v_allowed,false) then return; end if;
  insert into private.client_errors(id,actor_id,source,code,route,release)
    values(p_id,v_actor,p_source,p_code,p_route,p_release) on conflict do nothing;
end $$;

grant create on schema public to crm_backend;
alter function public.create_site(text,text,uuid) owner to crm_backend;
alter function public.create_task(uuid,text,text,uuid,uuid) owner to crm_backend;
alter function public.report_client_error(uuid,text,text,text,text) owner to crm_backend;
revoke create on schema public from crm_backend;
revoke all on function public.create_site(text,text,uuid), public.create_task(uuid,text,text,uuid,uuid),
  public.report_client_error(uuid,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_site(text,text,uuid), public.create_task(uuid,text,text,uuid,uuid),
  public.report_client_error(uuid,text,text,text,text) to authenticated;
revoke all on function private.lock_sites_exclusive(uuid[]), private.creation_request(uuid,text,jsonb),
  private.complete_creation(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.lock_sites_exclusive(uuid[]), private.creation_request(uuid,text,jsonb),
  private.complete_creation(uuid,uuid) to crm_backend;
