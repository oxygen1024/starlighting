-- New installation only. No existing inventory is deleted or overwritten.
create table public.warehouses(id uuid primary key default gen_random_uuid(), name text not null unique);
insert into public.warehouses(name) values ('主倉');
create table public.products(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 sku text not null unique check(length(trim(sku))>0), barcode text unique,
 category text not null default '', brand text not null default '', wattage text not null default '',
 color_temperature text not null default '', specifications text not null default '', location text not null default '',
 purchase_price numeric(12,2) not null default 0 check(purchase_price>=0), selling_price numeric(12,2) not null default 0 check(selling_price>=0),
 low_stock integer not null default 5 check(low_stock>=0), created_at timestamptz not null default now()
);
create table public.inventory(product_id uuid references public.products on delete restrict, warehouse_id uuid references public.warehouses on delete restrict, quantity integer not null default 0 check(quantity>=0), primary key(product_id,warehouse_id));
create table public.inventory_batches(
 id uuid primary key default gen_random_uuid(), batch_reference text not null unique,
 idempotency_key uuid not null unique, request_payload jsonb not null,
 type text not null check(type in ('in','out')), warehouse_id uuid not null references public.warehouses,
 remarks text not null default '', created_at timestamptz not null default now()
);
create table public.inventory_batch_items(
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.inventory_batches,
 product_id uuid not null references public.products, quantity integer not null check(quantity>0),
 product_name text not null, sku text not null, barcode text,
 before_quantity integer not null, after_quantity integer not null check(after_quantity>=0), unique(batch_id,product_id)
);
-- Each batch item is also the immutable stock movement record. No duplicate movement table.
create table public.product_images(product_id uuid primary key references public.products, image_path text not null, thumbnail_path text not null);
create index batches_created on public.inventory_batches(created_at desc);
create index batch_items_product on public.inventory_batch_items(product_id);

create function public.process_inventory_batch(p_type text,p_warehouse uuid,p_items jsonb,p_key uuid,p_remarks text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb; existing public.inventory_batches%rowtype; b uuid; ref text; item record; current_qty integer; next_qty integer; prod public.products%rowtype;
begin
 if p_type is null or p_type not in ('in','out') then raise exception '交易類型無效'; end if;
 if p_key is null or p_warehouse is null then raise exception '缺少交易識別碼或倉庫'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '清單格式無效'; end if;
 if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>200 then raise exception '每批須有 1 至 200 項貨品'; end if;
 if length(coalesce(p_remarks,''))>1000 then raise exception '備註不可超過 1000 字'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where x->>'product_id' is null or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,6}$') then raise exception '數量必須為 1 至 9999999 嘅整數'; end if;
 if (select count(distinct x->>'product_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception '清單有重複貨品'; end if;
 select jsonb_build_object('type',p_type,'warehouse',p_warehouse,'remarks',coalesce(p_remarks,''),'items',jsonb_agg(x order by x->>'product_id')) into payload from jsonb_array_elements(p_items) x;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into existing from public.inventory_batches where idempotency_key=p_key;
 if found then
   if existing.request_payload<>payload then raise exception '交易識別碼已用於另一筆交易'; end if;
   return jsonb_build_object('id',existing.id,'batch_reference',existing.batch_reference);
 end if;
 if not exists(select 1 from public.warehouses where id=p_warehouse) then raise exception '倉庫不存在'; end if;
 b:=gen_random_uuid(); ref:='SL-'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||'-'||upper(replace(b::text,'-',''));
 insert into public.inventory_batches(id,batch_reference,idempotency_key,request_payload,type,warehouse_id,remarks) values(b,ref,p_key,payload,p_type,p_warehouse,coalesce(p_remarks,''));
 -- Stable lock order prevents deadlocks. INSERT ON CONFLICT handles simultaneous first use.
 for item in select (x->>'product_id')::uuid as pid,(x->>'quantity')::integer as qty from jsonb_array_elements(p_items) x order by (x->>'product_id')::uuid loop
   select * into prod from public.products where id=item.pid;
   if not found then raise exception '貨品不存在'; end if;
   insert into public.inventory(product_id,warehouse_id,quantity) values(item.pid,p_warehouse,0) on conflict do nothing;
   select quantity into current_qty from public.inventory where product_id=item.pid and warehouse_id=p_warehouse for update;
   next_qty:=current_qty+case when p_type='in' then item.qty else -item.qty end;
   if next_qty<0 then raise exception '庫存不足：%',prod.name; end if;
   update public.inventory set quantity=next_qty where product_id=item.pid and warehouse_id=p_warehouse;
   insert into public.inventory_batch_items(batch_id,product_id,quantity,product_name,sku,barcode,before_quantity,after_quantity) values(b,item.pid,item.qty,prod.name,prod.sku,prod.barcode,current_qty,next_qty);
 end loop;
 return jsonb_build_object('id',b,'batch_reference',ref);
end $$;
revoke all on function public.process_inventory_batch(text,uuid,jsonb,uuid,text) from public;
grant execute on function public.process_inventory_batch(text,uuid,jsonb,uuid,text) to anon,authenticated;

-- Test-only anonymous access: everyone with the public key can read data and invoke approved writes.
-- Inventory and completed history have NO client insert/update/delete permissions.
do $$ declare t text; begin
 foreach t in array array['warehouses','products','inventory','inventory_batches','inventory_batch_items','product_images'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('create policy read_all on public.%I for select to anon,authenticated using (true)',t);
 end loop;
end $$;
grant insert,update on public.products to anon,authenticated;
create policy product_insert on public.products for insert to anon,authenticated with check(true);
create policy product_update on public.products for update to anon,authenticated using(true) with check(true);
grant insert on public.warehouses to anon,authenticated;
create policy warehouse_insert on public.warehouses for insert to anon,authenticated with check(true);
grant insert,update,delete on public.product_images to anon,authenticated;
create policy image_write on public.product_images for all to anon,authenticated using(true) with check(true);
