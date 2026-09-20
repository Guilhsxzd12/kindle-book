"use client";

import {FormEvent,useEffect,useState} from "react";
import {createPortal} from "react-dom";

export function QuickCoverEditModal({bookId,title,coverUrl,onSaved}:{bookId:string;title:string;coverUrl:string|null;onSaved:(url:string)=>void}){
  const [mounted,setMounted]=useState(false);
  const [open,setOpen]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState(coverUrl||"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{setMounted(true);},[]);
  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,busy]);

  function start(){
    setFile(null);
    setPreview(coverUrl||"");
    setMessage("");
    setOpen(true);
  }

  function chooseFile(next:File|null){
    setFile(next);
    setMessage("");
    if(next)setPreview(URL.createObjectURL(next));
    else setPreview(coverUrl||"");
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!file){setMessage("Escolha uma imagem para a capa.");return;}
    setBusy(true);setMessage("");
    try{
      const form=new FormData();form.append("file",file);
      const uploadResponse=await fetch("/api/admin/covers",{method:"POST",body:form});
      const uploaded=await uploadResponse.json();
      if(!uploadResponse.ok)throw new Error(uploaded.error||"Não foi possível enviar a capa.");

      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:bookId,coverUrl:uploaded.coverUrl})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível atualizar a capa.");

      await fetch("/api/admin/book-covers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookId,coverUrl:uploaded.coverUrl,label:"Capa principal"})}).catch(()=>null);
      onSaved(uploaded.coverUrl);
      setOpen(false);
    }catch(error){
      setMessage(error instanceof Error?error.message:"Não foi possível atualizar a capa.");
    }finally{
      setBusy(false);
    }
  }

  const modal=open&&mounted?createPortal(
    <div className="quick-edit-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}>
      <section className="quick-edit-modal quick-cover-modal" role="dialog" aria-modal="true" aria-labelledby={"quick-cover-"+bookId}>
        <div className="quick-edit-head">
          <div><span className="eyebrow">EDIÇÃO RÁPIDA</span><h2 id={"quick-cover-"+bookId}>Editar capa</h2><p>{title}</p></div>
          <button type="button" className="quick-edit-close" aria-label="Fechar" disabled={busy} onClick={()=>setOpen(false)}>×</button>
        </div>
        <form className="stack" onSubmit={save}>
          <div className="card-cover-edit-preview">
            {preview?<img src={preview} alt={"Prévia da capa de "+title}/>:<div className="cover-fallback">Sem capa</div>}
          </div>
          <label>Enviar capa
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>chooseFile(event.target.files?.[0]||null)}/>
            <small>JPG, PNG ou WEBP. Ao salvar, esta imagem vira a capa principal.</small>
          </label>
          {message&&<div className="notice">{message}</div>}
          <div className="quick-edit-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn" disabled={busy||!file}>{busy?"Enviando...":"Salvar capa"}</button>
          </div>
        </form>
      </section>
    </div>,document.body):null;

  return <>
    <button type="button" className="book-card-admin-edit" onClick={start} aria-label={"Editar capa de "+title}>Editar</button>
    {modal}
  </>;
}
