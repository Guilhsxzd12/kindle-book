"use client";

import { useEffect,useRef,useState } from "react";
import { BookCard } from "@/components/BookCard";
import { HorizontalBookSlider } from "@/components/HorizontalBookSlider";
import type { Book } from "@/lib/types";

export function LazyHorizontalBookShelf({initialBooks,total,categorySlug,pageSize=30,isAdmin=false}:{initialBooks:Book[];total:number;categorySlug:string;pageSize?:number;isAdmin?:boolean}){
  const [books,setBooks]=useState<Book[]>(initialBooks);
  const [page,setPage]=useState(1);
  const [knownTotal,setKnownTotal]=useState(total);
  const [failed,setFailed]=useState(false);
  const loading=useRef(false);
  const sentinel=useRef<HTMLDivElement|null>(null);

  async function loadMore(){
    if(loading.current||books.length>=knownTotal)return;
    loading.current=true;setFailed(false);
    try{
      const nextPage=page+1;
      const params=new URLSearchParams({categoria:categorySlug,pagina:String(nextPage),tamanho:String(pageSize)});
      const response=await fetch(`/api/catalog-shelf?${params.toString()}`,{cache:"no-store"});
      if(!response.ok)throw new Error("Falha ao carregar mais livros");
      const data=await response.json() as {books:Book[];total:number;page:number};
      setBooks(current=>{
        const seen=new Set(current.map(book=>book.id));
        return [...current,...data.books.filter(book=>!seen.has(book.id))];
      });
      setKnownTotal(data.total);
      setPage(data.page);
    }catch{
      setFailed(true);
    }finally{
      loading.current=false;
    }
  }

  useEffect(()=>{
    const node=sentinel.current;
    if(!node||books.length>=knownTotal)return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting))void loadMore();
    },{rootMargin:"0px 420px 0px 420px"});
    observer.observe(node);
    return()=>observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[books.length,knownTotal,page,categorySlug]);

  return <>
    <HorizontalBookSlider className="lazy-category-slider">
      {books.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}
      {books.length<knownTotal&&<div ref={sentinel} className="shelf-load-card" aria-live="polite"><span>{failed?"Não carregou":"Mais livros"}</span>{failed?<button type="button" onClick={()=>void loadMore()}>Tentar novamente</button>:<small>Continue deslizando →</small>}</div>}
    </HorizontalBookSlider>
    <div className="shelf-loaded-count">{books.length} de {knownTotal} {knownTotal===1?"livro":"livros"}</div>
  </>;
}
