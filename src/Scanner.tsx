import {useEffect,useRef,useState} from 'react';
import {BrowserMultiFormatReader,IScannerControls} from '@zxing/browser';
import {ScanGate} from './core';
export default function Scanner({onScan,onClose}:{onScan:(v:string)=>void;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null);const callback=useRef(onScan);callback.current=onScan;const gate=useRef(new ScanGate());const [error,setError]=useState('');const [last,setLast]=useState('');
 useEffect(()=>{let controls:IScannerControls|undefined;let cancelled=false;const reader=new BrowserMultiFormatReader();reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video.current!,result=>{if(result&&!cancelled&&gate.current.accept(result.getText())){const text=result.getText();setLast(text);callback.current(text);navigator.vibrate?.(80);}}).then(c=>{controls=c;if(cancelled)c.stop();}).catch(()=>setError('未能開啟相機。請允許相機權限，或用手動新增貨品。'));return()=>{cancelled=true;controls?.stop();};},[]);
 return <section className="scanner"><div className="row"><strong>連續掃描</strong><button onClick={onClose}>關閉相機</button></div><video ref={video} muted playsInline/><p>將條碼放喺鏡頭前。重掃同一件貨品前，移開條碼約兩秒。</p>{last&&<p>已讀取：{last} <button onClick={()=>{gate.current.reset();}}>允許再次掃描</button></p>}{error&&<p role="alert">{error}</p>}</section>;
}
