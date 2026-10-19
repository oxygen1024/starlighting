// Read-only deadlines: never automatically retry an inventory mutation.
export async function timedRead<T>(read:(signal:AbortSignal)=>PromiseLike<T>,ms=20000):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('連線等候逾時，請稍後重試。'));},ms);});
 try{return await Promise.race([Promise.resolve().then(()=>read(controller.signal)),deadline]);}finally{clearTimeout(timer!);}
}
// Calls while a read is running share one trailing refresh. Mutation callers
// therefore wait for a fresh snapshot, rather than a read started before their write.
export function refreshQueue(task:()=>Promise<void>){
 let running:Promise<void>|null=null,again=false,stopped=false;
 return {run(){if(stopped)return Promise.resolve();if(running){again=true;return running;}
 running=Promise.resolve().then(async()=>{do{again=false;await task();}while(again&&!stopped);}).finally(()=>{running=null;});return running;},stop(){stopped=true;again=false;}};
}
