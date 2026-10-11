export type ImportRow={id:string;row:number;name:string;brand:string;category:string;duplicate:boolean;invalid:boolean};
export function prepareImport(rows:unknown[][],columns:{name:number;brand:number;category:number},header:boolean,existingNames:string[],ids:string[]):ImportRow[]{
 const seen=new Set(existingNames.map(n=>n.trim().toLocaleLowerCase()));
 const cell=(r:unknown[],i:number)=>i<0?'':typeof r[i]==='string'||typeof r[i]==='number'?String(r[i]).trim():'';
 return rows.slice(header?1:0).map((r,i)=>{const name=cell(r,columns.name);const brand=cell(r,columns.brand),category=cell(r,columns.category);const key=name.toLocaleLowerCase();const duplicate=seen.has(key);if(name)seen.add(key);return {id:ids[i],row:i+(header?2:1),name,brand,category,duplicate,invalid:!name||name.length>300||brand.length>100||category.length>100};}).filter(r=>r.name||r.brand||r.category);
}
