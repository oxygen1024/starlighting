import {it,expect} from 'vitest';
import {needsRestock,restockGroups,restockText} from '../src/restock';
import type {Product} from '../src/core';
const p=(id:string,category:string,low_stock=5)=>({id,name:id,category,low_stock,brand:'測試',color:'白色',barcode:'00123'}as Product);
it('嚴格低於門檻，0 停用',()=>{expect(needsRestock(4,5)).toBe(true);expect(needsRestock(5,5)).toBe(false);expect(needsRestock(6,5)).toBe(false);expect(needsRestock(0,0)).toBe(false);});
it('分類、缺少庫存行、獨立門檻及倉庫合計',()=>{
 const products=[p('a','吸頂燈'),p('b','燈掣',2),p('c','燈掣',0)];
 const stock=[{product_id:'a',warehouse_id:'one',quantity:3},{product_id:'a',warehouse_id:'two',quantity:2}];
 expect(restockGroups(products,stock).flatMap(g=>g.items.map(i=>i.product.id))).toEqual(['b']);
 expect(restockGroups(products,stock,'one').find(g=>g.category==='吸頂燈')?.items[0].shortfall).toBe(2);
 expect(restockGroups(products,stock,'one','白色','燈掣')[0].items[0].product.id).toBe('b');
});
it('複製清單保留條碼且不匯出成本',()=>{const product=p('a','燈掣');Object.assign(product,{purchase_price:9999});const text=restockText(restockGroups([product],[]),'主倉');expect(text).toContain('【燈掣】');expect(text).toContain('00123');expect(text).toContain('補至門檻：5');expect(text).not.toContain('9999');});
