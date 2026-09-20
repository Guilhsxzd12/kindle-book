"use client";

import { useEffect,useRef,useState } from "react";

type AltCover={id:string;book_id:string;cover_url:string;label:string|null;source:string;created_at:string};

export function BookCoverManager({bookId,title,mainCoverUrl}:{bookId:string;title:string;mainCoverUrl:string|null}){
  const [covers,setCovers]=useState<AltCover[]>([]);const [mainCover,setMainCover]=useState(mainCoverUrl);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const [url,setUrl]=useState("");const inputRef=useRef<HTMLInputElement|null>(null);

  async function load(){const response=await fetch(`/api/admin/book-covers?bookId=${encodeURIComponent(bookId)}`,{cache:"no-store"});const data=await response.json();if(response.ok)setCovers(data.covers||[]);}
  useEffect(()=>{setMainCover(mainCoverUrl);void load();},[bookId,mainCoverUrl]);

  async function saveCover(coverUrl:string,label?:string){
    const response=await fetch("/api/admin/book-covers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookId,coverUrl,label})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível adicionar a capa.");if(data.promotedToMain)setMainCover(coverUrl);await load();return Boolean(data.promotedToMain);
  }

  async function upload(file:File){
    if(!file.type.startsWith("image/")){setMessage("Escolha uma imagem.");return;}
    setBusy(true);setMessage("Enviando capa para o Google Drive...");
    try{const form=new FormData();form.append("file",file);const response=await fetch("/api/admin/covers",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível enviar a capa.");const promoted=await saveCover(data.coverUrl,`Capa alternativa ${covers.length+1}`);setMessage(promoted?"Capa adicionada e definida como capa principal do livro.":"Capa alternativa adicionada.");}
    catch(error){setMessage(error instanceof Error?error.message:"Erro ao enviar capa.");}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value="";}
  }

  async function addUrl(){if(!url.trim())return;setBusy(true);setMessage("");try{const promoted=await saveCover(url.trim(),`Capa alternativa ${covers.length+1}`);setUrl("");setMessage(promoted?"Capa adicionada e definida como capa principal do livro.":"Capa alternativa adicionada.");}catch(error){setMessage(error instanceof Error?error.message:"Erro ao adicionar capa.");}finally{setBusy(false);}}
  async function remove(id:string){if(!confirm("Remover esta capa alternativa?"))return;const response=await fetch(`/api/admin/book-covers?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(response.ok)setCovers(current=>current.filter(item=>item.id!==id));}

  return <section className="card panel cover-admin-panel">
    <div className="panel-title"><div><span className="eyebrow">CAPAS DO KINDLE</span><h2>Gerenciar capas</h2><p className="muted">Se o livro ainda estiver sem capa, a primeira imagem adicionada vira automaticamente a capa principal. As próximas ficam como alternativas.</p></div></div>
    <div className="admin-cover-grid">
      {mainCover&&<div className="admin-cover-item main"><img src={mainCover} alt={`Capa principal de ${title}`}/><strong>Capa principal</strong></div>}
      {covers.filter(cover=>cover.cover_url!==mainCover).map((cover,index)=><div className="admin-cover-item" key={cover.id}><img src={cover.cover_url} alt={`Capa alternativa ${index+1}`}/><strong>{cover.label||`Alternativa ${index+1}`}</strong><button type="button" className="btn danger small" onClick={()=>void remove(cover.id)}>Remover</button></div>)}
    </div>
    <div className="cover-admin-actions">
      <label><strong>Enviar uma nova capa</strong><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);}}/></label>
      <div className="cover-url-row"><input value={url} onChange={event=>setUrl(event.target.value)} placeholder="Ou cole a URL de uma capa"/><button type="button" className="btn ghost" disabled={busy||!url.trim()} onClick={()=>void addUrl()}>Adicionar URL</button></div>
    </div>
    {message&&<div className="notice">{message}</div>}
  </section>;
}
