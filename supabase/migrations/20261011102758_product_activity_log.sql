-- Immutable product audit trail. Existing snapshots are explicitly not original change history.
create table public.product_activity_log(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products on delete restrict,
 product_name text not null,
 action text not null check(action in ('created','updated','deleted','restored','baseline')),
 before_data jsonb,
 after_data jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index product_activity_time on public.product_activity_log(created_at desc,id desc);
create index product_activity_product on public.product_activity_log(product_id,created_at desc);
alter table public.product_activity_log enable row level security;
revoke all on public.product_activity_log from anon,authenticated;
grant select on public.product_activity_log to anon,authenticated;
create policy product_activity_read on public.product_activity_log for select to anon,authenticated using(true);
create schema if not exists inventory_private;
revoke all on schema inventory_private from public,anon,authenticated;
create function inventory_private.log_product_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare event text; previous jsonb;
begin
 if TG_OP='INSERT' then event:='created';
 else
   if new is not distinct from old then return new; end if;
   previous:=to_jsonb(old)-'sku';
   event:=case when old.archived_at is null and new.archived_at is not null then 'deleted'
               when old.archived_at is not null and new.archived_at is null then 'restored'
               else 'updated' end;
 end if;
 insert into public.product_activity_log(product_id,product_name,action,before_data,after_data)
 values(new.id,new.name,event,previous,to_jsonb(new)-'sku');
 return new;
end $$;
revoke all on function inventory_private.log_product_activity() from public,anon,authenticated;
create trigger product_activity_trigger after insert or update on public.products for each row execute function inventory_private.log_product_activity();
insert into public.product_activity_log(product_id,product_name,action,after_data)
select id,name,'baseline',to_jsonb(p)-'sku' from public.products p;
alter publication supabase_realtime add table public.product_activity_log;
