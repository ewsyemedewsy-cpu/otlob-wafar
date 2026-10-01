import React,{useEffect,useRef} from 'react';
export function FullPageDialog({className,children,label,onClose}){const ref=useRef(null);useEffect(()=>{ref.current.showModal()},[]);return <dialog ref={ref} className={className} aria-label={label} onCancel={onClose}>{children}</dialog>}
