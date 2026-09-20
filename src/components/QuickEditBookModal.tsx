"use client";

import {FormEvent,useEffect,useState} from "react";
import {useRouter} from "next/navigation";

export function QuickEditBookModal({bookId,title:initialTitle,author:initialAuthor}:{bookId:string;title:string;author:string}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(initialTitle);
  const [author,setAuthor]=useState(initialAuthor);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,busy]);

  function start(){
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setMessage("");
    setOpen(true);
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(title.trim().length<2||author.trim().length<2){setMessage("Preencha título e autor.");return;}
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:bookId,title:title.trim(),author:author.trim()})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível salvar as alterações.");
      setOpen(false);
      const nextSlug=data.book?.slug;
      if(nextSlug){router.replace(`/livro/${encodeURIComponent(nextSlug)}`);router.refresh();}
      else router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível salvar as alterações.");}
    finally{setBusy(false);}
  }

  return <>
    <button type="button" className="btn" onClick={start}>Editar livro</button>
    {open&&<div className="quick-edit-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}>
      <section className="quick-edit-modal" role="dialog" aria-modal="true" aria-labelledby="quick-edit-title">
        <div className="quick-edit-head">
          <div><span className="eyebrow">EDIÇÃO RÁPIDA</span><h2 id="quick-edit-title">Editar livro</h2><p>Altere o título ou o autor sem sair desta página.</p></div>
          <button type="button" className="quick-edit-close" aria-label="Fechar" disabled={busy} onClick={()=>setOpen(false)}>×</button>
        </div>
        <form className="stack" onSubmit={save}>
          <label>Título<input autoFocus value={title} onChange={event=>setTitle(event.target.value)} required/></label>
          <label>Autor<input value={author} onChange={event=>setAuthor(event.target.value)} required/></label>
          {message&&<div className="notice">{message}</div>}
          <div className="quick-edit-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn" disabled={busy}>{busy?"Salvando...":"Salvar alterações"}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
