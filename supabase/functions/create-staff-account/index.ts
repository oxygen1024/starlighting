const cors={"Access-Control-Allow-Origin":"https://oxygen1024.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'不支援此操作'},405);
 const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'請先登入'},401);
 try{
 const userHeaders={apikey:service,Authorization:authorization,'Content-Type':'application/json'};
 const u=await fetch(url+'/auth/v1/user',{headers:userHeaders});if(!u.ok)return reply({error:'請重新登入'},401);const user=await u.json();
 const p=await fetch(url+'/rest/v1/rpc/staff_profile',{method:'POST',headers:userHeaders,body:'{}'});if(!p.ok)return reply({error:'帳戶未獲授權'},403);const profile=await p.json();if(profile.role!=='boss')return reply({error:'只有老細帳戶可以新增帳戶'},403);
 const text=await req.text();if(text.length>4096)return reply({error:'資料過長'},400);const body=JSON.parse(text);
 const username=String(body.username||'').trim().toLowerCase(),password=body.password,request=body.request;
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))return reply({error:'登入名稱須為 3 至 40 個英文字母、數字、點、底線或連字號'},400);
 if(typeof password!=='string'||password.length<6||password.length>72)return reply({error:'密碼須為 6 至 72 個字元'},400);
 if(typeof request!=='string'||! /^[0-9a-f-]{36}$/i.test(request))return reply({error:'缺少操作識別碼'},400);
 // The JWT has already been verified by Auth /user; decode only to pass its session ID.
 const payload=JSON.parse(atob(authorization.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const params={p_actor:user.id,p_session:payload.session_id,p_username:username,p_request:request};
 async function complete(){return fetch(url+'/rest/v1/rpc/complete_staff_account',{method:'POST',headers,body:JSON.stringify(params)});}
 let r=await complete();if(!r.ok)return reply({error:'未能確認管理權限，請重新登入'},403);if(await r.json())return reply({username});
 r=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email:username+'@login.starlighting.invalid',password,email_confirm:true,app_metadata:{inventory_created_by:user.id,inventory_request:request}})});
 if(!r.ok){const again=await complete();if(again.ok&&await again.json())return reply({username});return reply({error:'未能新增：名稱可能已使用，或密碼不符合要求。'},409);}
 const finished=await complete();if(!finished.ok||!await finished.json())return reply({error:'帳戶尚未完成啟用，請按安全重試。'},503);
 return reply({username});
 }catch{return reply({error:'未能確認結果，請按安全重試。'},503);}
});
