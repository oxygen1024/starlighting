import {csv,matchesText,type Product,type Line} from './core';
export type StockRow={product_id:string;warehouse_id:string;quantity:number};
export type WarehouseRow={id:string;name:string};
export type BatchSummary={id:string;type:string;warehouse_id:string;created_at:string};
export type MovementSummary={batch_id:string;quantity:number};
export type InventoryRow={product:Product;quantity:number;state:'empty'|'low'|'available'};
export function stockIndex(inventory:StockRow[],warehouse=''){
 const amounts=new Map<string,number>();
 for(const row of inventory)if(!warehouse||row.warehouse_id===warehouse)amounts.set(row.product_id,(amounts.get(row.product_id)??0)+row.quantity);
 return amounts;
}
export function inventoryRows(products:Product[],inventory:StockRow[],warehouse=''):InventoryRow[]{
 const amounts=stockIndex(inventory,warehouse);
 return products.map(product=>{const quantity=amounts.get(product.id)??0;return {product,quantity,state:quantity===0?'empty':quantity<=product.low_stock?'low':'available'};});
}
export type StockFilters={query:string;category:string;brand:string;location:string;state:string;sort:string};
export function filterInventory(rows:InventoryRow[],filter:StockFilters){
 const compare=new Intl.Collator('zh-HK',{numeric:true,sensitivity:'base'});
 return rows.filter(({product:p,state,quantity})=>(!filter.query||[p.name,p.barcode??'',p.brand,p.category,p.location,p.wattage,p.color_temperature].some(v=>matchesText(v,filter.query)))&&(!filter.category||p.category===filter.category)&&(!filter.brand||p.brand===filter.brand)&&(!filter.location||p.location===filter.location)&&(!filter.state||(filter.state==='attention'?state!=='available':filter.state==='available'?quantity>0:state===filter.state)))
 .sort((a,b)=>{
  if(filter.sort==='quantity_asc')return a.quantity-b.quantity||compare.compare(a.product.name,b.product.name);
  if(filter.sort==='quantity_desc')return b.quantity-a.quantity||compare.compare(a.product.name,b.product.name);
  if(filter.sort==='location')return compareLocations(a.product.location,b.product.location)||compare.compare(a.product.name,b.product.name);
  return compare.compare(a.product.name,b.product.name);
 });
}
export function compareLocations(a:string,b:string){return Number(!a.trim())-Number(!b.trim())||a.localeCompare(b,'zh-HK',{numeric:true,sensitivity:'base'});}
export function hkDay(value:Date|string|number=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');
}
export function dailyMovement(batches:BatchSummary[],moves:MovementSummary[],warehouse='',day=hkDay()){
 const relevant=new Map(batches.filter(b=>(!warehouse||b.warehouse_id===warehouse)&&hkDay(b.created_at)===day).map(b=>[b.id,b.type]));
 const result={inCount:0,outCount:0,inQuantity:0,outQuantity:0};
 for(const kind of relevant.values())if(kind==='in')result.inCount++;else if(kind==='out')result.outCount++;
 for(const m of moves){const kind=relevant.get(m.batch_id);if(kind==='in')result.inQuantity+=m.quantity;else if(kind==='out')result.outQuantity+=m.quantity;}
 return result;
}
export function inventoryExport(rows:InventoryRow[],warehouse:string){return [['倉庫範圍','貨品名稱','條碼','品牌','種類','功率','色溫','貨架資料','現有數量','補貨提示數量','庫存狀態'],...rows.map(({product:p,quantity,state})=>[warehouse,p.name,p.barcode??'',p.brand,p.category,p.wattage,p.color_temperature,p.location,quantity,p.low_stock,state==='empty'?'缺貨':state==='low'?'低庫存':'有現貨'])];}
export function downloadCsv(rows:unknown[][],filename:string){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export type PickRow={product:Product;quantity:number;available:number};
export function pickRows(lines:Line[],products:Product[],inventory:StockRow[],warehouse:string):PickRow[]{
 const items=new Map(products.map(p=>[p.id,p]));const stock=stockIndex(inventory,warehouse);
 return lines.flatMap(line=>{const product=items.get(line.product_id);return product?[{product,quantity:line.quantity,available:stock.get(product.id)??0}]:[];}).sort((a,b)=>compareLocations(a.product.location,b.product.location)||a.product.name.localeCompare(b.product.name,'zh-HK',{numeric:true}));
}
// A quantity, barcode or warehouse change invalidates an earlier check.
export function pickCheckKey(row:PickRow,warehouse:string){return JSON.stringify([warehouse,row.product.id,row.product.barcode,row.quantity]);}
