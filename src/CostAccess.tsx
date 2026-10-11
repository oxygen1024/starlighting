import {useCallback,useEffect,useRef,useState} from 'react';
import {db} from './db';
import {matchesText,type Product} from './core';
const money=(n:number)=>new Intl.NumberFormat('zh-HK',{style:'currency',currency:'HKD'}).format(n);
type Session={token:string;expires_at:string};
type Cost={product_id:string;purchase_price:number};
type CostHistory={id:string;before_price:number|null;after_price:number;created_at:string;source:string};
export function useCostAccess(){
 const [session,setSession]=useState<Session|null>(null),[costs,setCosts]=useState<Record<string,number>>({}),[error,setError]=useState(''),[open,setOpen]=useState(false),[ready,setReady]=useState(false);
 const active=useRef<Session|null>(null),request=useRef(0);
 const lock=useCallback(()=>{const old=active.current;active.current=null;request.current++;setSession(null);setCosts({});setReady(false);if(old&&db)void db.rpc('lock_product_costs',{p_token:old.token});},[]);
 const refresh=useCallback(async()=>{
  const current=active.current;if(!db||!current)return;
  if(Date.parse(current.expires_at)<=Date.now()){lock();return;}
  const version=++request.current;
  try{
   const values:Record<string,number>={};
   for(let offset=0;;offset+=1000){
    const {data,error:failure}=await db.rpc('read_product_costs',{p_token:current.token,p_offset:offset});
    if(failure)throw failure;
    for(const c of data as Cost[])values[c.product_id]=Number(c.purchase_price);
    if(data.length<1000)break;
   }
   if(active.current===current&&request.current===version){setCosts(values);setReady(true);setError('');}
  }catch(e){if(active.current===current&&request.current===version){lock();setError('成本已鎖定：'+(e as Error).message);}}
 },[lock]);
 async function unlock(password:string){
  if(!db)throw new Error('資料庫未連接');
  const {data,error:failure}=await db.rpc('unlock_product_costs',{p_password:password});
  if(failure)throw failure;if(data.error)throw new Error(data.error);
  active.current=data;if(document.visibilityState!=='visible'){lock();throw new Error('已離開分頁，請重新解鎖');}setSession(data);setError('');await refresh();
 }
 useEffect(()=>{
  if(!session||!db)return;
  const expiry=setTimeout(lock,Math.max(0,Date.parse(session.expires_at)-Date.now()));
  const poll=setInterval(refresh,30000);
  const channel=db.channel('cost-access-revision').on('postgres_changes',{event:'UPDATE',schema:'public',table:'cost_revision'},()=>{void refresh();}).subscribe();
  const focus=()=>{void refresh();};const hide=()=>{if(document.visibilityState==='hidden')lock();};
  window.addEventListener('focus',focus);window.addEventListener('pagehide',lock);document.addEventListener('visibilitychange',hide);
  return()=>{clearTimeout(expiry);clearInterval(poll);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',lock);document.removeEventListener('visibilitychange',hide);void db!.removeChannel(channel);};
 },[session,refresh,lock]);
 return {session,costs,error,setError,open,setOpen,ready,lock,refresh,unlock};
}
type Access=ReturnType<typeof useCostAccess>;
export default function CostAccess({access,products}:{access:Access;products:Product[]}){
 const [password,setPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[repeat,setRepeat]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const guard=useRef(false);
 async function act(action:()=>Promise<void>){if(guard.current)return;guard.current=true;setBusy(true);access.setError('');setMessage('');try{await action();}catch(e){access.setError((e as Error).message);}finally{setBusy(false);guard.current=false;}}
 useEffect(()=>{if(!access.session){setPassword('');setNewPassword('');setRepeat('');}},[access.session]);
 if(!access.session)return <form onSubmit={e=>{e.preventDefault();const value=password;setPassword('');void act(()=>access.unlock(value));}} className="cost-unlock"><p>輸入成本密碼，查看入貨單價、庫存成本及成本修改紀錄。毋須登入帳戶。</p><label>成本密碼<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>{access.error&&<p role="alert" className="danger">{access.error}</p>}{message&&<p role="status">{message}</p>}<button className="primary" disabled={busy}>{busy?'驗證中…':'解鎖成本資料'}</button><p className="muted">最多解鎖 15 分鐘；離開分頁或切換應用程式會自動鎖定。</p></form>;
 return <section className="cost-access"><div className="row"><p>已解鎖至 {new Date(access.session.expires_at).toLocaleTimeString('zh-HK',{timeZone:'Asia/Hong_Kong'})}</p><button onClick={access.lock}>立即鎖定</button></div><p className="muted">離開分頁會自動鎖定。新增貨品嘅入貨單價預設為 0，可喺此修改。</p>{access.error&&<p role="alert" className="danger">{access.error}</p>}{message&&<p role="status">{message}</p>}<div className="filters"><input aria-label="搜尋成本貨品" placeholder="搜尋貨品名稱或條碼" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>void access.refresh()}>重新整理成本</button></div>{!access.ready?<p role="status">載入成本中…</p>:<div className="cost-products">{products.filter(p=>matchesText(p.name,query)||matchesText(p.barcode??'',query)).map(p=><CostRow key={p.id} product={p} price={access.costs[p.id]} access={access}/>)}</div>}<details className="cost-password"><summary>更改成本密碼</summary><form onSubmit={e=>{e.preventDefault();if(newPassword!==repeat){access.setError('兩次密碼不一致');return;}void act(async()=>{if(!db)return;const {error}=await db.rpc('change_cost_password',{p_token:access.session!.token,p_password:newPassword});if(error)throw error;access.lock();setMessage('密碼已更改，所有裝置需要重新解鎖。');});}}><label>新密碼（最少 12 個字元）<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>再次輸入新密碼<input type="password" autoComplete="new-password" minLength={12} required value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><button disabled={busy}>{busy?'儲存中…':'更改密碼並鎖定所有裝置'}</button></form></details></section>;
}
function CostRow({product,price,access}:{product:Product;price:number|undefined;access:Access}){
 const [editing,setEditing]=useState(false),[value,setValue]=useState(''),[expected,setExpected]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState<CostHistory[]|null>(null),[offset,setOffset]=useState(0);
 const guard=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function loadHistory(next:number){if(!db||!access.session||guard.current)return;guard.current=true;setBusy(true);setError('');try{const r=await db.rpc('read_cost_history',{p_token:access.session.token,p_product:product.id,p_offset:next});if(r.error)throw r.error;if(mounted.current){setHistory(r.data);setOffset(next);}}catch(e){if(mounted.current){if((e as {code?:string}).code==='42501')access.lock();else setError((e as Error).message);}}finally{guard.current=false;if(mounted.current)setBusy(false);}}
 return <article className="cost-row"><div className="row"><div><strong>{product.name}</strong><small>{product.barcode||'未有條碼'}</small></div><strong>{price===undefined?'未載入':money(price)}</strong></div><div className="chips"><button disabled={busy||price===undefined} onClick={()=>{setExpected(price!);setValue(String(price));setEditing(true);setError('');}}>修改入貨單價</button><button disabled={busy} onClick={()=>{if(history)setHistory(null);else void loadHistory(0);}}>{history?'收起成本紀錄':'查看成本紀錄'}</button></div>{editing&&<form onSubmit={async e=>{e.preventDefault();if(!db||!access.session||guard.current)return;guard.current=true;setBusy(true);setError('');try{const r=await db.rpc('update_product_cost',{p_token:access.session.token,p_product:product.id,p_price:Number(value),p_expected:expected});if(r.error)throw r.error;if(mounted.current){setEditing(false);setHistory(null);}await access.refresh();}catch(e){if(mounted.current){if((e as {code?:string}).code==='42501')access.lock();else setError((e as Error).message);}}finally{guard.current=false;if(mounted.current)setBusy(false);}}}><label>入貨單價（港元）<input type="number" min="0" max="9999999999.99" step="0.01" required value={value} onChange={e=>setValue(e.target.value)}/></label><button className="primary" disabled={busy}>儲存單價</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>取消</button></form>}{error&&<p role="alert" className="danger">{error}</p>}{history&&<div className="cost-history">{history.map(h=><p key={h.id}><small>{new Date(h.created_at).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'})}</small>{h.before_price===null?'建立／快照':money(h.before_price)+' → '} {money(h.after_price)}</p>)}{!history.length&&<p>暫時冇成本紀錄</p>}<div className="chips"><button disabled={!offset||busy} onClick={()=>void loadHistory(offset-50)}>上一頁</button><button disabled={history.length<50||busy} onClick={()=>void loadHistory(offset+50)}>下一頁</button></div></div>}</article>;
}
