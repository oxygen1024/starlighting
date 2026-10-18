alter table inventory_private.staff_accounts add column role text not null default 'staff' check(role in ('boss','staff'));
create function inventory_private.require_boss() returns void language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_staff();
 if not exists(select 1 from inventory_private.staff_accounts where user_id=(select auth.uid()) and role='boss' and active) then
 raise exception '只有老細帳戶可以使用此功能' using errcode='42501'; end if;
end $$;
revoke all on function inventory_private.require_boss() from public,anon,authenticated;
create function public.staff_profile() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_staff();
 return (select jsonb_build_object('username',username,'role',role) from inventory_private.staff_accounts where user_id=(select auth.uid()));
end $$;
revoke all on function public.staff_profile() from public,anon;
grant execute on function public.staff_profile() to authenticated;
-- The caller's current database role, not an old shared cost token, authorizes costs.
create or replace function inventory_private.require_cost_session(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_boss();
end $$;
-- Old clients cannot use the old cost-password endpoint as a staff bypass.
do $$ declare f record; begin
 for f in select oid,prosrc from pg_proc where oid in ('public.unlock_product_costs(text)'::regprocedure,'public.lock_product_costs(text)'::regprocedure) loop
 execute replace(pg_get_functiondef(f.oid),f.prosrc,replace(f.prosrc,'perform inventory_private.require_staff();','perform inventory_private.require_boss();'));
 end loop;
end $$;
create function public.list_staff_accounts() returns table(username text,role text,active boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_boss();
 return query select a.username,a.role,a.active,a.created_at from inventory_private.staff_accounts a order by a.created_at;
end $$;
revoke all on function public.list_staff_accounts() from public,anon;
grant execute on function public.list_staff_accounts() to authenticated;
-- Only the Edge Function's server credential may finalize a new Auth user.
-- It rechecks the acting boss and session and binds retries to the original Auth metadata.
create function public.complete_staff_account(p_actor uuid,p_session uuid,p_username text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not exists(select 1 from inventory_private.staff_accounts a join auth.users u on u.id=a.user_id where a.user_id=p_actor and a.role='boss' and a.active and (u.banned_until is null or u.banned_until<now()))
 or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) then raise exception '只有老細帳戶可以新增帳戶' using errcode='42501'; end if;
 if p_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' or p_request is null then raise exception '登入名稱無效'; end if;
 select id into target from auth.users where email=p_username||'@login.starlighting.invalid'
 and raw_app_meta_data->>'inventory_created_by'=p_actor::text and raw_app_meta_data->>'inventory_request'=p_request::text;
 if target is null then return null; end if;
 insert into inventory_private.staff_accounts(user_id,username,role) values(target,p_username,'staff') on conflict(user_id) do nothing;
 return target;
end $$;
revoke all on function public.complete_staff_account(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.complete_staff_account(uuid,uuid,text,uuid) to service_role;
