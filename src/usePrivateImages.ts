import {useEffect,useRef,useState} from 'react';
import {db} from './db';
export default function usePrivateImages(images:{image_path:string;thumbnail_path:string}[]){
 const [urls,setUrls]=useState<Record<string,string>>({});const cache=useRef(new Map<string,string>());
 const paths=[...new Set(images.flatMap(p=>[p.image_path,p.thumbnail_path]))].sort().join('\n');
 useEffect(()=>{let active=true;const queue=paths?paths.split('\n'):[];
 async function work(){for(;;){const path=queue.shift();if(!path||!active||!db)return;if(cache.current.has(path))continue;const r=await db.storage.from('product-images').download(path);if(!active)return;if(r.data){const url=URL.createObjectURL(r.data);cache.current.set(path,url);setUrls(Object.fromEntries(cache.current));}}}
 void Promise.all([work(),work(),work(),work()]);return()=>{active=false;};},[paths]);
 useEffect(()=>()=>{for(const url of cache.current.values())URL.revokeObjectURL(url);cache.current.clear();},[]);
 return urls;
}
