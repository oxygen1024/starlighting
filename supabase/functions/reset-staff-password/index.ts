const cors={"Access-Control-Allow-Origin":"https://oxygen1024.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'不支援此操作'},405);
 const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'請先登入'},401);
 try{
 const headers={apikey:service,Authorization:authorization,'Content-Type':'application/json'};
 const u=await fetch(url+'/auth/v1/user',{headers});if(!u.ok)return reply({error:'請重新登入'},401);
 const text=await req.text();if(text.length>2048)return reply({error:'資料過長'},400);const body=JSON.parse(text);
 if(typeof body.target!=='string'||! /^[0-9a-f-]{36}$/i.test(body.target))return reply({error:'員工帳戶無效'},400);
 if(typeof body.password!=='string'||body.password.length<6||body.password.length>72)return reply({error:'密碼須為 6 至 72 個字元'},400);
 const check=await fetch(url+'/rest/v1/rpc/staff_management_target',{method:'POST',headers,body:JSON.stringify({p_target:body.target})});if(!check.ok)return reply({error:'只限老細管理普通員工帳戶'},403);const target=await check.json();
 const r=await fetch(url+'/auth/v1/admin/users/'+target,{method:'PUT',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({password:body.password})});
 if(!r.ok)return reply({error:'未能確認密碼更新，請核對密碼要求後重試。'},503);
 const revoked=await fetch(url+'/rest/v1/rpc/revoke_staff_sessions',{method:'POST',headers,body:JSON.stringify({p_target:target})});
 if(!revoked.ok)return reply({error:'密碼已更新，但登出舊裝置未確認，請重試。'},503);
 return reply({success:true});
 }catch{return reply({error:'結果未確認，請重試同一新密碼。'},503);}
});
