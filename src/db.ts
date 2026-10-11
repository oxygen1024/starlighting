import {createClient} from '@supabase/supabase-js';
import publicConfig from './public-config.json';
const env=import.meta.env;
const url=env.VITE_SUPABASE_URL || publicConfig.url;
const key=env.VITE_SUPABASE_ANON_KEY || publicConfig.publishableKey;
export const configured=Boolean(url&&key);
export const db=configured?createClient(url,key):null;
export function imageUrl(path?:string){return path&&db?db.storage.from('product-images').getPublicUrl(path).data.publicUrl:undefined;}
export async function compress(file:File,max:number):Promise<Blob>{
 if(file.size>25*1024*1024)throw new Error('圖片不可超過 25MB');
 const url=URL.createObjectURL(file);const img=new Image();
 try{img.src=url;await img.decode();const scale=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('裝置未能處理圖片');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖片壓縮失敗')),'image/jpeg',0.8));}catch{throw new Error('未能讀取圖片，請使用 JPG、PNG 或 WebP；HEIC 請先轉換。');}finally{URL.revokeObjectURL(url);}
}
