grant create on schema private to crm_backend;
create function private.visible_site_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.construction_sites s
  where s.deleted_at is null and (
    (select private.current_role()) = 'manager'
    or exists(select 1 from public.tasks t where t.site_id=s.id and t.deleted_at is null
      and t.assignee_id=(select private.actor_id()))
  )
$$;
alter function private.visible_site_ids() owner to crm_backend;
revoke create on schema private from crm_backend;
revoke all on function private.visible_site_ids() from public, anon, authenticated, service_role;
grant execute on function private.visible_site_ids() to authenticated, crm_backend;
alter policy read_tasks on public.tasks using (
  deleted_at is null and site_id in (select private.visible_site_ids())
  and ((select private.current_role()) = 'manager' or assignee_id = (select private.actor_id()))
);
alter policy read_sites on public.construction_sites using (
  deleted_at is null and id in (select private.visible_site_ids())
);
