import type { Metadata } from "next";
import { notFound,permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { KindleShareButton,type DownloadLanguage } from "@/components/KindleShareButton";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { BookCard } from "@/components/BookCard";
import { HorizontalBookSlider } from "@/components/HorizontalBookSlider";
import { BookViewTracker } from "@/components/BookViewTracker";
import { requireApproved } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Book } from "@/lib/types";

function isPdf(book:Book){return book.mime_type==="application/pdf"||book.file_name.toLowerCase().endsWith(".pdf");}
function isEpub(book:Book){return book.mime_type==="application/epub+zip"||book.file_name.toLowerCase().endsWith(".epub");}
function languageName(code:string){return ({pt:"Português",en:"Inglês",es:"Espanhol",fr:"Francês",it:"Italiano",de:"Alemão",ja:"Japonês",zh:"Chinês"} as Record<string,string>)[code]||code.toUpperCase();}
function languageOptions(rows:{language:string;format:string}[],format:"pdf"|"epub",fallback?:string|null):DownloadLanguage[]{const set=new Set(rows.filter(r=>r.format===format).map(r=>r.language.toLowerCase()));if(fallback)set.add(fallback.toLowerCase());return [...set].map(code=>({code,label:languageName(code)})).sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));}

async function findPublishedBook(db:SupabaseClient,lookupColumn:"id"|"slug",value:string){
  const result=await db.from("books").select("*").eq(lookupColumn,value).eq("published",true).limit(1);
  if(result.error){console.error("[book_detail_lookup]",{lookupColumn,value,code:result.error.code,message:result.error.message});return null;}
  return (result.data?.[0]||null) as Book|null;
}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;return {title:slug.split("-").map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ")};}

export default async function BookPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const {supabase,user,profile}=await requireApproved();
  const catalogDb=createAdminSupabaseClient();
  const lookupColumn=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)?"id":"slug";

  let book=await findPublishedBook(supabase,lookupColumn,slug);
  if(!book)book=await findPublishedBook(catalogDb,lookupColumn,slug);
  if(!book)notFound();
  if(lookupColumn==="id"&&book.slug)permanentRedirect(`/livro/${encodeURIComponent(book.slug)}`);

  let categoryName:string|null=null;
  if(book.category_id){
    const categoryResult=await catalogDb.from("categories").select("name").eq("id",book.category_id).limit(1);
    categoryName=categoryResult.data?.[0]?.name||null;
  }
  const b={...book,categories:categoryName?{name:categoryName}:null} as Book;

  const [{data:favorite},{data:relatedData},{data:fileRows}]=await Promise.all([
    supabase.from("favorites").select("book_id").eq("user_id",user.id).eq("book_id",b.id).maybeSingle(),
    catalogDb.from("books").select("*").eq("published",true).neq("id",b.id).limit(40),
    supabase.from("book_language_files").select("language,format").eq("book_id",b.id)
  ]);

  const relatedBase=(relatedData||[]) as Book[];
  const related=relatedBase.sort((a,c)=>{const ar=(a.author||"").toLowerCase()===(b.author||"").toLowerCase()?2:a.category_id&&a.category_id===b.category_id?1:0;const cr=(c.author||"").toLowerCase()===(b.author||"").toLowerCase()?2:c.category_id&&c.category_id===b.category_id?1:0;return cr-ar;}).filter(item=>(item.author||"").toLowerCase()===(b.author||"").toLowerCase()||Boolean(item.category_id&&item.category_id===b.category_id)).slice(0,12);
  const rows=(fileRows||[]) as {language:string;format:string}[];const fallbackLanguage=b.language||"pt";const rawHasPdf=isPdf(b)||Boolean(b.reading_pdf_drive_file_id);const rawHasEpub=isEpub(b)||Boolean(b.kindle_drive_file_id);const pdfLanguages=languageOptions(rows,"pdf",rawHasPdf?fallbackLanguage:null);const epubLanguages=languageOptions(rows,"epub",rawHasEpub?fallbackLanguage:null);const hasPdf=pdfLanguages.length>0;const hasEpub=epubLanguages.length>0;
  const allLanguages=[...new Map([...pdfLanguages,...epubLanguages].map(x=>[x.code,x])).values()];

  return <AppShell><BookViewTracker bookId={b.id}/><main className="shell-width detail-page"><Link className="back-link" href="/biblioteca">← Voltar ao acervo</Link><section className="detail">
    <div className="detail-cover-col">{b.cover_url?<img className="cover" src={b.cover_url} alt={`Capa de ${b.title}`}/>:<div className="cover-fallback">{b.title}</div>}<div className="detail-small-meta">{b.categories?.name&&<span>{b.categories.name}</span>}{allLanguages.map(lang=><span key={lang.code}>{lang.code.toUpperCase()}</span>)}</div></div>
    <div className="detail-copy"><span className="eyebrow">KINDLE BOOKS</span><h1>{b.title}</h1><h2>{b.author}</h2>
      <div className="format-note"><strong>Escolha o formato</strong><span>{allLanguages.length>1?"Há mais de um idioma disponível. Depois de escolher o formato, selecione o idioma desejado.":"PDF para leitura direta ou EPUB para Kindle e outros aplicativos compatíveis."}</span></div>
      <div className="detail-actions">{hasPdf&&<PdfDownloadButton bookId={b.id} languages={pdfLanguages}/>} {hasEpub&&<KindleShareButton id={b.id} title={b.title} author={b.author} source="catalog" languages={epubLanguages}/>}<FavoriteButton bookId={b.id} initial={Boolean(favorite)}/>{profile.role==="admin"&&<><Link className="btn ghost" href={`/admin/capas/${b.id}`}>Gerenciar capas</Link><Link className="btn ghost" href={`/admin/idiomas/${b.id}`}>Gerenciar idiomas</Link></>}</div>
      {!hasPdf&&!hasEpub&&<div className="notice">Este título está temporariamente sem arquivo disponível.</div>}
      <div className="synopsis-block"><span className="eyebrow">SOBRE O LIVRO</span><div className="prose">{b.description||"Sinopse não informada."}</div></div></div>
  </section>
  {related.length>0&&<section className="related-section"><div className="section-heading"><div><span className="eyebrow">VOCÊ TAMBÉM PODE GOSTAR</span><h2>Livros relacionados</h2><p>Arraste para o lado para ver títulos do mesmo autor ou categoria.</p></div></div><HorizontalBookSlider>{related.map(item=><BookCard key={item.id} book={item}/>)}</HorizontalBookSlider></section>}
  </main></AppShell>;
}
