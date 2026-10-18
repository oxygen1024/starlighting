-- Staff allowlist is private and only editable by the database administrator.
create table inventory_private.staff_accounts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table inventory_private.staff_accounts enable row level security;
revoke all on inventory_private.staff_accounts from public,anon,authenticated;
create function inventory_private.is_staff() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from inventory_private.staff_accounts a
 join auth.users u on u.id=a.user_id
 where a.user_id=(select auth.uid()) and a.active
 and (u.banned_until is null or u.banned_until<now())
 and exists(select 1 from auth.sessions s where s.user_id=a.user_id and s.id::text=(select auth.jwt()->>'session_id')));
$$;
revoke all on function inventory_private.is_staff() from public,anon;
grant usage on schema inventory_private to authenticated;
grant execute on function inventory_private.is_staff() to authenticated;
create function inventory_private.require_staff() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not inventory_private.is_staff() then raise exception '請先使用已授權帳戶登入' using errcode='42501'; end if;
end $$;
revoke all on function inventory_private.require_staff() from public,anon,authenticated;
-- Protect every existing inventory/cost RPC, including idempotent retry branches.
do $$ declare f record; guarded text; definition text; begin
 for f in select p.oid,p.prosrc,p.oid::regprocedure as signature
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('process_inventory_batch','archive_products','archive_products_with_stock','import_products_with_stock','adjust_inventory_quantity','unlock_product_costs','read_product_costs','read_cost_history','update_product_cost','lock_product_costs','change_cost_password') loop
 guarded:=regexp_replace(f.prosrc,'\mbegin\M',E'begin\n perform inventory_private.require_staff();','i');
 if guarded=f.prosrc then raise exception 'Cannot guard function %',f.signature; end if;
 definition:=replace(pg_get_functiondef(f.oid),f.prosrc,guarded);
 execute definition;
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
-- Preserve existing operation-specific policies and add a mandatory staff check.
do $$ declare t text; p record; begin
 foreach t in array array['products','warehouses','inventory','inventory_batches','inventory_batch_items','product_images','product_activity_log','cost_revision'] loop
 execute format('revoke all on public.%I from public,anon',t);
 for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
 execute format('alter policy %I on public.%I to authenticated',p.policyname,t);
 end loop;
 execute format('create policy staff_only on public.%I as restrictive for all to authenticated using ((select inventory_private.is_staff())) with check ((select inventory_private.is_staff()))',t);
 end loop;
end $$;
create function public.staff_session() returns text
language plpgsql security definer set search_path='' as $$
begin
 perform inventory_private.require_staff();
 return (select username from inventory_private.staff_accounts where user_id=(select auth.uid()));
end $$;
revoke all on function public.staff_session() from public,anon;
grant execute on function public.staff_session() to authenticated;
-- Images are private; clients fetch authenticated blobs rather than public URLs.
update storage.buckets set public=false where id='product-images';
alter policy product_image_read on storage.objects to authenticated using(bucket_id='product-images' and (select inventory_private.is_staff()));
alter policy product_image_upload on storage.objects to authenticated with check(bucket_id='product-images' and (select inventory_private.is_staff()) and lower(storage.extension(name)) in ('jpg','jpeg','webp','png'));
alter policy product_image_delete on storage.objects to authenticated using(bucket_id='product-images' and (select inventory_private.is_staff()));
