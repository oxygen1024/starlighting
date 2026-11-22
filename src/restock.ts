import {type Product,matchesProductQuery} from './core';
import {stockIndex,type StockRow} from './warehouse';
export function needsRestock(quantity:number,threshold:number){return quantity<threshold;}
export function restockGroups(products:Product[],inventory:StockRow[],warehouse='',query='',category=''){
 const amounts=stockIndex(inventory,warehouse);
 const groups=new Map<string,{product:Product;quantity:number;shortfall:number}[]>();
 for(const product of products){
  const quantity=amounts.get(product.id)??0,key=product.category||'未分類';
  if(!needsRestock(quantity,product.low_stock)||!matchesProductQuery(product,query)||(category&&key!==category))continue;
  const rows=groups.get(key)??[];rows.push({product,quantity,shortfall:product.low_stock-quantity});groups.set(key,rows);
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'zh-HK')).map(([category,items])=>({category,items:items.sort((a,b)=>a.quantity-b.quantity||a.product.name.localeCompare(b.product.name,'zh-HK'))}));
}
export function restockText(groups:ReturnType<typeof restockGroups>,warehouse:string){
 return ['補貨清單','倉庫範圍：'+warehouse,'產生時間：'+new Date().toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'}),'規則：現有數量少於貨品門檻；建議數量只補至門檻。',...groups.flatMap(g=>['','【'+g.category+'】',...g.items.map(({product:p,quantity,shortfall})=>`${p.name}｜品牌：${p.brand||'未填'}｜顏色：${p.color||'未填'}｜條碼：${p.barcode||'未填'}｜現有：${quantity}｜門檻：${p.low_stock}｜補至門檻：${shortfall}`)])].join('\n');
}
