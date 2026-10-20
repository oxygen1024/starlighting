CREATE OR REPLACE FUNCTION public.import_products_with_stock(p_key uuid, p_warehouse uuid, p_items jsonb, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb; prior inventory_private.product_import_requests%rowtype; item jsonb; pid uuid; barcode_value text; price numeric; amount integer; total bigint:=0; n integer:=0; stock_items jsonb:='[]'; refs jsonb:='[]'; batch jsonb; result jsonb;
begin
 perform inventory_private.require_staff();
 if p_key is null then raise exception '缺少匯入識別碼'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '匯入清單格式無效'; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>1000 then raise exception '每次可匯入 1 至 1000 款貨品'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where x ? 'purchase_price') then perform inventory_private.require_cost_session(p_token); end if;
 select jsonb_build_object('warehouse',p_warehouse,'items',jsonb_agg(x order by x->>'id')) into payload from jsonb_array_elements(p_items) x;
 perform pg_advisory_xact_lock(hashtextextended('product_import:'||p_key::text,0));
 select * into prior from inventory_private.product_import_requests where idempotency_key=p_key;
 if found then
   if prior.request_payload<>payload then raise exception '匯入識別碼已用於另一份清單'; end if;
   return prior.result;
 end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception '匯入貨品識別碼無效或重複'; end if;
 for item in select x from jsonb_array_elements(p_items) x order by x->>'id' loop
   if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 300 then raise exception '貨品名稱空白或過長'; end if;
   if length(coalesce(item->>'brand',''))>100 or length(coalesce(item->>'category',''))>100 then raise exception '品牌或種類過長'; end if;
   if coalesce(item->>'quantity','0') !~ '^[0-9]{1,7}$' then raise exception '數量須為 0 至 9999999 嘅整數'; end if;
   amount:=coalesce(item->>'quantity','0')::integer;
   barcode_value:=nullif(trim(item->>'barcode'),'');
   if length(barcode_value)>200 then raise exception '條碼過長'; end if;
   pid:=(item->>'id')::uuid;
   insert into public.products(id,sku,name,brand,category,barcode,location,wattage,color_temperature,specifications,selling_price,low_stock)
   values(pid,pid::text,trim(item->>'name'),trim(coalesce(item->>'brand','')),trim(coalesce(item->>'category','')),barcode_value,
   coalesce(item->>'location',''),coalesce(item->>'wattage',''),coalesce(item->>'color_temperature',''),coalesce(item->>'specifications',''),
   coalesce((item->>'selling_price')::numeric,0),coalesce((item->>'low_stock')::integer,5));
   if item ? 'purchase_price' then
     if jsonb_typeof(item->'purchase_price') is distinct from 'number' then raise exception '成本須為非負數，最多兩位小數'; end if;
     price:=(item->>'purchase_price')::numeric;
     perform public.update_product_cost(p_token,pid,price,0);
   end if;
   n:=n+1;total:=total+amount;
   if amount>0 then
     stock_items:=stock_items||jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',amount));
     if jsonb_array_length(stock_items)=200 then
       batch:=public.process_inventory_batch('in',p_warehouse,stock_items,gen_random_uuid(),'Excel 匯入初始庫存；匯入編號：'||p_key::text);
       refs:=refs||jsonb_build_array(batch->>'batch_reference'); stock_items:='[]';
     end if;
   end if;
 end loop;
 if jsonb_array_length(stock_items)>0 then
   batch:=public.process_inventory_batch('in',p_warehouse,stock_items,gen_random_uuid(),'Excel 匯入初始庫存；匯入編號：'||p_key::text);
   refs:=refs||jsonb_build_array(batch->>'batch_reference');
 end if;
 result:=jsonb_build_object('product_count',n,'total_quantity',total,'batch_references',refs);
 insert into inventory_private.product_import_requests(idempotency_key,request_payload,result) values(p_key,payload,result);
 return result;
exception when unique_violation then
 raise exception '條碼或貨品識別碼重複，整批未有匯入，請核對清單';
end $function$

