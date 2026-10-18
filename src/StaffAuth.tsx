import {useEffect,useState,type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {db} from './db';
export function loginEmail(name:string){const clean=name.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(clean))throw new Error('請輸入有效登入名稱（英文字母、數字、點、底線或連字號）。');return clean+'@login.starlighting.invalid';}
export default function StaffAuth({children}:{children:(name:string)=>ReactNode}){
 const [session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[name,setName]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!db){setChecking(false);setError('資料庫未設定，請聯絡管理員。');return;}let alive=true,version=0;
 async function verify(s:Session|null){const v=++version;setSession(s);setName('');setChecking(Boolean(s));if(!s){sessionStorage.removeItem('starlighting-cost-unlock');return;}const r=await db!.rpc('staff_session');if(!alive||v!==version)return;setChecking(false);if(r.error){setError('登入已失效或帳戶未獲授權，請重新登入。');}else{setName(r.data);setError('');}}
 // Keep auth callbacks synchronous; verification runs outside the auth lock.
 const {data:{subscription}}=db.auth.onAuthStateChange((event,s)=>{if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){if(alive)setSession(s);return;}if(alive)setTimeout(()=>{if(alive)void verify(s);},0);});
 void db.auth.getSession().then(({data,error})=>{if(!alive)return;if(error){setError('未能恢復登入，請重新登入。');setChecking(false);}else void verify(data.session);});
 const timer=setInterval(()=>{void db!.auth.getSession().then(({data})=>{if(alive&&data.session)void db!.rpc('staff_session').then(r=>{if(alive&&r.error){setName('');setError('帳戶權限已變更，請重新登入。');}});});},30000);
 return()=>{alive=false;subscription.unsubscribe();clearInterval(timer);};},[]);
 if(checking)return <main className="login-page"><div className="panel" role="status">正在確認登入…</div></main>;
 if(session&&name)return <>{children(name)}</>;
 return <LoginForm error={error} onError={setError}/>;
}
function LoginForm({error,onError}:{error:string;onError:(s:string)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 return <main className="login-page"><form className="panel login-card" onSubmit={async e=>{e.preventDefault();if(!db||busy)return;setBusy(true);onError('');try{const r=await db.auth.signInWithPassword({email:loginEmail(username),password});if(r.error)throw r.error;setPassword('');}catch(e){onError((e as {status?:number}).status===429?'嘗試次數太多，請稍後再試。':'登入未成功，請核對帳戶名稱及密碼，並確認網絡連線。');}finally{setBusy(false);}}}><p className="eyebrow">STAR LIGHTING</p><h1>星光照明倉存管理</h1><p>請登入後繼續。</p><label>登入名稱<input autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label><label>密碼<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="danger">{error}</p>}<button className="primary" disabled={busy||!db}>{busy?'登入中…':'登入'}</button><small>忘記登入名稱或密碼？請聯絡管理員。</small></form></main>;
}
export function AccountSettings({username}:{username:string}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="panel"><h2>登入帳戶</h2><p>登入名稱：{username}</p><form onSubmit={async e=>{e.preventDefault();if(!db||busy)return;if(password!==confirm){setMessage('兩次密碼不一致。');return;}setBusy(true);setMessage('');const r=await db.auth.updateUser({password});setBusy(false);if(r.error)setMessage('未能更改密碼，請使用至少 6 個字元，或重新登入後再試。');else{setPassword('');setConfirm('');setMessage('登入密碼已更改。');}}}><label>新登入密碼（最少 6 個字元）<input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>再次輸入新密碼<input required minLength={6} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button disabled={busy}>更改登入密碼</button>{message&&<p role="status">{message}</p>}</form></section>;
}
