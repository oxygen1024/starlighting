import {useRef,useState} from 'react';
import {db} from './db';
import type {Product} from './core';
import {type StockRow,type WarehouseRow,downloadCsv,hkDay} from './warehouse';
import {restockGroups,restockText} from './restock';
type Props={products:Product[];inventory:StockRow[];warehouses:WarehouseRow[];refresh:()=>Promise<void>;onDetail:(p:Product)=>void};
export default function Restock({products,inventory,warehouses,refresh,onDetail}:Props){
 const [warehouse,setWarehouse]=useState(''),[category,setCategory]=useState(''),[query,setQuery]=useState('');
 const [target,setTarget]=useState(''),[threshold,setThreshold]=useState('5'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copyText,setCopyText]=useState('');
 const guard=useRef(false);
 const categories=[...new Set(products.map(p=>p.category||'未分類'))].sort((a,b)=>a.localeCompare(b,'zh-HK'));
 const groups=restockGroups(products,inventory,warehouse,query,category),count=groups.reduce((n,g)=>n+g.items.length,0);
 const whName=warehouses.find(w=>w.id===warehouse)?.name??'全部倉庫合計';
 async function save(){
  if(!db||guard.current)return;
  const value=Number(threshold),items=products.filter(p=>(p.category||'未分類')===target);
  if(!target||!threshold.trim()||!Number.isSafeInteger(value)||value<0||value>9999999){setMessage('請選擇種類，並輸入 0 至 9,999,999 嘅整數。');return;}
  if(!confirm(`將「${target}」現有 ${items.length} 款貨品嘅補貨門檻設為 ${value} 件？個別貨品原有門檻會被取代。`))return;
  guard.current=true;setBusy(true);setMessage('');
  try{
   let request=db.from('products').update({low_stock:value},{count:'exact'}).is('archived_at',null);
   request=target==='未分類'?request.eq('category',''):request.eq('category',target);
   const {error,count}=await request;
   if(error)throw error;
   if(!count)throw new Error('未有貨品更新，請重新整理再試');
   await refresh();setMessage(`已儲存 ${count} 款貨品嘅門檻，其他裝置會同步。`);
  }catch(e){setMessage('未能確認儲存，請重新整理核對：'+(e as Error).message);}finally{guard.current=false;setBusy(false);}
 }
 async function copy(){const text=restockText(groups,whName);try{await navigator.clipboard.writeText(text);setMessage('已複製補貨清單，可以貼畀 Muse 整理。');}catch{setCopyText(text);setMessage('請長按下面清單，全選並複製。');}}
 return <section className="restock-page"><h2>補貨清單</h2><p>按種類集中睇需要補貨嘅貨品。數量<strong>少過</strong>門檻先會列出；等於門檻唔會列出，門檻設為 0 即停用提示。</p>
 <details className="panel"><summary>設定補貨門檻</summary><p>按種類套用至現有貨品；新貨品請喺新增時設定。個別門檻可喺貨品詳情「編輯貨品詳情」修改。門檻各倉共用。</p><div className="filters"><label>貨品種類<select value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">選擇種類</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>少過幾多件需要補貨<input type="number" inputMode="numeric" min="0" max="9999999" step="1" value={threshold} disabled={busy} onChange={e=>setThreshold(e.target.value)}/></label><button disabled={busy||!target} onClick={save}>{busy?'儲存中…':'儲存此種類門檻'}</button></div></details>
 <div className="filters"><input type="search" enterKeyHint="search" aria-label="搜尋補貨貨品" placeholder="名稱、品牌或顏色關鍵字" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="補貨種類" value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部種類</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select aria-label="補貨倉庫" value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">全部倉庫合計</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
 <div className="section-title"><strong>{whName} · {count} 款需要補貨</strong><div className="chips"><button disabled={!count} onClick={copy}>複製清單畀 Muse</button><button disabled={!count} onClick={()=>downloadCsv([['種類','貨品名稱','品牌','顏色','條碼','現有數量','補貨門檻','補至門檻數量','倉庫範圍'],...groups.flatMap(g=>g.items.map(({product:p,quantity,shortfall})=>[g.category,p.name,p.brand,p.color??'',p.barcode??'',quantity,p.low_stock,shortfall,whName]))],'補貨清單-'+hkDay()+'.csv')}>匯出 Excel 用 CSV</button></div></div>
 {message&&<p role="status">{message}</p>}{copyText&&<label>手動複製清單<textarea readOnly value={copyText} onFocus={e=>e.target.select()}/></label>}
 {groups.map(g=><section className="panel" key={g.category}><h3>{g.category} · {g.items.length} 款</h3>{g.items.map(({product:p,quantity,shortfall})=><button className="restock-row" key={p.id} onClick={()=>onDetail(p)}><strong>{p.name}</strong><span>現有 {quantity} 件 · 門檻 {p.low_stock} 件</span><b>補至門檻：{shortfall} 件</b></button>)}</section>)}{!count&&<p className="empty panel">目前範圍冇貨品低過補貨門檻。</p>}
 </section>;
}
