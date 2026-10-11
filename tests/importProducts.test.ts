import {it,expect} from 'vitest';
import {prepareImport} from '../src/importProducts';
it('只有名稱亦可匯入，空白行略過',()=>{const rows=prepareImport([['貨品名稱'],[' LED 筒燈 '],[],['燈帶']],{name:0,brand:-1,category:-1},true,[],['a','b','c']);expect(rows.map(r=>[r.id,r.row,r.name,r.brand,r.invalid])).toEqual([['a',2,'LED 筒燈','',false],['c',4,'燈帶','',false]]);});
it('可映射非第一欄及略過同名貨品',()=>{const rows=prepareImport([['品牌','名稱','類別'],['Svitac','筒燈','燈具'],['其他','筒燈','燈具'],['其他','LED','燈具']],{name:1,brand:0,category:2},true,['led'],['a','b','c']);expect(rows.map(r=>r.duplicate)).toEqual([false,true,true]);expect(rows[0].brand).toBe('Svitac');});
it('冇標題行時保留第一項；無效名稱不可匯入',()=>{const rows=prepareImport([['燈膽'],[new Date(),'品牌'],['x'.repeat(301)]],{name:0,brand:1,category:-1},false,[],['a','b','c']);expect(rows[0].row).toBe(1);expect(rows.map(r=>r.invalid)).toEqual([false,true,true]);});
