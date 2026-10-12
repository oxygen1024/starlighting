import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Printer,X} from 'lucide-react';
export type PrintDocument={title:string;subtitle:string;headers:string[];rows:(string|number)[][];notes:string;footer:string};
export default function PrintPreview({document:sheet,close}:{document:PrintDocument;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();window.document.body.classList.add('printing-warehouse');return()=>window.document.body.classList.remove('printing-warehouse');},[]);
 return createPortal(<dialog ref={dialog} className="print-preview" onCancel={e=>{e.preventDefault();close();}}><div className="print-actions"><p>列印預覽 · 可選擇「儲存為 PDF」</p><button className="primary" onClick={()=>window.print()}><Printer size={18}/>列印單據</button><button aria-label="關閉列印預覽" onClick={close}><X size={18}/></button></div><article className="warehouse-sheet"><p className="sheet-brand">星光照明 · STAR LIGHTING</p><h1>{sheet.title}</h1><p>{sheet.subtitle}</p><table><thead><tr>{sheet.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sheet.rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{value}</td>)}</tr>)}</tbody></table>{sheet.notes&&<p className="sheet-notes">備註：{sheet.notes}</p>}<p>{sheet.footer}</p><p className="sheet-sign">核對人：________________　日期：________________</p></article></dialog>,window.document.body);
}
