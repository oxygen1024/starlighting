import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
let db:PGlite;
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema extensions;create extension pgcrypto with schema extensions;
 create schema auth;create table auth.users(id uuid primary key,banned_until timestamptz,email text,raw_app_meta_data jsonb);create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant select,insert,delete on storage.objects to anon,authenticated;
 create function storage.extension(text) returns text language sql as $$select 'jpg'::text$$;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 let sql=readFileSync('supabase/migrations/'+f,'utf8').replace(/alter publication supabase_realtime add table public\.[a-z_]+;/g,'');
 if(f==='202610110002_storage_realtime.sql')sql=sql.slice(0,sql.indexOf('do $$'));
 await db.exec(sql);
 }
 await db.query('insert into auth.users(id)values($1)',[user]);await db.query('insert into auth.sessions values($1,$2)',[session,user]);
 await db.query("insert into inventory_private.staff_accounts(user_id,username)values($1,'tester')",[user]);
 await db.exec("insert into public.products(name,sku)values('保留原有貨品','AUTH-TEST')");
},30000);
afterAll(async()=>await db.close());
it('匿名無法讀取、寫入或執行庫存及成本 RPC',async()=>{
 await db.exec('set role anon');try{
 await expect(db.query('select * from products')).rejects.toThrow('permission denied');
 await expect(db.query("insert into products(name,sku)values('未登入','anon')")).rejects.toThrow('permission denied');
 await expect(db.query("select unlock_product_costs('1234')")).rejects.toThrow('permission denied');
 await expect(db.query("select process_inventory_batch('in',null,'[]',gen_random_uuid(),'')")).rejects.toThrow('permission denied');
 expect((await db.query('select * from storage.objects')).rows).toEqual([]);
 }finally{await db.exec('reset role');}
});
it('未授權帳戶及偽造用戶資料不能取得權限',async()=>{
 await db.exec('set role authenticated');try{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",['33333333-3333-4333-8333-333333333333']);
 expect((await db.query('select * from products')).rows).toEqual([]);
 await expect(db.query('select staff_session()')).rejects.toThrow('已授權');
 await expect(db.query("select process_inventory_batch('in',null,'[]',gen_random_uuid(),'')")).rejects.toThrow('已授權');
 await expect(db.query("insert into products(name,sku)values('未授權','blocked')")).rejects.toThrow('row-level security');
 }finally{await db.exec('reset role');}
});
it('已授權員工可操作庫存，相片有保護，成本仍需另一密碼',async()=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.query("select set_config('request.jwt.claim.session_id',$1,false)",[session]);
 await db.exec('set role authenticated');try{
 expect((await db.query('select staff_session() as name')).rows).toEqual([{name:'tester'}]);
 const id=(await db.query<{id:string}>('select id from products limit 1')).rows[0].id;const wh=(await db.query<{id:string}>('select id from warehouses limit 1')).rows[0].id;
 await db.query('select process_inventory_batch($1,$2,$3::jsonb,$4,$5)',['in',wh,JSON.stringify([{product_id:id,quantity:2}]),crypto.randomUUID(),'登入測試']);
 expect((await db.query('select quantity from inventory where product_id=$1',[id])).rows).toEqual([{quantity:2}]);
 await expect(db.query("select * from read_product_costs('invalid')")).rejects.toThrow('老細帳戶');
 await db.exec("insert into storage.objects(bucket_id,name)values('product-images','test.jpg')");
 expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
 }finally{await db.exec('reset role');}
 expect((await db.query("select public from storage.buckets where id='product-images'")).rows).toEqual([{public:false}]);
});
it('員工不可管理帳戶或透過舊成本密碼取得成本；老細毋須成本密碼',async()=>{
 await db.exec('set role authenticated');try{
 await expect(db.query('select * from list_staff_accounts()')).rejects.toThrow('老細帳戶');
 await expect(db.query("select unlock_product_costs('1234')")).rejects.toThrow('老細帳戶');
 await expect(db.query("select complete_staff_account(null,null,'test',gen_random_uuid())")).rejects.toThrow('permission denied');
 }finally{await db.exec('reset role');}
 await db.exec("update inventory_private.staff_accounts set role='boss';set role authenticated");try{
 expect((await db.query<{p:any}>('select staff_profile() as p')).rows[0].p.role).toBe('boss');
 expect((await db.query("select * from read_product_costs('boss')")).rows).toHaveLength(1);
 expect((await db.query('select * from list_staff_accounts()')).rows).toHaveLength(1);
 }finally{await db.exec("reset role;update inventory_private.staff_accounts set role='staff'");}
});
it('操作人由登入身份記錄，改名後舊紀錄保留名稱；重名會整體回退',async()=>{
 expect((await db.query('select actor_id,actor_username from inventory_batches')).rows).toEqual([{actor_id:user,actor_username:'tester'}]);
 await db.exec('set role authenticated');try{
 await db.query("update products set brand='測試品牌' where sku='AUTH-TEST'");
 expect((await db.query("select actor_username from product_activity_log where action='updated'")).rows).toEqual([{actor_username:'tester'}]);
 await expect(db.query("update inventory_private.staff_accounts set username='fake'")).rejects.toThrow('permission denied');
 }finally{await db.exec('reset role');}
 await db.query("update auth.users set email='renamed@login.starlighting.invalid' where id=$1",[user]);
 expect((await db.query('select username from inventory_private.staff_accounts where user_id=$1',[user])).rows).toEqual([{username:'renamed'}]);
 expect((await db.query('select actor_username from inventory_batches')).rows).toEqual([{actor_username:'tester'}]);
 const other='44444444-4444-4444-8444-444444444444';await db.query('insert into auth.users(id)values($1)',[other]);await db.query("insert into inventory_private.staff_accounts(user_id,username)values($1,'occupied')",[other]);
 await expect(db.query("update auth.users set email='occupied@login.starlighting.invalid' where id=$1",[user])).rejects.toThrow('duplicate key');
 expect((await db.query('select email from auth.users where id=$1',[user])).rows).toEqual([{email:'renamed@login.starlighting.invalid'}]);
 await db.exec('set role authenticated');try{
 await db.query("update products set brand='新名稱操作' where sku='AUTH-TEST'");
 expect((await db.query("select actor_username from product_activity_log where action='updated' order by created_at desc limit 1")).rows).toEqual([{actor_username:'renamed'}]);
 }finally{await db.exec('reset role');}
});
it('只有老細可停用、啟用及撤銷員工登入；不能管理自己或其他老細',async()=>{
 const target='44444444-4444-4444-8444-444444444444',sid='55555555-5555-4555-8555-555555555555';
 await db.query('insert into auth.sessions values($1,$2)',[sid,target]);
 await db.exec('set role authenticated');try{await expect(db.query('select set_staff_active($1,false)',[target])).rejects.toThrow('老細帳戶');}finally{await db.exec('reset role');}
 await db.query("update inventory_private.staff_accounts set role='boss' where user_id=$1",[user]);await db.exec('set role authenticated');try{
 await expect(db.query('select set_staff_active($1,false)',[user])).rejects.toThrow('普通員工');
 await expect(db.query('select revoke_staff_sessions($1)',[user])).rejects.toThrow('普通員工');
 await db.query('select set_staff_active($1,false)',[target]);
 }finally{await db.exec('reset role');}
 expect((await db.query('select active from inventory_private.staff_accounts where user_id=$1',[target])).rows).toEqual([{active:false}]);
 expect((await db.query('select * from auth.sessions where user_id=$1',[target])).rows).toHaveLength(0);
 await db.exec('set role authenticated');try{await db.query('select set_staff_active($1,true)',[target]);}finally{await db.exec('reset role');}
 expect((await db.query('select active from inventory_private.staff_accounts where user_id=$1',[target])).rows).toEqual([{active:true}]);
 expect((await db.query('select * from auth.sessions where user_id=$1',[target])).rows).toHaveLength(0);
 await db.query("update inventory_private.staff_accounts set role='staff' where user_id=$1",[user]);
});
it('停用帳戶及已撤銷登入工作階段立即拒絕存取',async()=>{
 await db.exec('update inventory_private.staff_accounts set active=false');await db.exec('set role authenticated');
 try{await expect(db.query('select staff_session()')).rejects.toThrow('已授權');expect((await db.query('select * from products')).rows).toEqual([]);}finally{await db.exec('reset role');}
 await db.exec('update inventory_private.staff_accounts set active=true;delete from auth.sessions;set role authenticated');
 try{await expect(db.query('select staff_session()')).rejects.toThrow('已授權');}finally{await db.exec('reset role');}
});
it('所有公開庫存 RPC 均有伺服器授權檢查',async()=>{
 const functions=(await db.query<{proname:string;prosrc:string}>("select proname,prosrc from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef")).rows;
 expect(functions).toHaveLength(19);expect(functions.filter(f=>f.proname!=='complete_staff_account').every(f=>f.prosrc.includes('perform inventory_private.require_staff();')||f.prosrc.includes('perform inventory_private.require_boss();'))).toBe(true);
});
