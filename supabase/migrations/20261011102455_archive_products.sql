-- Soft deletion retains product references and immutable transaction history.
alter table public.products add column archived_at timestamptz;
alter policy product_insert on public.products with check (archived_at is null);
alter policy product_update on public.products using (archived_at is null) with check (archived_at is null);
create function public.archive_products(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare p record; n integer:=0;
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>1000 or array_position(p_ids,null) is not null then raise exception '請選擇 1 至 1000 款貨品'; end if;
 -- Same stable product lock order as stock operations.
 for p in select id,name,archived_at from public.products where id=any(p_ids) order by id for update loop
   if p.archived_at is null then
     if exists(select 1 from public.inventory where product_id=p.id and quantity>0) then raise exception '「%」仍有庫存，請先完成出倉，今次未有刪除任何貨品',p.name; end if;
     update public.products set archived_at=now(),barcode=null where id=p.id;
     n:=n+1;
   end if;
 end loop;
 return n;
end $$;
revoke all on function public.archive_products(uuid[]) from public;
grant execute on function public.archive_products(uuid[]) to anon,authenticated;

create or replace function public.process_inventory_batch(p_type text,p_warehouse uuid,p_items jsonb,p_key uuid,p_remarks text default '') returns jsonb
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
   select * into prod from public.products where id=item.pid for update;
   if not found then raise exception '貨品不存在'; end if;
   if prod.archived_at is not null then raise exception '貨品已刪除：%',prod.name; end if;
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

