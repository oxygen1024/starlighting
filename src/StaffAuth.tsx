import {useEffect,useState,useRef,type ReactNode} from 'react';
import {initialAuth,sessionView,profileView} from './authState';
import {timedRead,refreshQueue} from './readRequests';
import {db} from './db';
export function loginEmail(name:string){const clean=name.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(clean))throw new Error('請輸入有效登入名稱（英文字母、數字、點、底線或連字號）。');return clean+'@login.starlighting.invalid';}
export default function StaffAuth({children}:{children:(name:string,role:string)=>ReactNode}){
 const [view,setView]=useState(initialAuth),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!db){setView({...initialAuth,checking:false,error:'資料庫未設定，請聯絡管理員。'});return;}
 let alive=true,userId:string|null=null,generation=0,eventVersion=0;
 const checks=refreshQueue(async()=>{
  const id=userId,v=generation;if(!id)return;
  try{const r=await timedRead(signal=>db!.rpc('staff_profile').abortSignal(signal));
   if(alive&&v===generation)setView(old=>profileView(old,id,r.data,r.error?{...r.error,status:r.status}:null));
  }catch{if(alive&&v===generation)setView(old=>profileView(old,id,null,{}));}
 });
 function accept(id:string|null){if(!alive)return;if(id!==userId){userId=id;generation++;}setView(old=>sessionView(old,id));
  if(!id){setView(old=>({...old,checking:false}));sessionStorage.removeItem('starlighting-cost-unlock');}
  else void checks.run();
 }
 // Supabase can emit SIGNED_IN again on focus. Preserve the same user's tree.
 // Defer network work outside the auth callback/lock.
 const {data:{subscription}}=db.auth.onAuthStateChange((_event,s)=>{const v=++eventVersion;setTimeout(()=>{if(alive&&v===eventVersion)accept(s?.user.id??null);},0);});
 const bootVersion=eventVersion;
 void timedRead(()=>db!.auth.getSession()).then(({data,error})=>{if(!alive||bootVersion!==eventVersion)return;if(error)throw error;accept(data.session?.user.id??null);}).catch(()=>{if(alive&&bootVersion===eventVersion)setView(old=>({...old,checking:false,error:'未能連接登入服務，請重試。'}));});
 const poll=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void checks.run();};
 const timer=setInterval(poll,30000);window.addEventListener('online',poll);document.addEventListener('visibilitychange',poll);
 return()=>{alive=false;generation++;checks.stop();subscription.unsubscribe();clearInterval(timer);window.removeEventListener('online',poll);document.removeEventListener('visibilitychange',poll);};
 },[retry]);
 if(view.checking&&!view.profile)return <main className="login-page"><div className="panel" role="status">正在確認登入…</div></main>;
 // Stable fragment/child positions preserve App state across a transient error.
 return <>{view.profile?<>{view.error&&<p className="notice" role="status">{view.error}</p>}{children(view.profile.username,view.profile.role)}</>:<><LoginForm error={view.error} onError={error=>setView(old=>({...old,error}))}/>{view.error&&<button onClick={()=>setRetry(x=>x+1)}>重新檢查連線</button>}</>}</>;
}

function LoginForm({error,onError}:{error:string;onError:(s:string)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 return <main className="login-page"><form className="panel login-card" onSubmit={async e=>{e.preventDefault();if(!db||busy)return;setBusy(true);onError('');try{const r=await db.auth.signInWithPassword({email:loginEmail(username),password});if(r.error)throw r.error;setPassword('');}catch(e){onError((e as {status?:number}).status===429?'嘗試次數太多，請稍後再試。':'登入未成功，請核對帳戶名稱及密碼，並確認網絡連線。');}finally{setBusy(false);}}}><p className="eyebrow">STAR LIGHTING</p><h1>星光照明倉存管理</h1><p>請登入後繼續。</p><label>登入名稱<input autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label><label>密碼<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="danger">{error}</p>}<button className="primary" disabled={busy||!db}>{busy?'登入中…':'登入'}</button><small>忘記登入名稱或密碼？請聯絡管理員。</small></form></main>;
}
export function AccountSettings({username}:{username:string}){
 const [loginName,setLoginName]=useState(username);const nameGuard=useRef(false);
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="panel"><h2>登入帳戶</h2><p>登入名稱：{username}</p><form onSubmit={async e=>{e.preventDefault();if(!db||nameGuard.current)return;nameGuard.current=true;setBusy(true);setMessage('');try{loginEmail(loginName);const r=await db.functions.invoke('change-login-name',{body:{username:loginName}});if(r.error){let text='結果未確認，請重試同一名稱。';const response=(r.error as {context?:Response}).context;if(response instanceof Response)text=(await response.json().catch(()=>null))?.error||text;throw new Error(text);}setMessage('登入名稱已更改為 '+r.data.username+'，下次請用新名稱登入。密碼不變。');await db.auth.refreshSession();}catch(e){setMessage((e as Error).message);}finally{nameGuard.current=false;setBusy(false);}}}><label>新登入名稱<input autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} required disabled={busy} value={loginName} onChange={e=>setLoginName(e.target.value)}/></label><p className="muted">更改後請用新名稱登入；舊操作紀錄保留當時名稱。</p><button disabled={busy||loginName.trim().toLowerCase()===username}>更改登入名稱</button></form><form onSubmit={async e=>{e.preventDefault();if(!db||busy)return;if(password!==confirm){setMessage('兩次密碼不一致。');return;}setBusy(true);setMessage('');const r=await db.auth.updateUser({password});setBusy(false);if(r.error)setMessage('未能更改密碼，請使用至少 6 個字元，或重新登入後再試。');else{setPassword('');setConfirm('');setMessage('登入密碼已更改。');}}}><label>新登入密碼（最少 6 個字元）<input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>再次輸入新密碼<input required minLength={6} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button disabled={busy}>更改登入密碼</button>{message&&<p role="status">{message}</p>}</form></section>;
}
