import {describe,it,expect} from 'vitest';
import {stageProduct,canChangeOperation,validateReceipt} from '../src/transactionSafety';
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
describe('完成明細',()=>{
 const request={key:'key',type:'out',wh:'warehouse',items:[{product_id:'first',quantity:12},{product_id:'second',quantity:7}],remarks:''};
 const products=[{id:'first',name:'測試貨品甲'},{id:'second',name:'測試貨品乙'}]as Product[];
 it('完成畫面使用實際提交清單，各貨品數量逐項列出',()=>{
  const receipt=validateReceipt({id:'batch',batch_reference:'SL-test'},request,products,[{id:'warehouse',name:'測試倉'}]);
  expect(receipt.items.map(l=>[l.name,l.quantity])).toEqual([['測試貨品甲',12],['測試貨品乙',7]]);
  expect(receipt.warehouse).toBe('測試倉');
  request.items[0].quantity=99;
  expect(receipt.items[0].quantity).toBe(12);
  request.items[0].quantity=12;
 });
 it('空白或格式錯誤回應不可被當成交易完成',()=>{
  for(const data of [null,{}, {id:'batch'}, {id:'batch',batch_reference:42}])expect(()=>validateReceipt(data,request,products,[])).toThrow('未收到有效交易確認');
  expect(request.key).toBe('key');
 });
});
