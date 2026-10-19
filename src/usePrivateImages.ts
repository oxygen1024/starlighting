import {useCallback,useEffect,useRef,useState} from 'react';
import {db} from './db';
import {downloadImage,imagePaths} from './imageDownload';
export default function usePrivateImages(images:{image_path:string;thumbnail_path:string}[],fullPath?:string){
 const [urls,setUrls]=useState<Record<string,string>>({}),[failed,setFailed]=useState<Record<string,boolean>>({}),[retryKey,setRetryKey]=useState(0);
 const cache=useRef(new Map<string,string>()),failures=useRef(new Set<string>());
 const paths=imagePaths(images,fullPath).join('\n');
 const retry=useCallback(()=>setRetryKey(k=>k+1),[]);
 const broken=useCallback((path:string)=>{const url=cache.current.get(path);if(url)URL.revokeObjectURL(url);cache.current.delete(path);failures.current.add(path);setUrls(Object.fromEntries(cache.current));setFailed(Object.fromEntries([...failures.current].map(p=>[p,true])));},[]);
 useEffect(()=>{const controller=new AbortController();const queue=paths?paths.split('\n'):[];const wanted=new Set(queue);
  for(const [path,url] of cache.current)if(!wanted.has(path)){URL.revokeObjectURL(url);cache.current.delete(path);}
  failures.current.clear();setFailed({});setUrls(Object.fromEntries(cache.current));
  async function work(){for(;;){const path=queue.shift();if(!path||controller.signal.aborted||!db)return;if(cache.current.has(path))continue;
   try{const blob=await downloadImage(async signal=>{const r=await db!.storage.from('product-images').download(path,{}, {signal,cache:'no-store'});if(r.error)throw r.error;if(!r.data||!r.data.size)throw new Error('圖片內容為空');return r.data;},controller.signal);
    if(controller.signal.aborted)return;cache.current.set(path,URL.createObjectURL(blob));setUrls(Object.fromEntries(cache.current));
   }catch{if(controller.signal.aborted)return;failures.current.add(path);setFailed(Object.fromEntries([...failures.current].map(p=>[p,true])));}
  }}
  void Promise.all([work(),work(),work()]);return()=>controller.abort();
 },[paths,retryKey]);
 useEffect(()=>{const recover=()=>{if(failures.current.size&&document.visibilityState==='visible'&&navigator.onLine)retry();};window.addEventListener('online',recover);document.addEventListener('visibilitychange',recover);return()=>{window.removeEventListener('online',recover);document.removeEventListener('visibilitychange',recover);};},[retry]);
 useEffect(()=>()=>{for(const url of cache.current.values())URL.revokeObjectURL(url);cache.current.clear();},[]);
 return {urls,failed,retry,broken};
}
