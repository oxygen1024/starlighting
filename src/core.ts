export type Product={id:string;name:string;sku:string;barcode:string|null;category:string;brand:string;wattage:string;color_temperature:string;specifications:string;location:string;selling_price:number;low_stock:number;created_at:string};
export type Line={product_id:string;quantity:number};
export function addLine(lines:Line[],id:string):Line[]{return lines.some(l=>l.product_id===id)?lines.map(l=>l.product_id===id?{...l,quantity:l.quantity+1}:l):[...lines,{product_id:id,quantity:1}];}
export function validQuantity(n:number){return Number.isSafeInteger(n)&&n>0&&n<=9999999;}
export function csvCell(value:unknown){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function csv(rows:unknown[][]){return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
export class ScanGate{private last='';private seen=0;accept(code:string,now=Date.now()){const repeated=code===this.last&&now-this.seen<1800;this.last=code;this.seen=now;return !repeated;}reset(){this.last='';this.seen=0;}}
// Search aliases never change stored names or the exact barcode used by scanning.
function searchText(value:string){return value.normalize('NFKC').toLowerCase().replace(/\s+/gu,'');}
function searchAlias(value:string){return value.replace(/(?<![a-z])so(?![a-z])/g,'蘇');}
export function matchesText(value:string,query:string){
 const text=searchText(value),term=searchText(query);
 return text.includes(term)||searchAlias(text).includes(searchAlias(term));
}
export function matches(p:Product,query:string,filters:Record<string,string>){return [p.name,p.barcode??''].some(value=>matchesText(value,query))&&Object.entries(filters).every(([k,v])=>!v||String(p[k as keyof Product])===v);}
