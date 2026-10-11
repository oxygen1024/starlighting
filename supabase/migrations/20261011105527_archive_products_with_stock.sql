-- New explicit endpoint: legacy zero-stock deletion remains unchanged.
create function public.archive_products_with_stock(p_ids uuid[],p_expected jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare active_ids uuid[]; actual jsonb; expected jsonb; stock record; current_warehouse uuid; items jsonb:='[]'; n integer;
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>1000 or array_position(p_ids,null) is not null then raise exception '請選擇 1 至 1000 款貨品'; end if;
 if jsonb_typeof(p_expected) is distinct from 'array' then raise exception '缺少已確認庫存清單'; end if;
 -- Lock the same product rows in the same order as all stock operations.
 perform id from public.products where id=any(p_ids) order by id for update;
 select array_agg(id order by id) into active_ids from public.products where id=any(p_ids) and archived_at is null;
 if active_ids is null then return 0; end if;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'warehouse_id',warehouse_id,'quantity',quantity) order by product_id,warehouse_id),'[]') into actual
 from public.inventory where product_id=any(active_ids) and quantity>0;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',(x->>'product_id')::uuid,'warehouse_id',(x->>'warehouse_id')::uuid,'quantity',(x->>'quantity')::integer) order by (x->>'product_id')::uuid,(x->>'warehouse_id')::uuid),'[]') into expected
 from jsonb_array_elements(p_expected) x where (x->>'product_id')::uuid=any(active_ids);
 if actual<>expected then raise exception '庫存已改變，未有刪除任何貨品。請取消並重新開啟確認畫面，核對最新數量'; end if;
 for stock in select product_id,warehouse_id,quantity from public.inventory where product_id=any(active_ids) and quantity>0 order by warehouse_id,product_id loop
   if current_warehouse is not null and (stock.warehouse_id<>current_warehouse or jsonb_array_length(items)=200) then
     perform public.process_inventory_batch('out',current_warehouse,items,gen_random_uuid(),'刪除貨品：清零剩餘庫存（非一般出貨）');
     items:='[]';
   end if;
   current_warehouse:=stock.warehouse_id;
   items:=items||jsonb_build_array(jsonb_build_object('product_id',stock.product_id,'quantity',stock.quantity));
 end loop;
 if jsonb_array_length(items)>0 then
   perform public.process_inventory_batch('out',current_warehouse,items,gen_random_uuid(),'刪除貨品：清零剩餘庫存（非一般出貨）');
 end if;
 update public.products set archived_at=now(),barcode=null where id=any(active_ids);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.archive_products_with_stock(uuid[],jsonb) from public;
grant execute on function public.archive_products_with_stock(uuid[],jsonb) to anon,authenticated;
