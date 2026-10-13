import {useLayoutEffect,useRef,useState} from 'react';
export type PageVisit={page:string;scroll:number};
export function pushVisit(visits:PageVisit[],page:string,scroll:number):PageVisit[]{
 if(visits[visits.length-1].page===page)return visits;
 return [...visits.slice(0,-1),{...visits[visits.length-1],scroll},{page,scroll:0}];
}
export function previousVisit(visits:PageVisit[]):PageVisit[]{return visits.length>1?visits.slice(0,-1):visits;}
export default function usePageNavigation(){
 const [visits,setVisits]=useState<PageVisit[]>([{page:'dashboard',scroll:0}]);
 const target=useRef<number|null>(null);const current=visits[visits.length-1];
 function navigate(page:string){if(page===current.page)return;const scroll=window.scrollY;target.current=0;setVisits(v=>pushVisit(v,page,scroll));}
 function back(){if(visits.length<2)return;target.current=visits[visits.length-2].scroll;setVisits(previousVisit);}
 useLayoutEffect(()=>{if(target.current!==null){window.scrollTo({top:target.current,behavior:'instant'});target.current=null;}},[visits]);
 return {page:current.page,navigate,back,previous:visits.length>1?visits[visits.length-2].page:null};
}
