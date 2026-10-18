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
 const u=await fetch(url+'/auth/v1/user',{headers});if(!u.ok)return reply({error:'請重新登入'},401);const user=await u.json();
 const p=await fetch(url+'/rest/v1/rpc/staff_profile',{method:'POST',headers,body:'{}'});if(!p.ok)return reply({error:'帳戶未獲授權'},403);
 const text=await req.text();if(text.length>1024)return reply({error:'資料過長'},400);const body=JSON.parse(text),username=String(body.username||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))return reply({error:'登入名稱須為 3 至 40 個英文字母、數字、點、底線或連字號'},400);
 // user.id is from verified Auth response, never from request body.
 const r=await fetch(url+'/auth/v1/admin/users/'+user.id,{method:'PUT',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email:username+'@login.starlighting.invalid',email_confirm:true})});
 if(!r.ok)return reply({error:'未能更改名稱，名稱可能已被使用。請核對後重試。'},409);
 return reply({username});
 }catch{return reply({error:'結果未確認，請重試同一名稱。'},503);}
});
