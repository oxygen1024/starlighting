import React,{useState} from 'react';
import {ScanLine} from 'lucide-react';
import type {Product} from './core';
const Scanner=React.lazy(()=>import('./Scanner'));
const defaults:Record<string,string[]>={brand:['Svitac'],category:['LED 筒燈','LED 射燈','路軌燈','燈帶','燈膽','燈頭','火牛／驅動器','吸頂燈','戶外燈','配件'],wattage:[],color_temperature:['2700K','3000K','4000K','6500K']};
function Choice({name,label,value,products}:{name:string;label:string;value:string;products:Product[]}){
 const options=[...new Set([...(defaults[name]??[]),...products.map(p=>String(p[name as keyof Product]??'')),value])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-HK'));
 const [custom,setCustom]=useState(false);
 return <label>{label}{custom?<><input name={name} aria-label={'新增'+label} placeholder={'輸入新'+label} autoFocus/><button type="button" onClick={()=>setCustom(false)}>返回選擇</button></>:<select name={name} defaultValue={value} onChange={e=>{if(e.target.value==='__new__')setCustom(true);}}><option value="">請選擇{label}</option>{options.map(v=><option key={v} value={v}>{v}</option>)}<option value="__new__">＋ 新增{label}</option></select>}</label>;
}
export default function ProductForm({product,products,busy,error,onSave}:{product:Product|null;products:Product[];busy:boolean;error:string;onSave:(e:React.FormEvent<HTMLFormElement>)=>void}){
 const [barcode,setBarcode]=useState(product?.barcode??'');const [scanning,setScanning]=useState(false);const [message,setMessage]=useState('');
 const duplicate=products.find(p=>p.barcode===barcode.trim()&&p.id!==product?.id);
 return <form onSubmit={e=>{if(duplicate){e.preventDefault();return;}onSave(e);}} className="form-grid">
 <section className="span2 barcode-create"><h3>1. 掃描貨品條碼</h3><p className="muted">掃描包裝上嘅條碼，自動填入。之後揀品牌、種類及填寫貨品資料。</p><button type="button" disabled={busy} onClick={()=>{setMessage('');setScanning(s=>!s);}}><ScanLine size={18}/>{scanning?'停止掃描':'開啟相機掃描條碼'}</button>
 {scanning&&<React.Suspense fallback={<p>正在開啟掃描器…</p>}><Scanner onClose={()=>setScanning(false)} onScan={code=>{setBarcode(code.trim());setScanning(false);setMessage('已填入條碼，請繼續選擇品牌同種類。');}}/></React.Suspense>}
 <label>條碼<input name="barcode" value={barcode} onChange={e=>{setBarcode(e.target.value);setMessage('');}} placeholder="掃描後自動填入，亦可手動輸入"/></label>{duplicate?<p role="alert" className="danger">呢個條碼已用於「{duplicate.name}」，請到貨品管理開啟現有貨品。</p>:message&&<p role="status">{message}</p>}</section>
 <h3 className="span2">2. 選擇品牌、種類及填寫資料</h3>
 <Choice name="brand" label="品牌" value={product?.brand??''} products={products}/><Choice name="category" label="種類" value={product?.category??''} products={products}/>
 {[['name','貨品名稱'],['location','貨架位置'],['selling_price','售價'],['low_stock','低庫存提示數量']].map(([k,label])=><label key={k}>{label}<input name={k} disabled={busy} required={k!=='location'} type={['selling_price','low_stock'].includes(k)?'number':'text'} min="0" step={k==='low_stock'?'1':'0.01'} defaultValue={product?.[k as keyof Product]??(['selling_price'].includes(k)?0:k==='low_stock'?5:'')}/></label>)}
 <Choice name="wattage" label="功率" value={product?.wattage??''} products={products}/><Choice name="color_temperature" label="色溫" value={product?.color_temperature??''} products={products}/>
 <label className="span2">其他規格<textarea name="specifications" defaultValue={product?.specifications}/></label>{error&&<p role="alert" className="danger span2">{error}</p>}<button className="primary span2" disabled={busy||Boolean(duplicate)}>{busy?'儲存中…':'儲存貨品'}</button></form>;
}
