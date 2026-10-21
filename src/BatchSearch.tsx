import {useState} from 'react';
import {Plus,Search} from 'lucide-react';
import {matchesText,type Product} from './core';
// Only searches while a query is typed, so the batch page stays light with a large catalogue.
export default function BatchSearch({products,quantity,pending,onAdd}:{products:Product[];quantity:(id:string)=>number;pending:boolean;onAdd:(id:string)=>void}){
 const [query,setQuery]=useState('');
 const term=query.trim();
 const found=term?products.filter(p=>[p.name,p.barcode??'',p.brand,p.category,p.location].some(v=>matchesText(v,term))):[];
 return <section className="batch-search"><label className="search"><Search size={18}/><input autoFocus aria-label="搜尋要加入清單嘅貨品" placeholder="輸入貨品名稱、條碼、品牌或貨架" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {term&&<div className="batch-search-results">{found.slice(0,20).map(p=><div className="batch-search-row" key={p.id}><span><strong>{p.name}</strong><small>{[p.barcode||'未有條碼',p.location&&'貨架：'+p.location,'庫存：'+quantity(p.id)+' 件'].filter(Boolean).join(' · ')}</small></span><button disabled={pending} onClick={()=>onAdd(p.id)} aria-label={'加入清單：'+p.name}><Plus size={16}/>加入</button></div>)}
 {!found.length&&<p className="empty">搵唔到符合嘅貨品，請試其他字眼。</p>}
 {found.length>20&&<p className="muted">共 {found.length} 款，只顯示頭 20 款，請輸入更多字收窄搜尋。</p>}</div>}</section>;
}
