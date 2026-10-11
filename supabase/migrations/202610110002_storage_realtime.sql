insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,2097152,array['image/jpeg','image/webp','image/png']) on conflict(id) do nothing;
create policy product_image_read on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy product_image_upload on storage.objects for insert to anon,authenticated with check(bucket_id='product-images' and lower(storage.extension(name)) in ('jpg','jpeg','webp','png'));
create policy product_image_delete on storage.objects for delete to anon,authenticated using(bucket_id='product-images');
do $$ declare t text; begin
 foreach t in array array['warehouses','products','inventory','inventory_batches','inventory_batch_items','product_images'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if;
 end loop;
end $$;
