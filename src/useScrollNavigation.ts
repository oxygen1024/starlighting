import {useEffect,useState} from 'react';

// Accumulate small scroll steps so touch jitter does not flicker the navigation.
export default function useScrollNavigation(page:string){
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{
  setHidden(false);
  const mobile=window.matchMedia('(max-width:800px)');
  let anchor=window.scrollY,frame=0;
  const reset=()=>{anchor=window.scrollY;setHidden(false);};
  const update=()=>{
   frame=0;
   if(!mobile.matches){reset();return;}
   const limit=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
   const y=Math.max(0,Math.min(window.scrollY,limit));
   if(y<=64||y>=limit-2){anchor=y;setHidden(false);return;}
   if(Math.abs(y-anchor)<12)return;
   setHidden(y>anchor);anchor=y;
  };
  const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  window.addEventListener('scroll',scroll,{passive:true});
  window.addEventListener('resize',reset);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',scroll);window.removeEventListener('resize',reset);};
 },[page]);
 return hidden;
}
