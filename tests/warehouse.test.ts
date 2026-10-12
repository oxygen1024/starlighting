import {describe,it,expect} from 'vitest';
import {dailyMovement,hkDay,inventoryRows,filterInventory,inventoryExport,pickRows,pickCheckKey,stockIndex,type StockFilters} from '../src/warehouse';
import {csv,type Product} from '../src/core';
const product=(id:string,values:Partial<Product>={}):Product=>({id,name:'單 So',sku:id,barcode:'00123'+id,category:'配件',brand:'測試',wattage:'',color_temperature:'',specifications:'',location:'A2',selling_price:10,low_stock:3,created_at:'2026-10-01T00:00:00Z',...values});
const products=[product('a'),product('b',{name:'筒燈',location:'A10'}),product('c',{name:'燈帶',location:''})];
const inventory=[{product_id:'a',warehouse_id:'one',quantity:2},{product_id:'a',warehouse_id:'two',quantity:7},{product_id:'b',warehouse_id:'one',quantity:0}];
const filters:StockFilters={query:'',category:'',brand:'',location:'',state:'',sort:'location'};
describe('倉務工作台',()=>{
 it('香港日期跨午夜正確，不受裝置時區影響',()=>{expect(hkDay('2026-10-11T15:59:59Z')).toBe('2026-10-11');expect(hkDay('2026-10-11T16:00:00Z')).toBe('2026-10-12');});
 it('今日入出倉只計算選定倉庫、日期及已存在批次',()=>{
 const batches=[{id:'a',type:'in',warehouse_id:'one',created_at:'2026-10-11T16:00:00Z'},{id:'b',type:'out',warehouse_id:'one',created_at:'2026-10-11T15:59:59Z'},{id:'c',type:'out',warehouse_id:'two',created_at:'2026-10-12T00:00:00Z'}];
 const moves=[{batch_id:'a',quantity:4},{batch_id:'a',quantity:3},{batch_id:'b',quantity:9},{batch_id:'c',quantity:2},{batch_id:'unknown',quantity:99}];
 expect(dailyMovement(batches,moves,'one','2026-10-12')).toEqual({inCount:1,outCount:0,inQuantity:7,outQuantity:0});
 expect(dailyMovement(batches,moves,'','2026-10-12')).toEqual({inCount:1,outCount:1,inQuantity:7,outQuantity:2});
 });
});
describe('庫存查詢與匯出',()=>{
 it('按倉庫分開數量，缺少庫存行的貨品顯示 0',()=>{expect(stockIndex(inventory).get('a')).toBe(9);const rows=inventoryRows(products,inventory,'one');expect(rows.map(r=>[r.quantity,r.state])).toEqual([[2,'low'],[0,'empty'],[0,'empty']]);});
 it('寬鬆名稱、貨架及多重篩選可以合用，有現貨包括低庫存',()=>{const rows=inventoryRows(products,inventory,'one');expect(filterInventory(rows,{...filters,query:'單蘇',brand:'測試',category:'配件',state:'available'})).toHaveLength(1);expect(filterInventory(rows,{...filters,query:'A10'})[0].product.id).toBe('b');expect(filterInventory(rows,{...filters,query:'單蘇',brand:'其他'})).toHaveLength(0);expect(filterInventory(rows,{...filters,state:'attention'})).toHaveLength(3);});
 it('貨架自然排序 A2 先於 A10，未填貨架排最後且不改原陣列',()=>{const rows=inventoryRows([...products].reverse(),inventory);const sorted=filterInventory(rows,filters);expect(sorted.map(x=>x.product.id)).toEqual(['a','b','c']);expect(rows[0].product.id).toBe('c');expect(filterInventory(rows,{...filters,sort:'quantity_desc'})[0].quantity).toBe(9);});
 it('匯出只包含公開庫存欄位，保留條碼前置零並阻止 CSV 公式',()=>{const p=product('x',{name:'=1+1'});Object.assign(p,{purchase_price:9876.54});const rows=inventoryExport(inventoryRows([p],[]),'主倉');const text=csv(rows);expect(text).toContain('00123x');expect(text).toContain("'=1+1");expect(text).not.toContain('9876');expect(text).not.toContain('purchase_price');});
});
describe('出倉執貨核對',()=>{
 it('按貨架排序，沿用當倉最新庫存，已刪貨品不會變成虛構清單行',()=>{const rows=pickRows([{product_id:'b',quantity:1},{product_id:'a',quantity:2},{product_id:'deleted',quantity:1}],products,inventory,'one');expect(rows.map(r=>[r.product.id,r.quantity,r.available])).toEqual([['a',2,2],['b',1,0]]);});
 it('改數量、條碼或倉庫會令舊核對失效',()=>{const row=pickRows([{product_id:'a',quantity:2}],products,inventory,'one')[0];const key=pickCheckKey(row,'one');expect(pickCheckKey({...row,quantity:3},'one')).not.toBe(key);expect(pickCheckKey(row,'two')).not.toBe(key);expect(pickCheckKey({...row,product:{...row.product,barcode:'new'}},'one')).not.toBe(key);});
});
