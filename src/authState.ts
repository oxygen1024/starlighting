export type Profile={username:string;role:string};
export type AuthView={userId:string|null;profile:Profile|null;checking:boolean;error:string};
export const initialAuth:AuthView={userId:null,profile:null,checking:true,error:''};
export function sessionView(state:AuthView,userId:string|null):AuthView{
 if(userId&&userId===state.userId)return state;
 return {userId,profile:null,checking:!!userId,error:''};
}
export function profileView(state:AuthView,userId:string,profile:Profile|null,error:{code?:string;status?:number}|null):AuthView{
 if(userId!==state.userId)return state;
 if(error){const denied=error.code==='42501'||error.code==='PGRST301'||error.code==='PGRST303'||error.status===401||error.status===403;
 return {...state,checking:false,profile:denied?null:state.profile,error:denied?'登入已失效或帳戶已停用，請重新登入。':'網絡暫時未能連接，正在等候重試；未提交清單會保留。'};}
 return {...state,checking:false,profile,error:''};
}
