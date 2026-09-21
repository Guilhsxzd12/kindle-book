"use client";

import {FormEvent,useEffect,useState} from "react";
import Link from "next/link";
import type {Book} from "@/lib/types";

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function genericAuthor(value:string){
  const v=norm(value).replace(/[^a-z0-9]+/g,"");
  return !v||["autornaoinformado","autornaoidentificado","desconhecido","unknown"].includes(v);
}

export function CorrectionDashboard({initialBooks,initialTotal,onCountChange}:{initialBooks:Book[];initialTotal:number;onCountChange?:(count:number)=>void}){
  const [books,setBooks]=useState(initialBooks);
  const [total,setTotal]=useState(initialTotal);
  const [search,setSearch]=useState("");
  const [busySearch,setBusySearch]=useState(false);
  const [editing,setEditing]=useState<Book|null>(null);
  const [title,setTitle]=useState("");
  const [author,setAuthor]=useState("");
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [preview,setPreview]=useState("");
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{onCountChange?.(total);},[total,onCountChange]);

  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setBusySearch(true);
      try{
        const response=await fetch("/api/admin/corrections?q="+encodeURIComponent(search.trim()),{cache:"no-store",signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"Não foi possível pesquisar.");
        setBooks((data.books||[]) as Book[]);
        setTotal(Number(data.total)||0);
        setMessage("");
      }catch(error){
        if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Não foi possível pesquisar.");
      }finally{if(!controller.signal.aborted)setBusySearch(false);}
    },search.trim()?250:0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[search]);

  function openEdit(book:Book){
    setEditing(book);setTitle(book.title||"");setAuthor(genericAuthor(book.author||"")?"":book.author||"");setCoverFile(null);setPreview(book.cover_url||"");setMessage("");
  }
  function closeEdit(){if(saving)return;setEditing(null);setCoverFile(null);setPreview("");}
  function chooseCover(file:File|null){setCoverFile(file);if(file)setPreview(URL.createObjectURL(file));else setPreview(editing?.cover_url||"");}

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!editing)return;
    if(title.trim().length<2){setMessage("Informe o título correto.");return;}
    if(author.trim().length<2||genericAuthor(author)){setMessage("Informe o autor correto.");return;}
    setSaving(true);setMessage("");
    try{
      let coverUrl=editing.cover_url||"";
      if(coverFile){
        const form=new FormData();form.append("file",coverFile);
        const upload=await fetch("/api/admin/covers",{method:"POST",body:form});
        const uploaded=await upload.json();
        if(!upload.ok)throw new Error(uploaded.error||"Não foi possível enviar a capa.");
        coverUrl=uploaded.coverUrl;
      }
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
        id:editing.id,title:title.trim(),author:author.trim(),coverUrl,resolveCorrection:true,published:true
      })});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível salvar a correção.");
      setBooks(current=>current.filter(book=>book.id!==editing.id));
      setTotal(current=>Math.max(0,current-1));
      setEditing(null);setCoverFile(null);setPreview("");
      setMessage(data.book.title+" corrigido e atualizado no catálogo.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível salvar a correção.");}
    finally{setSaving(false);}
  }

  async function remove(book:Book){
    if(!confirm('Excluir "'+book.title+'" definitivamente do acervo?'))return;
    const response=await fetch("/api/admin/books?id="+encodeURIComponent(book.id),{method:"DELETE"});
    const data=await response.json();
    if(!response.ok){setMessage(data.error||"Não foi possível excluir.");return;}
    setBooks(current=>current.filter(item=>item.id!==book.id));
    setTotal(current=>Math.max(0,current-1));
    if(editing?.id===book.id)setEditing(null);
    setMessage("Livro excluído.");
  }

  return <section className="card panel correction-panel">
    <div className="panel-title">
      <div><span className="eyebrow">REVISÃO MANUAL</span><h2>Corrigir livros</h2><p>Somente livros em que a leitura automática não conseguiu confirmar título ou autor ficam aqui. Eles continuam visíveis no catálogo enquanto aguardam a correção.</p></div>
      <span className="count-badge">{total}</span>
    </div>

    <div className="admin-book-search">
      <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Pesquisar título ou autor..." aria-label="Pesquisar livros para corrigir"/>
      {search&&<button type="button" className="btn ghost small" onClick={()=>setSearch("")}>Limpar</button>}
    </div>
    <p className="admin-list-hint">{busySearch?"Pesquisando...":search?books.length+" resultado(s) nesta pesquisa":total+" livro(s) aguardando correção"}</p>
    {message&&<div className={"notice "+(/corrigido|excluído/i.test(message)?"success":"")}>{message}</div>}

    <div className="admin-book-list correction-book-list">
      {books.length?books.map(book=><article className="admin-book correction-book" key={book.id}>
        {book.cover_url?<img src={book.cover_url} alt=""/>:<span className="mini-cover"/>}
        <div><strong>{book.title||"Título não identificado"}</strong><small>{book.author||"Autor não identificado"}</small><small className="correction-reason">{book.correction_reason||"A identificação automática precisa de revisão."}</small></div>
        <div className="row wrap">
          <button type="button" className="btn small" onClick={()=>openEdit(book)}>Corrigir</button>
          {book.slug&&<Link className="btn ghost small" href={"/livro/"+book.slug} target="_blank">Abrir</Link>}
          <button type="button" className="btn danger small" onClick={()=>void remove(book)}>Excluir</button>
        </div>
      </article>):<div className="empty-state admin-search-empty"><h3>{search?"Nenhum resultado":"Tudo corrigido"}</h3><p>{search?"Tente outro título ou autor.":"Nenhum livro precisa de correção manual neste momento."}</p></div>}
    </div>

    {editing&&<div className="quick-edit-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)closeEdit();}}>
      <section className="quick-edit-modal correction-modal" role="dialog" aria-modal="true">
        <div className="quick-edit-head"><div><span className="eyebrow">CORREÇÃO MANUAL</span><h2>Corrigir livro</h2><p>Ao salvar, o livro sai desta lista e os dados são atualizados no catálogo.</p></div><button type="button" className="quick-edit-close" onClick={closeEdit} disabled={saving}>×</button></div>
        <form className="stack" onSubmit={save}>
          <label>Título<input value={title} onChange={event=>setTitle(event.target.value)} required autoFocus/></label>
          <label>Autor<input value={author} onChange={event=>setAuthor(event.target.value)} placeholder="Digite o autor correto" required/></label>
          <label>Capa (opcional)
            <div className="quick-edit-cover-row">
              {preview?<img src={preview} alt="Prévia da capa"/>:<span className="quick-edit-cover-placeholder">Sem capa</span>}
              <div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>chooseCover(event.target.files?.[0]||null)}/><small>{coverFile?coverFile.name:"Você pode manter a capa atual ou enviar outra."}</small></div>
            </div>
          </label>
          <div className="quick-edit-actions"><button type="button" className="btn ghost" onClick={closeEdit} disabled={saving}>Cancelar</button><button className="btn" disabled={saving}>{saving?"Salvando...":"Salvar e atualizar"}</button></div>
        </form>
      </section>
    </div>}
  </section>;
}
