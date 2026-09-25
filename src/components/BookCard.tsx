"use client";

import {useState} from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { bookPath } from "@/lib/site";
import { QuickCoverEditModal } from "@/components/QuickCoverEditModal";

export function BookCard({book,isAdmin=false}:{book:Book;isAdmin?:boolean}){
  const [coverUrl,setCoverUrl]=useState(book.cover_url);
  return <div className={"book-card-admin-wrap"+(isAdmin?" is-admin":"")}>
    <Link className="book-card catalog-book-card" href={bookPath(book.slug)} prefetch={false}>
      <div className="book-cover-wrap">{coverUrl?<img className="cover" src={coverUrl} alt={`Capa de ${book.title}`} loading="lazy" decoding="async"/>:<div className="cover-fallback">{book.title}</div>}{book.categories?.name&&<span className="floating-category">{book.categories.name}</span>}</div>
      <div className="book-body"><h2 className="book-title">{book.title}</h2><div className="meta">{book.author}</div><div className="book-footer-meta">{book.year&&<span>{book.year}</span>}{book.language&&<span>{book.language.toUpperCase()}</span>}</div></div>
    </Link>
    {isAdmin&&<QuickCoverEditModal bookId={book.id} title={book.title} coverUrl={coverUrl} onSaved={setCoverUrl}/>}
  </div>;
}
