"use client";

import {useMemo,useState} from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { bookPath } from "@/lib/site";
import { QuickCoverEditModal } from "@/components/QuickCoverEditModal";

function driveIdFromCover(url:string|null){
  if(!url)return null;
  const match=url.match(/^\\/api\\/covers\\/([^/?#]+)/);
  return match?.[1]||null;
}

function initialCover(url:string|null){
  const id=driveIdFromCover(url);
  return id?"https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w1000":url;
}

export function BookCard({book,isAdmin=false}:{book:Book;isAdmin?:boolean}){
  const [coverUrl,setCoverUrl]=useState(book.cover_url);
  const [displayCover,setDisplayCover]=useState<string|null>(()=>initialCover(book.cover_url));
  const [driveFallbackTried,setDriveFallbackTried]=useState(false);
  const driveId=useMemo(()=>driveIdFromCover(coverUrl),[coverUrl]);

  function handleCoverError(){
    if(driveId&&!driveFallbackTried){
      setDriveFallbackTried(true);
      setDisplayCover("https://lh3.googleusercontent.com/d/"+encodeURIComponent(driveId)+"=w1000");
      return;
    }
    setDisplayCover(null);
  }

  function handleSaved(next:string|null){
    setCoverUrl(next);
    setDriveFallbackTried(false);
    setDisplayCover(initialCover(next));
  }

  return <div className={"book-card-admin-wrap"+(isAdmin?" is-admin":"")}>
    <Link className="book-card catalog-book-card" href={bookPath(book.slug)} prefetch={false}>
      <div className="book-cover-wrap">{displayCover?<img className="cover" src={displayCover} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={handleCoverError}/>:<div className="cover-fallback">{book.title}</div>}{book.categories?.name&&<span className="floating-category">{book.categories.name}</span>}</div>
      <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author||"Autor não informado"}</div><div className="book-footer-meta">{book.year&&<span>{book.year}</span>}{book.language&&<span>{book.language.toUpperCase()}</span>}</div></div>
    </Link>
    {isAdmin&&<QuickCoverEditModal bookId={book.id} title={book.title} coverUrl={coverUrl} onSaved={handleSaved}/>} 
  </div>;
}
