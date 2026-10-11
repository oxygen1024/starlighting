import {PGlite}from'@electric-sql/pglite';
import {pgcrypto}from'@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync}from'node:fs';
import {beforeAll,afterAll,it,expect}from'vitest';
let db:PGlite,id:string,token:string;
const password='Test-only-Password-123!';
async function unlock(pass=password){return (await db.query<{value:any}>('select public.unlock_product_costs($1) as value',[pass])).rows[0].value;}
async function costs(t=token){return db.query('select * from public.read_product_costs($1)',[t]);}
beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec('create role anon;create role authenticated;create schema extensions;create extension pgcrypto with schema extensions;');
 for(const f of ['202610110001_inventory.sql','20261011102455_archive_products.sql','20261011102758_product_activity_log.sql','20261011103707_import_products_with_stock.sql','20261011105527_archive_products_with_stock.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8').replace('alter publication supabase_realtime add table public.product_activity_log;',''));
 id=(await db.query<{id:string}>("insert into products(name,sku,purchase_price)values('私密成本測試','COST',32.50) returning id")).rows[0].id;
 await db.exec('begin;'+readFileSync('supabase/migrations/20261011113135_protect_product_costs.sql','utf8').replace('alter publication supabase_realtime add table public.cost_revision;','')+'commit;');
 await db.query("update inventory_private.cost_access_settings set password_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",[password]);
},30000);
afterAll(async()=>await db.close());
it('搬移原有單價及紀錄並完全移除公開成本欄位',async()=>{
 expect((await db.query('select purchase_price from inventory_private.product_costs where product_id=$1',[id])).rows).toEqual([{purchase_price:'32.50'}]);
 expect((await db.query('select after_price from inventory_private.cost_history where product_id=$1',[id])).rows).toEqual([{after_price:'32.50'}]);
 await db.exec('set role anon');try{
  expect((await db.query('select * from products where id=$1',[id])).rows[0]).not.toHaveProperty('purchase_price');
  const log=(await db.query<{after_data:any}>('select after_data from product_activity_log where product_id=$1',[id])).rows[0];
  expect(log.after_data).not.toHaveProperty('purchase_price');
  await expect(db.query('select * from inventory_private.product_costs')).rejects.toThrow('permission denied');
  await expect(costs('invalid')).rejects.toThrow('成本已鎖定');
 }finally{await db.exec('reset role');}
});
it('錯誤密碼拒絕，正確密碼發出 15 分鐘令牌及讀取成本',async()=>{
 await db.exec('set role anon');try{
  expect((await unlock('incorrect-password')).error).toBe('密碼不正確');
  const result=await unlock();token=result.token;expect(token).toHaveLength(64);
  expect(Date.parse(result.expires_at)-Date.now()).toBeGreaterThan(14*60*1000);
  expect((await costs()).rows).toEqual([{product_id:id,purchase_price:'32.50'}]);
 }finally{await db.exec('reset role');}
});
it('保護寫入、拒絕過期比較值及保留成本變動紀錄',async()=>{
 await db.exec('set role anon');try{
  await expect(db.query('select update_product_cost($1,$2,45,32.5)',['invalid',id])).rejects.toThrow('成本已鎖定');
  await db.query('select update_product_cost($1,$2,45,32.5)',[token,id]);
  await expect(db.query('select update_product_cost($1,$2,50,32.5)',[token,id])).rejects.toThrow('其他裝置');
  await expect(db.query('select update_product_cost($1,$2,-1,45)',[token,id])).rejects.toThrow('非負數');
  const history=(await db.query<{before_price:string;after_price:string}>('select * from read_cost_history($1,$2)',[token,id])).rows;
  expect(history[0].before_price).toBe('32.50');expect(history[0].after_price).toBe('45.00');
  expect((await db.query('select * from product_activity_log')).rows.every((r:any)=>!JSON.stringify(r).includes('purchase_price'))).toBe(true);
 }finally{await db.exec('reset role');}
});
it('新增、Excel 匯入與庫存操作維持正常，私密單價預設 0',async()=>{
 const newId=crypto.randomUUID(),key=crypto.randomUUID();
 const warehouse=(await db.query<{id:string}>('select id from warehouses limit 1')).rows[0].id;
 await db.exec('set role anon');try{
  await db.query('select import_products_with_stock($1,$2,$3::jsonb)',[key,warehouse,JSON.stringify([{id:newId,name:'匯入仍正常',quantity:3}])]);
  expect((await db.query('select quantity from inventory where product_id=$1',[newId])).rows).toEqual([{quantity:3}]);
  expect((await costs()).rows).toContainEqual({product_id:newId,purchase_price:'0.00'});
  await db.query('select process_inventory_batch($1,$2,$3::jsonb,$4,$5)',['out',warehouse,JSON.stringify([{product_id:newId,quantity:1}]),crypto.randomUUID(),'測試']);
  expect((await db.query('select quantity from inventory where product_id=$1',[newId])).rows).toEqual([{quantity:2}]);
 }finally{await db.exec('reset role');}
});
it('立即鎖定及到期令牌均不能讀取',async()=>{
 await db.exec('set role anon');await db.query('select lock_product_costs($1)',[token]);await expect(costs()).rejects.toThrow('成本已鎖定');await db.exec('reset role');
 token=(await unlock()).token;
 await db.exec("update inventory_private.cost_sessions set expires_at=now()-interval '1 second'");
 await db.exec('set role anon');try{await expect(costs()).rejects.toThrow('成本已鎖定');}finally{await db.exec('reset role');}
});
it('八次錯誤密碼觸發伺服器限流，不能靠換裝置避過',async()=>{
 await db.exec('set role anon');try{for(let i=0;i<8;i++)expect((await unlock('incorrect-password')).error).toBe('密碼不正確');expect((await unlock()).error).toContain('5 分鐘');}finally{await db.exec('reset role');}
 await db.exec("update inventory_private.cost_access_settings set retry_at=now()-interval '1 second'");
 token=(await unlock()).token;expect(token).toHaveLength(64);
});
it('更改密碼撤銷所有裝置令牌，舊密碼失效',async()=>{
 const other=(await unlock()).token;
 await db.exec('set role anon');try{
  await expect(db.query('select change_cost_password($1,$2)',['bad','Another-password-123!'])).rejects.toThrow('成本已鎖定');
  await db.query('select change_cost_password($1,$2)',[token,'Another-password-123!']);
  await expect(costs(token)).rejects.toThrow('成本已鎖定');await expect(costs(other)).rejects.toThrow('成本已鎖定');
  expect((await unlock()).error).toBe('密碼不正確');expect((await unlock('Another-password-123!')).token).toHaveLength(64);
 }finally{await db.exec('reset role');}
});
