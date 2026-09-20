import "server-only";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
import {fetchDriveFile,uploadCatalogCoverBytes} from "@/lib/google-drive";
import {identifyBookFromUpload} from "@/lib/book-identification";
import {guessCategoryId} from "@/lib/category-match";
import {driveLetter,slugifyTitle} from "@/lib/slugify";
import type {Book,Category} from "@/lib/types";

type JobStatus="pending"|"processing"|"completed"|"error"|"unavailable";

function genericAuthor(value?:string|null){
  const v=(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");
  return !v||v==="autornaoinformado"||v==="autornaoidentificado"||v==="desconhecido"||v==="unknown";
}
function genericTitle(value?:string|null){
  const v=(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  return !v||/^(sem titulo|livro enviado|livro sem titulo|unknown|arquivo|ebook|pdf)\b/.test(v);
}
function same(a?:string|null,b?:string|null){return String(a||"").trim()===String(b||"").trim();}
function titleNorm(value?:string|null){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function titleLooksNoisy(value?:string|null){return /(?:z[-_ ]?lib|1lib|canal\s*@|\.(?:pdf|epub)|\s--\s|\bby\s+[A-ZÀ-Ý]|^[\[\{]|^\d{1,3}[ _-]+\d{1,3}[ _-]+)/i.test(String(value||""));}
function shouldImproveTitle(current:string,detected:string,format:string,confidence:string){
  if(genericTitle(current))return true;
  const a=titleNorm(current),b=titleNorm(detected);if(!a||!b||a===b)return false;
  if(b.includes(a)&&b.length<=a.length+8)return false;
  if(a.includes(b)&&b.length>=4)return true;
  if(format==="epub"&&confidence==="metadata"&&titleLooksNoisy(current))return true;
  return false;
}
function jsonChange(from:unknown,to:unknown){return {from:from??null,to:to??null};}

async function uniqueSlug(title:string,excludeId:string){
  const db=createAdminSupabaseClient();const base=slugifyTitle(title).toLowerCase()||"livro";
  for(let suffix=0;suffix<100;suffix++){
    const candidate=suffix===0?base:`${base}-${suffix+1}`;
    const {data}=await db.from("books").select("id").eq("slug",candidate).neq("id",excludeId).maybeSingle();
    if(!data)return candidate;
  }
  return `${base}-${Date.now()}`;
}

function chooseSource(book:Book){
  if(book.kindle_drive_file_id)return {id:book.kindle_drive_file_id,name:book.kindle_file_name||book.file_name||`${book.title}.epub`,mime:"application/epub+zip",format:"epub"};
  if(book.drive_file_id&&(book.mime_type==="application/epub+zip"||book.file_name?.toLowerCase().endsWith(".epub")))return {id:book.drive_file_id,name:book.file_name||`${book.title}.epub`,mime:"application/epub+zip",format:"epub"};
  if(book.reading_pdf_drive_file_id)return {id:book.reading_pdf_drive_file_id,name:book.reading_pdf_file_name||book.file_name||`${book.title}.pdf`,mime:"application/pdf",format:"pdf"};
  if(book.drive_file_id)return {id:book.drive_file_id,name:book.file_name||`${book.title}.pdf`,mime:book.mime_type||"application/pdf",format:(book.mime_type||"").includes("epub")?"epub":"pdf"};
  return null;
}

async function setJob(bookId:string,patch:Record<string,unknown>){
  const db=createAdminSupabaseClient();
  await db.from("book_reading_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("book_id",bookId);
}

export async function processBookReadingJob(bookId:string){
  const db=createAdminSupabaseClient();
  const {data:bookData,error:bookError}=await db.from("books").select("*").eq("id",bookId).maybeSingle();
  if(bookError)throw new Error(bookError.message);
  if(!bookData){await setJob(bookId,{status:"error",error:"Livro não encontrado.",completed_at:new Date().toISOString()});return {bookId,status:"error" as JobStatus};}
  const book=bookData as Book;
  const source=chooseSource(book);
  if(!source){
    await setJob(bookId,{status:"unavailable",error:"Nenhum PDF ou EPUB disponível para leitura.",completed_at:new Date().toISOString()});
    return {bookId,status:"unavailable" as JobStatus,title:book.title};
  }

  try{
    await setJob(bookId,{source_file_id:source.id,source_file_name:source.name,source_format:source.format});
    const response=await fetchDriveFile(source.id);
    const length=Number(response.headers.get("content-length")||0);
    if(length>120*1024*1024)throw new Error("Arquivo maior que 120 MB; leitura automática foi ignorada para proteger o servidor.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const identified=await identifyBookFromUpload(source.name,source.mime,bytes,{title:book.title,author:book.author});

    const {data:categoryRows}=await db.from("categories").select("id,name,slug,parent_id").order("name");
    const categories=(categoryRows||[]) as Category[];
    const detectedCategoryId=guessCategoryId(categories,identified.subjects||[],identified.title,identified.description||"");
    const detectedCategoryName=categories.find(item=>item.id===detectedCategoryId)?.name||null;

    const patch:Record<string,unknown>={};
    const changes:Record<string,unknown>={};

    if(identified.title&&shouldImproveTitle(book.title,identified.title,source.format,identified.confidence)){
      patch.title=identified.title;patch.slug=await uniqueSlug(identified.title,book.id);patch.drive_folder_letter=driveLetter(identified.title);changes.title=jsonChange(book.title,identified.title);
    }
    if(identified.author&&!genericAuthor(identified.author)&&(genericAuthor(book.author)||(source.format==="epub"&&identified.confidence==="metadata"&&!same(book.author,identified.author)))){
      patch.author=identified.author;changes.author=jsonChange(book.author,identified.author);
    }

    let automaticCoverUrl:string|null=null;
    let automaticCoverSource:string|null=null;
    if(!book.cover_url&&identified.embeddedCover){
      try{
        const extension=identified.embeddedCover.extension||"jpg";
        const uploaded=await uploadCatalogCoverBytes(book.id+"-cover."+extension,identified.embeddedCover.bytes,identified.embeddedCover.mimeType);
        automaticCoverUrl="/api/covers/"+encodeURIComponent(uploaded.id);automaticCoverSource="embedded-file";
      }catch(error){console.warn("[book-reading] embedded cover upload failed",{bookId:book.id,error:error instanceof Error?error.message:"unknown"});}
    }
    if(!book.cover_url&&!automaticCoverUrl&&identified.coverUrl){automaticCoverUrl=identified.coverUrl;automaticCoverSource="metadata";}
    if(automaticCoverUrl){patch.cover_url=automaticCoverUrl;changes.cover=jsonChange(book.cover_url,automaticCoverUrl);}

    if(!book.year&&identified.year){patch.year=identified.year;changes.year=jsonChange(null,identified.year);}
    if(!book.pages&&identified.pages){patch.pages=identified.pages;changes.pages=jsonChange(null,identified.pages);}
    if(!book.language&&identified.language){patch.language=identified.language;changes.language=jsonChange(null,identified.language);}
    if(!book.category_id&&detectedCategoryId){patch.category_id=detectedCategoryId;changes.category=jsonChange(null,detectedCategoryName||detectedCategoryId);}

    if(Object.keys(patch).length){
      patch.updated_at=new Date().toISOString();
      const {error:updateError}=await db.from("books").update(patch).eq("id",book.id);
      if(updateError)throw new Error(updateError.message);
    }
    if(automaticCoverUrl){
      await db.from("book_covers").upsert({book_id:book.id,cover_url:automaticCoverUrl,label:"Capa identificada automaticamente",source:automaticCoverSource||"automatic"},{onConflict:"book_id,cover_url"});
    }

    await setJob(bookId,{
      status:"completed",
      detected_title:identified.title,
      detected_author:identified.author,
      detected_isbn:identified.isbn,
      detected_category_id:detectedCategoryId,
      detected_category_name:detectedCategoryName,
      confidence:identified.confidence,
      changes,
      error:null,
      completed_at:new Date().toISOString()
    });
    return {bookId,status:"completed" as JobStatus,title:identified.title,author:identified.author,category:detectedCategoryName,confidence:identified.confidence,changes};
  }catch(error){
    const {data:job}=await db.from("book_reading_jobs").select("attempts").eq("book_id",bookId).maybeSingle();
    const attempts=Number(job?.attempts||1);const final=attempts>=3;
    await setJob(bookId,{status:final?"error":"pending",error:error instanceof Error?error.message:"Falha ao ler o livro.",completed_at:final?new Date().toISOString():null});
    return {bookId,status:(final?"error":"pending") as JobStatus,title:book.title,error:error instanceof Error?error.message:"Falha ao ler o livro."};
  }
}

export async function processNextBookReadingJob(){
  const db=createAdminSupabaseClient();
  const {data,error}=await db.rpc("claim_next_book_reading_job");
  if(error)throw new Error(error.message);
  const row=Array.isArray(data)?data[0]:data;
  const bookId=row?.book_id;
  if(!bookId)return null;
  return processBookReadingJob(bookId);
}

export async function processBookReadingBatch(limit=1){
  const safe=Math.max(1,Math.min(5,Math.floor(limit)||1));const results=[];
  for(let index=0;index<safe;index++){
    const result=await processNextBookReadingJob();if(!result)break;results.push(result);
  }
  return results;
}
