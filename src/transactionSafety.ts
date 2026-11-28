import {addLine,validQuantity,type Line,type Product} from './core';
export function stageProduct(lines:Line[],id:string):Line[]{
 return addLine(lines,id);
}
export function canChangeOperation(lines:Line[],current:string,next:string){return !lines.length||current===next;}
export type BatchRequest={key:string;type:string;wh:string;items:Line[];remarks:string};
export type BatchReceipt={reference:string;type:string;warehouse:string;items:(Line&{name:string})[]};
export type BatchReview={request:BatchRequest;warehouse:string;items:BatchReceipt['items']};
export function snapshotReview(request:BatchRequest,products:Product[],warehouse:string):BatchReview{
 const items=request.items.map(({product_id,quantity})=>({product_id,quantity}));
 return {request:{...request,items},warehouse,items:items.map(l=>({...l,name:products.find(p=>p.id===l.product_id)?.name??l.product_id}))};
}
type BatchIdentity={id:string;batch_reference:string};
type SavedBatch=BatchIdentity&{idempotency_key:string;type:string;warehouse_id:string};
type SavedItem=Line&{product_name:string;before_quantity:number;after_quantity:number};
export type BatchAttempt={review:BatchReview;acknowledged:BatchIdentity|null};
type Ledger={batch:SavedBatch|null;items:SavedItem[]};
export async function confirmBatch(attempt:BatchAttempt,send:(request:BatchRequest)=>Promise<unknown>,read:(id:string)=>Promise<Ledger>):Promise<BatchReceipt>{
 const {request,warehouse}=attempt.review;
 if(!attempt.acknowledged){
  const response=await send(request) as Partial<BatchIdentity>|null;
  if(!response||typeof response.id!=='string'||!response.id||typeof response.batch_reference!=='string'||!response.batch_reference.startsWith('SL-')){
   throw new Error('未收到有效交易確認');
  }
  attempt.acknowledged={id:response.id,batch_reference:response.batch_reference};
 }
 const ack=attempt.acknowledged;
 const {batch,items}=await read(ack.id);
 const mismatch=()=>new Error('資料庫紀錄同確認清單唔一致，請記低批次編號並交由負責人核對');
 if(!batch||batch.id!==ack.id||batch.batch_reference!==ack.batch_reference||batch.idempotency_key!==request.key||batch.type!==request.type||batch.warehouse_id!==request.wh)throw mismatch();
 const saved=new Map(items.map(item=>[item.product_id,item]));
 if(items.length!==request.items.length||saved.size!==items.length||!items.length)throw mismatch();
 const verified=request.items.map(line=>{
  const item=saved.get(line.product_id);
  if(!item||item.quantity!==line.quantity||!validQuantity(item.quantity)||!Number.isInteger(item.before_quantity)||!Number.isInteger(item.after_quantity)||item.before_quantity<0||item.after_quantity<0||
     item.after_quantity-item.before_quantity!==(request.type==='in'?item.quantity:-item.quantity))throw mismatch();
  return {product_id:item.product_id,quantity:item.quantity,name:item.product_name};
 });
 return {reference:batch.batch_reference,type:batch.type,warehouse,items:verified};
}
