// Bounded retry for read-only image downloads. Never re-upload or change references.
export async function downloadImage(read:(signal:AbortSignal)=>Promise<Blob>,signal:AbortSignal,timeout=15000):Promise<Blob>{
 let last:unknown;
 for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)throw new Error('圖片讀取已取消');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  let cancel!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{cancel=()=>{controller.abort();reject(new Error('圖片讀取已取消'));};signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{controller.abort();reject(new Error('圖片讀取逾時'));},timeout);});
  try{return await Promise.race([Promise.resolve().then(()=>read(controller.signal)),cancelled]);}
  catch(e){last=e;}finally{clearTimeout(timer!);signal.removeEventListener('abort',cancel);}
  if(signal.aborted)throw last;
  if(attempt<2)await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(t);reject(new Error('圖片讀取已取消'));};const t=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},500*(attempt+1));signal.addEventListener('abort',abort,{once:true});});
 }
 throw last;
}
export function imagePaths(images:{image_path:string;thumbnail_path:string}[],fullPath?:string){
 return [...new Set([...(fullPath?[fullPath]:[]),...images.map(p=>p.thumbnail_path)].filter(Boolean))];
}
