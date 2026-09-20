"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {guessCategoryId} from "@/lib/category-match";
import type {BookMetadataResult,Category} from "@/lib/types";

type Props={
  bookId:string;
  title:string;
  author:string;
  categoryId:string|null;
  coverUrl:string|null;
  categories:Category[];
};

export function QuickEditBookModal({bookId,title:initialTitle,author:initialAuthor,categoryId:initialCategoryId,coverUrl:initialCoverUrl,categories}:Props){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(initialTitle);
  const [author,setAuthor]=useState(initialAuthor);
  const [categoryId,setCategoryId]=useState(initialCategoryId||"");
  const [categoryTouched,setCategoryTouched]=useState(false);
  const [detectingCategory,setDetectingCategory]=useState(false);
  const [categoryNote,setCategoryNote]=useState("");
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [coverPreview,setCoverPreview]=useState(initialCoverUrl||"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const categoryName=useMemo(()=>categories.find(item=>item.id===categoryId)?.name||"",[categories,categoryId]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,busy]);

  useEffect(()=>{
    if(!open||categoryTouched||title.trim().length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setDetectingCategory(true);setCategoryNote("");
      try{
        const localGuess=guessCategoryId(categories,[],title,author);
        if(localGuess){
          setCategoryId(localGuess);
          const name=categories.find(item=>item.id===localGuess)?.name||"";
          setCategoryNote(name?`Categoria detectada automaticamente: ${name}.`:"Categoria detectada automaticamente.");
          return;
        }
        const response=await fetch(`/api/book-metadata?title=${encodeURIComponent(title.trim())}`,{signal:controller.signal,cache:"no-store"});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"Não foi possível identificar a categoria.");
        const results=(data.results||[]) as BookMetadataResult[];
        const best=results.find(item=>{
          const a=(item.author||"").toLowerCase(),wanted=author.trim().toLowerCase();
          return wanted&&a.includes(wanted);
        })||results[0];
        if(!best){setCategoryNote("Não encontrei uma categoria com segurança. Você pode deixar sem categoria ou escolher manualmente.");return;}
        const guessed=guessCategoryId(categories,best.categories||[],best.title,best.description||"");
        if(guessed){
          setCategoryId(guessed);
          const name=categories.find(item=>item.id===guessed)?.name||"";
          setCategoryNote(name?`Categoria detectada automaticamente: ${name}.`:"Categoria detectada automaticamente.");
        }else setCategoryNote("Não encontrei uma categoria com segurança. Você pode deixar sem categoria ou escolher manualmente.");
      }catch(error){
        if(!controller.signal.aborted)setCategoryNote(error instanceof Error?error.message:"Não foi possível identificar a categoria.");
      }finally{if(!controller.signal.aborted)setDetectingCategory(false);}
    },450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[open,title,author,categories,categoryTouched]);

  function start(){
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setCategoryId(initialCategoryId||"");
    setCategoryTouched(Boolean(initialCategoryId));
    setCategoryNote(initialCategoryId?`Categoria atual: ${categories.find(item=>item.id===initialCategoryId)?.name||"cadastrada"}.`:"Identificando categoria...");
    setCoverFile(null);
    setCoverPreview(initialCoverUrl||"");
    setMessage("");
    setOpen(true);
  }

  function chooseCover(file:File|null){
    setCoverFile(file);
    if(file)setCoverPreview(URL.createObjectURL(file));
    else setCoverPreview(initialCoverUrl||"");
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(title.trim().length<2||author.trim().length<2){setMessage("Preencha título e autor.");return;}
    setBusy(true);setMessage("");
    try{
      let newCoverUrl:string|undefined;
      if(coverFile){
        const form=new FormData();form.append("file",coverFile);
        const uploadResponse=await fetch("/api/admin/covers",{method:"POST",body:form});
        const uploaded=await uploadResponse.json();
        if(!uploadResponse.ok)throw new Error(uploaded.error||"Não foi possível enviar a capa.");
        newCoverUrl=uploaded.coverUrl;
      }
      const body:Record<string,unknown>={id:bookId,title:title.trim(),author:author.trim(),categoryId:categoryId||""};
      if(newCoverUrl)body.coverUrl=newCoverUrl;
      const response=await fetch("/api/admin/books",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
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
          <div><span className="eyebrow">EDIÇÃO RÁPIDA</span><h2 id="quick-edit-title">Editar livro</h2><p>Altere os dados principais sem sair desta página.</p></div>
          <button type="button" className="quick-edit-close" aria-label="Fechar" disabled={busy} onClick={()=>setOpen(false)}>×</button>
        </div>
        <form className="stack" onSubmit={save}>
          <label>Título<input autoFocus value={title} onChange={event=>{setTitle(event.target.value);setCategoryTouched(false);}} required/></label>
          <label>Autor<input value={author} onChange={event=>{setAuthor(event.target.value);setCategoryTouched(false);}} required/></label>
          <label>Categoria
            <select value={categoryId} onChange={event=>{setCategoryId(event.target.value);setCategoryTouched(true);setCategoryNote(event.target.value?"Categoria escolhida manualmente.":"Sem categoria.");}}>
              <option value="">Sem categoria</option>
              {categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <small>{detectingCategory?"Identificando categoria automaticamente...":categoryNote||(categoryName?`Categoria atual: ${categoryName}.`:"A categoria não é obrigatória.")}</small>
          </label>
          <label>Capa
            <div className="quick-edit-cover-row">
              {coverPreview?<img src={coverPreview} alt="Prévia da capa"/>:<span className="quick-edit-cover-placeholder">Sem capa</span>}
              <div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>chooseCover(event.target.files?.[0]||null)}/><small>{coverFile?`Nova capa: ${coverFile.name}`:"Escolha uma imagem apenas se quiser adicionar ou substituir a capa."}</small></div>
            </div>
          </label>
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
