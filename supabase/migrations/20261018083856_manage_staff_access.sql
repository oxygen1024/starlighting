create function public.list_staff_accounts_v2() returns table(user_id uuid,username text,role text,active boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_boss();
 return query select a.user_id,a.username,a.role,a.active,a.created_at from inventory_private.staff_accounts a order by a.created_at;
end $$;
create function public.staff_management_target(p_target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_boss();
 if p_target=(select auth.uid()) or not exists(select 1 from inventory_private.staff_accounts where user_id=p_target and role='staff') then raise exception '只可以管理普通員工帳戶' using errcode='42501'; end if;
 return p_target;
end $$;
create function public.set_staff_active(p_target uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
 perform inventory_private.require_boss();
 perform public.staff_management_target(p_target);
 if p_active is null then raise exception '帳戶狀態無效'; end if;
 select active into previous from inventory_private.staff_accounts where user_id=p_target and role='staff' for update;
 if not found then raise exception '員工帳戶不存在'; end if;
 if previous is distinct from p_active then
 update inventory_private.staff_accounts set active=p_active where user_id=p_target;
 -- Revocation ensures reactivation never revives a previous session.
 delete from auth.sessions where user_id=p_target;
 end if;
end $$;
create function public.revoke_staff_sessions(p_target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_boss();
 perform public.staff_management_target(p_target);
 delete from auth.sessions where user_id=p_target;
end $$;
revoke all on function public.list_staff_accounts_v2(),public.staff_management_target(uuid),public.set_staff_active(uuid,boolean),public.revoke_staff_sessions(uuid) from public,anon;
grant execute on function public.list_staff_accounts_v2(),public.staff_management_target(uuid),public.set_staff_active(uuid,boolean),public.revoke_staff_sessions(uuid) to authenticated;
