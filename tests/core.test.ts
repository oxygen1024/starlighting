import{describe,it,expect}from'vitest';import{ScanGate,addLine,validQuantity,csv,matches,matchesText,UNSET_COLOR,Product}from'../src/core';
describe('連續掃描及清單',()=>{it('增加不同貨品及有意重掃',()=>{let c=addLine([],'a');c=addLine(c,'b');c=addLine(c,'a');expect(c).toEqual([{product_id:'a',quantity:2},{product_id:'b',quantity:1}]);expect(c.filter(l=>l.product_id!=='a')).toHaveLength(1);});it('鏡頭持續看到同碼不重複增加',()=>{const g=new ScanGate();expect(g.accept('a',0)).toBe(true);expect(g.accept('a',500)).toBe(false);expect(g.accept('a',1500)).toBe(false);expect(g.accept('a',3400)).toBe(true);expect(g.accept('b',3500)).toBe(true);g.reset();expect(g.accept('b',3501)).toBe(true);});it('拒絕零負數小數及無效數量',()=>{for(const n of [0,-1,1.5,NaN,Infinity,10000000])expect(validQuantity(n)).toBe(false);expect(validQuantity(35)).toBe(true);});});
it('CSV 支援中文及防止公式注入',()=>{expect(csv([['=1+1','a"b','燈']])).toBe('\uFEFF"\'=1+1","a""b","燈"');});
it('搜尋與規格合併篩選',()=>{const p={name:'LED 筒燈',sku:'ST-24',barcode:'123',category:'筒燈',wattage:'24W',color_temperature:'4000K'}as Product;expect(matches(p,'LED',{wattage:'24W',color_temperature:'4000K'})).toBe(true);expect(matches(p,'123',{wattage:'12W'})).toBe(false);});

describe('貨品名稱寬鬆搜尋',()=>{
 it('忽略空格、大小寫及全半形差異',()=>{
  for(const query of ['單So','單 so',' 單　ＳＯ ','單蘇'])expect(matchesText('單 So',query)).toBe(true);
  expect(matchesText('LED 筒燈 24W','led筒燈 ２４ｗ')).toBe(true);
 });
 it('中英文蘇字寫法互相匹配',()=>{
  expect(matchesText('單蘇','單 So')).toBe(true);
  expect(matchesText('雙 So 13A','雙蘇13A')).toBe(true);
  expect(matchesText('單 So','雙蘇')).toBe(false);
 });
 it('不將英文單字內的 so 當成蘇，保留普通部分搜尋',()=>{
  expect(matchesText('Sony','蘇')).toBe(false);
  expect(matchesText('Socket','蘇')).toBe(false);
  expect(matchesText('Sony','so')).toBe(true);
 });
 it('寬鬆名稱搜尋仍遵守規格篩選，保留條碼前置零',()=>{
  const p={name:'單 So',barcode:'00123',brand:'測試品牌'}as Product;
  expect(matches(p,'單蘇',{brand:'測試品牌'})).toBe(true);
  expect(matches(p,'單蘇',{brand:'其他品牌'})).toBe(false);
  expect(matches(p,'00123',{})).toBe(true);
  expect(matches(p,'單So00123',{})).toBe(false);
  expect(matches(p,'　 ',{})).toBe(true);
 });
});


describe('貨品管理顏色及關鍵字',()=>{
 const p={name:'KB 單 So 13A',barcode:'00123',brand:'Schneider',category:'燈掣',color:'白色',wattage:'24W',color_temperature:'4000K',specifications:'防水',location:'A1'}as Product;
 it('跨欄位搜尋及不限制關鍵字次序',()=>{
  for(const q of ['KB 白色','白色 kb','Schneider 單蘇','24W 燈掣','４０００Ｋ　防水','00123 A1'])expect(matches(p,q,{})).toBe(true);
  expect(matches(p,'KB 黑色',{})).toBe(false);
  expect(matches(p,'KB 12W',{})).toBe(false);
 });
 it('與品牌及顏色篩選同時生效',()=>{
  expect(matches(p,'單蘇',{brand:'Schneider',color:'白色'})).toBe(true);
  expect(matches(p,'單蘇',{color:'黑色'})).toBe(false);
  expect(matches(p,'KB',{color:UNSET_COLOR})).toBe(false);
 });
 it('未設定顏色按實際欄位判斷，即使名稱含有顏色',()=>{
  for(const color of [undefined,'','  '])expect(matches({...p,name:'白色燈掣',color},'',{color:UNSET_COLOR})).toBe(true);
  expect(matches({...p,color:'香檳金'},'',{color:'香檳金'})).toBe(true);
 });
});
