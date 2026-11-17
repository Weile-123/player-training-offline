import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import './ActionNotice.css';

/** Operation feedback floats above the page instead of changing a panel's size. */
export function ActionNotice({message,role='status',className=''}:{message:string;role?:'status'|'alert';className?:string}){
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{
  setHidden(false);
  if(!message||role==='alert')return;
  const timer=setTimeout(()=>setHidden(true),4000);
  return()=>clearTimeout(timer);
 },[message,role]);
 if(!message||hidden)return null;
 const content=<p className={`action-notice ${className}`} role={role} aria-live={role==='alert'?'assertive':'polite'}>{message}</p>;
 return typeof document==='undefined'?content:createPortal(content,document.body);
}
