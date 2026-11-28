import {addLine,validQuantity,type Line,type Product} from './core';
export function stageProduct(lines:Line[],id:string):Line[]{
 return addLine(lines,id);
}
export function canChangeOperation(lines:Line[],current:string,next:string){return !lines.length||current===next;}
export type BatchRequest={key:string;type:string;wh:string;items:Line[];remarks:string};
export type BatchReceipt={reference:string;type:string;warehouse:string;items:(Line&{name:string})[]};
// A transport response without a valid receipt must stay unresolved with the same key.
export function validateReceipt(data:unknown,request:BatchRequest,products:Product[],warehouses:{id:string;name:string}[]):BatchReceipt{
 const response=data as {id?:unknown;batch_reference?:unknown}|null;
 if(!response||typeof response.id!=='string'||!response.id||typeof response.batch_reference!=='string'||!response.batch_reference.startsWith('SL-')||!request.items.length||request.items.some(l=>!validQuantity(l.quantity)))throw new Error('未收到有效交易確認，請用同一筆交易安全重試。');
 return {reference:response.batch_reference,type:request.type,warehouse:warehouses.find(w=>w.id===request.wh)?.name??request.wh,items:request.items.map(l=>({...l,name:products.find(p=>p.id===l.product_id)?.name??l.product_id}))};
}
