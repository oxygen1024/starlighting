-- Absolute quantity adjustment with optimistic concurrency and safe retries.
create table inventory_private.stock_adjustment_requests(
 idempotency_key uuid primary key,request_payload jsonb not null,result jsonb not null
);
alter table inventory_private.stock_adjustment_requests enable row level security;
revoke all on inventory_private.stock_adjustment_requests from public,anon,authenticated;
create function public.adjust_inventory_quantity(p_key uuid,p_product uuid,p_warehouse uuid,p_expected integer,p_quantity integer,p_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; prior inventory_private.stock_adjustment_requests%rowtype; prod public.products%rowtype; current_qty integer; delta integer; b uuid; ref text; result jsonb;
begin
 if p_key is null or p_product is null or p_warehouse is null then raise exception '缺少貨品、倉庫或識別碼'; end if;
 if p_quantity is null or p_quantity<0 or p_quantity>9999999 or p_expected is null or p_expected<0 then raise exception '數量必須為 0 至 9999999 嘅整數'; end if;
 if length(coalesce(p_reason,''))>500 then raise exception '原因不可超過 500 字'; end if;
 payload:=jsonb_build_object('product',p_product,'warehouse',p_warehouse,'expected',p_expected,'quantity',p_quantity,'reason',coalesce(p_reason,''));
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into prior from inventory_private.stock_adjustment_requests where idempotency_key=p_key;
 if found then
  if prior.request_payload<>payload then raise exception '識別碼已用於另一筆調整'; end if;
  return prior.result;
 end if;
 if exists(select 1 from public.inventory_batches where idempotency_key=p_key) then raise exception '識別碼已用於另一筆交易'; end if;
 if not exists(select 1 from public.warehouses where id=p_warehouse) then raise exception '倉庫不存在'; end if;
 select * into prod from public.products where id=p_product for update;
 if not found or prod.archived_at is not null then raise exception '貨品不存在或已刪除'; end if;
 select quantity into current_qty from public.inventory where product_id=p_product and warehouse_id=p_warehouse for update;
 current_qty:=coalesce(current_qty,0);
 if current_qty<>p_expected then raise exception '庫存已被其他裝置更改，請重新讀取最新數量後再確認'; end if;
 delta:=p_quantity-current_qty;
 if delta<>0 then
  insert into public.inventory(product_id,warehouse_id,quantity) values(p_product,p_warehouse,p_quantity)
  on conflict(product_id,warehouse_id) do update set quantity=excluded.quantity;
  b:=gen_random_uuid();ref:='SL-'||to_char(now() at time zone 'Asia/Hong_Kong','YYYYMMDD')||'-'||upper(replace(b::text,'-',''));
  insert into public.inventory_batches(id,batch_reference,idempotency_key,request_payload,type,warehouse_id,remarks)
  values(b,ref,p_key,payload,case when delta>0 then 'in' else 'out' end,p_warehouse,'庫存調整：'||current_qty||' → '||p_quantity||case when coalesce(p_reason,'')='' then '' else '；原因：'||p_reason end);
  insert into public.inventory_batch_items(batch_id,product_id,quantity,product_name,sku,barcode,before_quantity,after_quantity)
  values(b,p_product,abs(delta),prod.name,prod.sku,prod.barcode,current_qty,p_quantity);
 end if;
 result:=jsonb_build_object('batch_reference',ref,'before_quantity',current_qty,'after_quantity',p_quantity,'changed',delta<>0);
 insert into inventory_private.stock_adjustment_requests values(p_key,payload,result);
 return result;
end $$;
revoke all on function public.adjust_inventory_quantity(uuid,uuid,uuid,integer,integer,text) from public;
grant execute on function public.adjust_inventory_quantity(uuid,uuid,uuid,integer,integer,text) to anon,authenticated;
notify pgrst,'reload schema';
