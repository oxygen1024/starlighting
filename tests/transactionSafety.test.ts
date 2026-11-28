import {describe,it,expect,vi} from 'vitest';
import {stageProduct,canChangeOperation,snapshotReview,confirmBatch,canEditAfterBatchRejection,type BatchAttempt} from '../src/transactionSafety';
import type {Product} from '../src/core';
describe('出倉清單保護',()=>{
 it('加入另一款貨品保留已輸入數量，不靜默取代舊貨品',()=>{
  const original=[{product_id:'first',quantity:12}];
  const next=stageProduct(original,'second');
  expect(next).toEqual([{product_id:'first',quantity:12},{product_id:'second',quantity:1}]);
  expect(original).toEqual([{product_id:'first',quantity:12}]);
 });
 it('有意再次加入同一款貨品會累加，不重設為 1',()=>{
  expect(stageProduct([{product_id:'first',quantity:12}],'first')).toEqual([{product_id:'first',quantity:13}]);
 });
 it('只容許空清單轉換出入倉方向，現有清單可繼續加入同方向貨品',()=>{
  expect(canChangeOperation([], 'in','out')).toBe(true);
  expect(canChangeOperation([{product_id:'first',quantity:12}], 'in','out')).toBe(false);
  expect(canChangeOperation([{product_id:'first',quantity:12}], 'out','out')).toBe(true);
 });
});
describe('確認清單同入賬明細核對',()=>{
 const lines=[{product_id:'first',quantity:12},{product_id:'second',quantity:7}];
 const draft=(items=lines)=>({key:'key',type:'out',wh:'warehouse',items,remarks:''});
 const products=[{id:'first',name:'貨品甲'},{id:'second',name:'貨品乙'}] as Product[];
 const makeAttempt=():BatchAttempt=>({review:snapshotReview(draft(),products,'測試倉'),acknowledged:null});
 const ack={id:'batch',batch_reference:'SL-test'};
 const saved={batch:{...ack,idempotency_key:'key',type:'out',warehouse_id:'warehouse'},items:[
  {...lines[1],product_name:'貨品乙',before_quantity:7,after_quantity:0},
  {...lines[0],product_name:'貨品甲',before_quantity:16,after_quantity:4}
 ]};
 it('確認後同步改動清單，都會提交畫面顯示嘅兩件貨品同原有數量',async()=>{
  const live=lines.map(l=>({...l}));
  const review=snapshotReview(draft(live),products,'測試倉');
  live[0].quantity=99;live.pop();
  const send=vi.fn(async()=>ack);
  const result=await confirmBatch({review,acknowledged:null},send,async()=>saved);
  expect(send).toHaveBeenCalledWith(draft());
  expect(review.items.map(l=>l.quantity)).toEqual([12,7]);
  expect(result.items.map(l=>[l.name,l.quantity])).toEqual([['貨品甲',12],['貨品乙',7]]);
 });
 it('成功回覆後缺少一件貨品，不顯示完成；重新核對唔會再提交',async()=>{
  const attempt=makeAttempt(),send=vi.fn(async()=>ack);
  await expect(confirmBatch(attempt,send,async()=>({...saved,items:saved.items.slice(0,1)}))).rejects.toThrow('同確認清單唔一致');
  expect(attempt.acknowledged).toEqual(ack);
  await expect(confirmBatch(attempt,send,async()=>saved)).resolves.toMatchObject({reference:'SL-test'});
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('拒絕錯批次、錯倉庫、錯交易方向、重複貨品、錯數量同錯扣數',async()=>{
  for(const ledger of [
   {...saved,batch:{...saved.batch,idempotency_key:'other'}},
   {...saved,batch:{...saved.batch,warehouse_id:'other'}},
   {...saved,batch:{...saved.batch,type:'in'}},
   {...saved,items:[saved.items[0],saved.items[0]]},
   {...saved,items:[saved.items[0],{...saved.items[1],quantity:11,after_quantity:5}]},
   {...saved,items:[saved.items[0],{...saved.items[1],after_quantity:3}]}
  ])await expect(confirmBatch(makeAttempt(),async()=>ack,async()=>ledger)).rejects.toThrow('同確認清單唔一致');
 });
 it('未收到有效批次回覆，重試會保留同一交易識別碼同清單',async()=>{
  const attempt=makeAttempt(),read=vi.fn(async()=>saved);
  const send=vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(ack);
  await expect(confirmBatch(attempt,send,read)).rejects.toThrow('未收到有效交易確認');
  expect(read).not.toHaveBeenCalled();
  await confirmBatch(attempt,send,read);
  expect(send.mock.calls).toEqual([[draft()],[draft()]]);
 });
 it('交易已提交但讀取逾時，重試只讀返同一批次',async()=>{
  const attempt=makeAttempt(),send=vi.fn(async()=>ack);
  const read=vi.fn().mockRejectedValueOnce(new Error('逾時')).mockResolvedValueOnce(saved);
  await expect(confirmBatch(attempt,send,read)).rejects.toThrow('逾時');
  await confirmBatch(attempt,send,read);
  expect(read.mock.calls).toEqual([['batch'],['batch']]);
  expect(send).toHaveBeenCalledTimes(1);
 });
});

describe('未確認交易重試後解鎖清單',()=>{
 it('重試獲確定拒絕（庫存不足、貨品已刪除或不存在、倉庫不存在）可返回編輯',()=>{
  for(const message of ['庫存不足：貨品甲','貨品已刪除：貨品甲','貨品不存在','倉庫不存在']){
   expect(canEditAfterBatchRejection({code:'P0001',message},true)).toBe(true);
  }
 });
 it('重試遇到未經交易查核嘅拒絕、識別碼衝突或連線錯誤，保留原交易識別碼',()=>{
  for(const [code,message] of [['42501','請登入'],['P0001','清單格式無效'],['P0001','交易識別碼已用於另一筆交易'],['23505','重複資料'],['','Failed to fetch']]){
   expect(canEditAfterBatchRejection({code,message},true)).toBe(false);
  }
  expect(canEditAfterBatchRejection({code:'P0001',message:'交易識別碼已用於另一筆交易'},false)).toBe(false);
  expect(canEditAfterBatchRejection({code:'P0001',message:'清單格式無效'},false)).toBe(true);
 });
});
