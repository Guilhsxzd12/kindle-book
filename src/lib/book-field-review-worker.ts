import "server-only";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
import {fetchDriveFile,fetchDriveThumbnail,uploadCatalogCoverBytes} from "@/lib/google-drive";
import {identifyBookFromUpload} from "@/lib/book-identification";
import {guessCategoryId} from "@/lib/category-match";
import {driveLetter,slugifyTitle} from "@/lib/slugify";
import type {Book,Category} from "@/lib/types";

export type BookReviewField="cover"|"author"|"category"|"title"|"description"|"language";
type JobStatus="pending"|"processing"|"completed"|"error"|"unavailable";

function jsonChange(from:unknown,to:unknown){return {from:from??null,to:to??null};}
function same(a?:string|null,b?:string|null){return String(a||"").trim()===String(b||"").trim();}
function titleNorm(value?:string|null){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function genericTitle(value?:string|null){const v=titleNorm(value);return !v||/^(sem titulo|livro enviado|livro sem titulo|unknown|arquivo|ebook|pdf)\b/.test(v);}
function titleLooksNoisy(value?:string|null){return /(?:z[-_ ]?lib|1lib|canal\s*@|\.(?:pdf|epub)|\s--\s|\bby\s+[A-ZÀ-Ý]|^[\[\{\(]|^\d{1,3}[ _-]+\d{1,3}[ _-]+)/i.test(String(value||""));}
function shouldImproveTitle(current:string,detected:string,format:string,confidence:string){
  if(genericTitle(current))return true;
  const a=titleNorm(current),b=titleNorm(detected);if(!a||!b||a===b)return false;
  if(b.includes(a)&&b.length<=a.length+8)return false;
  if(a.includes(b)&&b.length>=4)return true;
  if(format==="epub"&&confidence==="metadata"&&titleLooksNoisy(current))return true;
  return false;
}
function genericAuthor(value?:string|null){
  const v=titleNorm(value).replace(/\s+/g,"");
  return !v||v==="autornaoinformado"||v==="autornaoidentificado"||v==="desconhecido"||v==="unknown"||/^\d+[ao]?serie$/i.test(v)||/^(serie|volume|vol|edicao|edition|scan|scanner|adobe|microsoftword|qp)\d*$/i.test(v);
}
function suspiciousAuthor(value?:string|null){
  const raw=String(value||"").replace(/\s+/g," ").trim();if(genericAuthor(raw))return true;
  if(raw.length>90)return true;
  if(/\b(?:microsoft|adobe|scanner|digitalizado|editora|publisher|copyright|ebook|arquivo|documento|escrito|written)\b/i.test(raw))return true;
  if(raw.split(" ").length>6)return true;
  if(/^[A-ZÀ-Ý]{4,}$/.test(raw))return true;
  return false;
}
function titleAuthorMatchScore(a?:string|null,b?:string|null){
  const x=titleNorm(a),y=titleNorm(b);if(!x||!y)return 0;if(x===y)return 1;
  if(x.startsWith(y+" ")||y.startsWith(x+" ")||x.includes(y)||y.includes(x))return 0.94;
  const xw=new Set(x.split(" ").filter(w=>w.length>2));const yw=new Set(y.split(" ").filter(w=>w.length>2));
  if(!xw.size||!yw.size)return 0;let hits=0;for(const w of xw)if(yw.has(w))hits++;
  return hits/Math.min(xw.size,yw.size);
}
function chooseSource(book:Book){
  if(book.kindle_drive_file_id)return {id:book.kindle_drive_file_id,name:book.kindle_file_name||book.file_name||`${book.title}.epub`,mime:"application/epub+zip",format:"epub" as const};
  if(book.drive_file_id&&(book.mime_type==="application/epub+zip"||book.file_name?.toLowerCase().endsWith(".epub")))return {id:book.drive_file_id,name:book.file_name||`${book.title}.epub`,mime:"application/epub+zip",format:"epub" as const};
  if(book.reading_pdf_drive_file_id)return {id:book.reading_pdf_drive_file_id,name:book.reading_pdf_file_name||book.file_name||`${book.title}.pdf`,mime:"application/pdf",format:"pdf" as const};
  if(book.drive_file_id)return {id:book.drive_file_id,name:book.file_name||`${book.title}.pdf`,mime:book.mime_type||"application/pdf",format:(book.mime_type||"").includes("epub")?"epub" as const:"pdf" as const};
  return null;
}
async function setJob(bookId:string,field:BookReviewField,patch:Record<string,unknown>){
  const db=createAdminSupabaseClient();
  await db.from("book_field_review_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("book_id",bookId).eq("field",field);
}
async function uniqueSlug(title:string,excludeId:string){
  const db=createAdminSupabaseClient();const base=slugifyTitle(title).toLowerCase()||"livro";
  for(let suffix=0;suffix<100;suffix++){
    const candidate=suffix===0?base:`${base}-${suffix+1}`;
    const {data}=await db.from("books").select("id").eq("slug",candidate).neq("id",excludeId).maybeSingle();
    if(!data)return candidate;
  }
  return `${base}-${Date.now()}`;
}
async function findCatalogAuthor(book:Book){
  const db=createAdminSupabaseClient();
  const words=titleNorm(book.title).split(" ").filter(w=>w.length>2).slice(0,3);
  if(words.length<2)return null;
  const {data}=await db.from("books").select("id,title,author").neq("id",book.id).ilike("title","%"+words.join("%")+"%").limit(40);
  const candidates=(data||[]).filter(item=>!suspiciousAuthor(item.author)).map(item=>({...item,score:titleAuthorMatchScore(book.title,item.title)})).filter(item=>item.score>=0.72).sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  const best=candidates[0];const competing=candidates.find(item=>titleAuthorMatchScore(best.author,item.author)<0.82&&item.score>=best.score-0.04);
  if(competing)return null;
  const sameAuthor=candidates.filter(item=>titleAuthorMatchScore(best.author,item.author)>=0.82&&item.score>=best.score-0.08).sort((a,b)=>b.author.length-a.author.length);
  return (sameAuthor[0]?.author||best.author).trim();
}
function goodSynopsis(value?:string|null){const v=String(value||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return v.length>=60?v:null;}

export async function processBookFieldReviewJob(bookId:string,field:BookReviewField){
  const db=createAdminSupabaseClient();
  const {data:bookData,error:bookError}=await db.from("books").select("*").eq("id",bookId).maybeSingle();
  if(bookError)throw new Error(bookError.message);
  if(!bookData){await setJob(bookId,field,{status:"error",error:"Livro não encontrado.",completed_at:new Date().toISOString()});return {bookId,field,status:"error" as JobStatus};}
  const book=bookData as Book;const source=chooseSource(book);
  if(!source){await setJob(bookId,field,{status:"unavailable",error:"Nenhum PDF ou EPUB disponível.",completed_at:new Date().toISOString()});return {bookId,field,status:"unavailable" as JobStatus,title:book.title};}

  try{
    const response=await fetchDriveFile(source.id);const length=Number(response.headers.get("content-length")||0);
    if(length>120*1024*1024)throw new Error("Arquivo maior que 120 MB; revisão ignorada.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const identified=await identifyBookFromUpload(source.name,source.mime,bytes,{title:book.title,author:book.author});
    const patch:Record<string,unknown>={};const changes:Record<string,unknown>={};
    let detectedValue:string|null=null;let detectionSource:string|null=identified.confidence;

    if(field==="cover"){
      detectedValue=book.cover_url||identified.coverUrl||null;
      if(!book.cover_url){
        let coverUrl:string|null=null;let coverSource:string|null=null;
        if(identified.embeddedCover){
          try{const ext=identified.embeddedCover.extension||"jpg";const uploaded=await uploadCatalogCoverBytes(book.id+"-cover."+ext,identified.embeddedCover.bytes,identified.embeddedCover.mimeType);coverUrl="/api/covers/"+encodeURIComponent(uploaded.id);coverSource="embedded-file";}catch{}
        }
        if(!coverUrl&&source.format==="pdf"){
          try{const thumb=await fetchDriveThumbnail(source.id);if(thumb){const uploaded=await uploadCatalogCoverBytes(book.id+"-page-1."+thumb.extension,thumb.bytes,thumb.mimeType);coverUrl="/api/covers/"+encodeURIComponent(uploaded.id);coverSource="pdf-page-1";}}catch{}
        }
        if(!coverUrl&&identified.coverUrl){coverUrl=identified.coverUrl;coverSource="metadata-fallback";}
        if(coverUrl){patch.cover_url=coverUrl;changes.cover=jsonChange(book.cover_url,coverUrl);detectedValue=coverUrl;detectionSource=coverSource;await db.from("book_covers").upsert({book_id:book.id,cover_url:coverUrl,label:"Capa identificada automaticamente",source:coverSource||"automatic"},{onConflict:"book_id,cover_url"});}
      }
    }

    if(field==="author"){
      let candidate:string|null=null;
      if(identified.author&&!suspiciousAuthor(identified.author)&&(suspiciousAuthor(book.author)||(source.format==="epub"&&identified.confidence==="metadata"&&!same(book.author,identified.author))))candidate=identified.author;
      if(!candidate&&suspiciousAuthor(book.author))candidate=await findCatalogAuthor(book);
      detectedValue=candidate||identified.author||book.author;
      if(candidate&&!suspiciousAuthor(candidate)&&!same(book.author,candidate)){patch.author=candidate;changes.author=jsonChange(book.author,candidate);}
    }

    if(field==="title"){
      detectedValue=identified.title||book.title;
      if(identified.title&&shouldImproveTitle(book.title,identified.title,source.format,identified.confidence)){
        patch.title=identified.title;patch.slug=await uniqueSlug(identified.title,book.id);patch.drive_folder_letter=driveLetter(identified.title);changes.title=jsonChange(book.title,identified.title);
      }
    }

    if(field==="description"){
      const candidate=goodSynopsis(identified.description);detectedValue=candidate||book.description||null;
      const current=goodSynopsis(book.description);
      if(candidate&&(!current||candidate.length>current.length*1.35)){patch.description=candidate;changes.description=jsonChange(book.description,candidate);}
    }

    if(field==="language"){
      const candidate=String(identified.language||"").trim().toLowerCase()||null;detectedValue=candidate;
      detectionSource=identified.languageSource||identified.confidence;
      const current=String(book.language||"").trim().toLowerCase()||null;const reliable=identified.languageSource==="metadata"||identified.languageSource==="content";
      if(candidate&&candidate!==current&&reliable){
        patch.language=candidate;changes.language=jsonChange(current,candidate);
        const {data:rows}=await db.from("book_language_files").select("id,language,format,drive_file_id").eq("book_id",book.id);
        const sourceRows=(rows||[]).filter(row=>row.drive_file_id===source.id&&String(row.language||"").toLowerCase()!==candidate);
        for(const row of sourceRows){const conflict=(rows||[]).find(other=>other.id!==row.id&&other.format===row.format&&String(other.language||"").toLowerCase()===candidate);if(conflict)await db.from("book_language_files").delete().eq("id",row.id);else await db.from("book_language_files").update({language:candidate,updated_at:new Date().toISOString()}).eq("id",row.id);}
      }
    }

    if(field==="category"){
      const {data:categoryRows}=await db.from("categories").select("id,name,slug,parent_id").order("name");
      const categories=(categoryRows||[]) as Category[];
      const detectedId=guessCategoryId(categories,identified.subjects||[],identified.title,identified.description||"",identified.author||book.author);
      const detected=categories.find(item=>item.id===detectedId)||null;const current=categories.find(item=>item.id===book.category_id)||null;
      detectedValue=detected?.name||null;
      const canImprove=Boolean(detectedId&&(!book.category_id||(current&&!current.parent_id&&detected?.parent_id===current.id&&detected.id!==current.id)));
      if(canImprove&&detectedId){patch.category_id=detectedId;changes.category=jsonChange(current?.name||null,detected?.name||detectedId);}
    }

    if(Object.keys(patch).length){patch.updated_at=new Date().toISOString();const {error}=await db.from("books").update(patch).eq("id",book.id);if(error)throw new Error(error.message);}

    await setJob(bookId,field,{status:"completed",detected_value:detectedValue,detection_source:detectionSource,changes,error:null,completed_at:new Date().toISOString()});
    return {bookId,field,status:"completed" as JobStatus,title:String(patch.title||book.title),detectedValue,changes};
  }catch(error){
    const {data:job}=await db.from("book_field_review_jobs").select("attempts").eq("book_id",bookId).eq("field",field).maybeSingle();
    const attempts=Number(job?.attempts||1);const final=attempts>=3;
    await setJob(bookId,field,{status:final?"error":"pending",error:error instanceof Error?error.message:"Falha na revisão.",completed_at:final?new Date().toISOString():null});
    return {bookId,field,status:(final?"error":"pending") as JobStatus,title:book.title,error:error instanceof Error?error.message:"Falha na revisão."};
  }
}

export async function processNextBookFieldReviewJob(field?:BookReviewField|null){
  const db=createAdminSupabaseClient();const {data,error}=await db.rpc("claim_next_book_field_review_job",{requested_field:field||null});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row?.book_id||!row?.field)return null;
  return processBookFieldReviewJob(row.book_id,row.field as BookReviewField);
}
export async function processBookFieldReviewBatch(limit=1,field?:BookReviewField|null){
  const safe=Math.max(1,Math.min(5,Math.floor(limit)||1));const results=[];
  for(let i=0;i<safe;i++){const result=await processNextBookFieldReviewJob(field);if(!result)break;results.push(result);}
  return results;
}
