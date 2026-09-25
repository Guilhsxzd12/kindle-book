"use client";

import Link from "next/link";
import {useEffect,useRef,useState} from "react";

type Suggestion={id:string;title:string;author:string|null;slug:string;cover_url:string|null};

function SearchIcon(){
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

export function CatalogSearchBox({
  className,
  placeholder="Livro ou autor...",
  initialValue="",
  showIcon=false
}:{className:string;placeholder?:string;initialValue?:string;showIcon?:boolean}){
  const [value,setValue]=useState(initialValue);
  const [items,setItems]=useState<Suggestion[]>([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const root=useRef<HTMLFormElement>(null);

  useEffect(()=>{
    const q=value.trim();
    if(q.length<2){setItems([]);setOpen(false);setLoading(false);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      try{
        const response=await fetch(`/api/catalog-suggestions?q=${encodeURIComponent(q)}`,{signal:controller.signal});
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||"Falha na pesquisa.");
        setItems(json.items||[]);
        setOpen(true);
      }catch(error){
        if(!(error instanceof DOMException&&error.name==="AbortError"))setItems([]);
      }finally{setLoading(false);}
    },90);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[value]);

  useEffect(()=>{
    const close=(event:MouseEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false);
    };
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);

  return <form ref={root} className={`${className} catalog-search-autocomplete`} action="/biblioteca" method="get" onSubmit={()=>setOpen(false)}>
    {showIcon&&<SearchIcon/>}
    <input
      name="q"
      value={value}
      onChange={event=>setValue(event.target.value)}
      onFocus={()=>{if(items.length)setOpen(true);}}
      onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}
      placeholder={placeholder}
      aria-label="Pesquisar livros"
      autoComplete="off"
    />
    <button type="submit">Buscar</button>
    {open&&<div className="catalog-live-suggestions" role="listbox" aria-label="Sugestões de livros">
      {loading&&!items.length?<div className="catalog-suggestion-status">Pesquisando…</div>:items.length?items.map(item=>
        <Link key={item.id} className="catalog-suggestion-row" href={`/livro/${item.slug}`} prefetch={false} onClick={()=>setOpen(false)}>
          {item.cover_url?<img src={item.cover_url} alt="" loading="lazy"/>:<span className="catalog-suggestion-cover"/>}
          <span><strong>{item.title}</strong><small>{item.author||"Autor não informado"}</small></span>
        </Link>
      ):<div className="catalog-suggestion-status">Nenhum título encontrado. Pressione Buscar para ver a pesquisa completa.</div>}
      {!!items.length&&<Link className="catalog-suggestion-all" href={`/biblioteca?q=${encodeURIComponent(value.trim())}`} onClick={()=>setOpen(false)}>Ver todos os resultados →</Link>}
    </div>}
  </form>;
}
