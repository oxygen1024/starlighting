export type ImportColumns={name:number;brand:number;category:number;barcode?:number;quantity?:number};
export type ImportRow={id:string;row:number;name:string;brand:string;category:string;barcode:string;quantity:number;duplicate:boolean;invalid:boolean;errors:string[];numericBarcode:boolean};
export function prepareImport(rows:unknown[][],columns:ImportColumns,header:boolean,existingNames:string[],ids:string[],existingBarcodes:string[]=[]):ImportRow[]{
 const seen=new Set(existingNames.map(n=>n.trim().toLocaleLowerCase()));
 const cell=(r:unknown[],i:number)=>i<0?'':typeof r[i]==='string'||typeof r[i]==='number'?String(r[i]).trim():'';
 const knownBarcodes=new Set(existingBarcodes);
 return rows.slice(header?1:0).map((r,i)=>{const name=cell(r,columns.name);const brand=cell(r,columns.brand),category=cell(r,columns.category),barcode=cell(r,columns.barcode??-1);const rawQuantity=(columns.quantity??-1)>=0?r[columns.quantity!]:null;const text=rawQuantity===null||rawQuantity===undefined?'':String(rawQuantity).trim();const quantity=text===''?0:Number(text);const errors:string[]=[];
 if(!name||name.length>300||brand.length>100||category.length>100)errors.push('名稱空白或文字過長');
 if(text!==''&&!/^[0-9]+$/.test(text)||!Number.isSafeInteger(quantity)||quantity<0||quantity>9999999)errors.push('數量須為 0 至 9999999 嘅整數');
 const rawBarcode=r[columns.barcode??-1];const numericBarcode=typeof rawBarcode==='number';
 if(barcode.length>200||numericBarcode&&(!Number.isSafeInteger(rawBarcode)||rawBarcode<0))errors.push('條碼無效，請改用文字格式');
 if(barcode&&knownBarcodes.has(barcode))errors.push('條碼已屬於現有貨品');
 const key=name.toLocaleLowerCase();const duplicate=seen.has(key);if(name)seen.add(key);
 return {id:ids[i],row:i+(header?2:1),name,brand,category,barcode,quantity,duplicate,invalid:errors.length>0,errors,numericBarcode};}).filter(r=>r.name||r.brand||r.category||r.barcode||r.quantity!==0);
}
export function duplicateImportBarcodes(rows:ImportRow[]):string[]{const seen=new Set<string>();const duplicates=new Set<string>();for(const r of rows)if(r.barcode){if(seen.has(r.barcode))duplicates.add(r.barcode);seen.add(r.barcode);}return [...duplicates];}
