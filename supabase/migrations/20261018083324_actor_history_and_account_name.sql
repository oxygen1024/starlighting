-- Snapshot the operator at the time of the operation. Historical rows stay unknown.
alter table public.inventory_batches add column actor_id uuid, add column actor_username text;
alter table public.product_activity_log add column actor_id uuid, add column actor_username text;
create function inventory_private.stamp_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.actor_id:=auth.uid();
 new.actor_username:=(select username from inventory_private.staff_accounts where user_id=new.actor_id);
 return new;
end $$;
revoke all on function inventory_private.stamp_actor() from public,anon,authenticated;
create trigger batch_actor before insert on public.inventory_batches for each row execute function inventory_private.stamp_actor();
create trigger product_actor before insert on public.product_activity_log for each row execute function inventory_private.stamp_actor();
-- Auth email and inventory login name change in the same Auth transaction.
-- An occupied username raises a uniqueness error, rolling back both changes.
create function inventory_private.sync_login_name() returns trigger language plpgsql security definer set search_path='' as $$
declare login_name text;
begin
 if new.email is not distinct from old.email then return new; end if;
 if not exists(select 1 from inventory_private.staff_accounts where user_id=new.id) then return new; end if;
 if new.email is null or new.email !~ '^[a-z0-9][a-z0-9._-]{2,39}@login[.]starlighting[.]invalid$' then raise exception '登入名稱格式無效'; end if;
 login_name:=split_part(new.email,'@',1);
 update inventory_private.staff_accounts set username=login_name where user_id=new.id;
 return new;
end $$;
revoke all on function inventory_private.sync_login_name() from public,anon,authenticated;
create trigger sync_inventory_login after update of email on auth.users for each row execute function inventory_private.sync_login_name();
