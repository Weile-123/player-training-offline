import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import './ActionNotice.css';

export const actionNoticeDurationMs = 3000;

/** Operation feedback floats above the page instead of changing a panel's size. */
export function ActionNotice({message,role='status',className=''}:{message:string;role?:'status'|'alert';className?:string}){
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{
  setHidden(false);
  if(!message)return;
  const timer=setTimeout(()=>setHidden(true),actionNoticeDurationMs);
  return()=>clearTimeout(timer);
 },[message,role]);
 if(!message||hidden)return null;
 const content=<p className={`action-notice ${className}`} role={role} aria-live={role==='alert'?'assertive':'polite'}>{message}</p>;
 return typeof document==='undefined'?content:createPortal(content,document.body);
}
