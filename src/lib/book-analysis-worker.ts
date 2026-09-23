import "server-only";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
import {fetchDriveFile,fetchDriveThumbnail,uploadCatalogCoverBytes} from "@/lib/google-drive";
import {identifyBookFromUpload} from "@/lib/book-identification";
import {guessCategoryId} from "@/lib/category-match";
import type {Book,Category} from "@/lib/types";

type AnalysisStatus="pending"|"processing"|"completed"|"error"|"unavailable";

function titleNorm(value?:string|null){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
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
async function findCatalogAuthor(book:Book){
  const db=createAdminSupabaseClient();
  const words=titleNorm(book.title).split(" ").filter(w=>w.length>2).slice(0,3);if(words.length<2)return null;
  const {data}=await db.from("books").select("id,title,author").neq("id",book.id).ilike("title","%"+words.join("%")+"%").limit(40);
  const candidates=(data||[]).filter(item=>!suspiciousAuthor(item.author)).map(item=>({...item,score:titleAuthorMatchScore(book.title,item.title)})).filter(item=>item.score>=0.72).sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  const best=candidates[0];const competing=candidates.find(item=>titleAuthorMatchScore(best.author,item.author)<0.82&&item.score>=best.score-0.04);
  if(competing)return null;
  const sameAuthor=candidates.filter(item=>titleAuthorMatchScore(best.author,item.author)>=0.82&&item.score>=best.score-0.08).sort((a,b)=>b.author.length-a.author.length);
  return (sameAuthor[0]?.author||best.author).trim();
}
async function setAnalysis(bookId:string,patch:Record<string,unknown>){
  const db=createAdminSupabaseClient();
  await db.from("book_analysis_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("book_id",bookId);
}

export async function processBookAnalysisJob(bookId:string){
  const db=createAdminSupabaseClient();
  const {data:bookData,error:bookError}=await db.from("books").select("*").eq("id",bookId).maybeSingle();
  if(bookError)throw new Error(bookError.message);
  if(!bookData){await setAnalysis(bookId,{status:"error",error:"Livro não encontrado.",completed_at:new Date().toISOString()});return {bookId,status:"error" as AnalysisStatus};}
  const book=bookData as Book;const source=chooseSource(book);
  if(!source){await setAnalysis(bookId,{status:"unavailable",error:"Nenhum PDF ou EPUB disponível.",completed_at:new Date().toISOString()});return {bookId,status:"unavailable" as AnalysisStatus,title:book.title};}

  try{
    await setAnalysis(bookId,{source_file_id:source.id,source_file_name:source.name,source_format:source.format});
    const response=await fetchDriveFile(source.id);const length=Number(response.headers.get("content-length")||0);
    if(length>120*1024*1024)throw new Error("Arquivo maior que 120 MB; análise ignorada.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const identified=await identifyBookFromUpload(source.name,source.mime,bytes,{title:book.title,author:book.author});

    let detectedAuthor=identified.author||null;
    if(suspiciousAuthor(detectedAuthor)||suspiciousAuthor(book.author)){
      const catalogAuthor=await findCatalogAuthor(book);
      if(catalogAuthor&&!suspiciousAuthor(catalogAuthor))detectedAuthor=catalogAuthor;
    }

    const {data:categoryRows}=await db.from("categories").select("id,name,slug,parent_id").order("name");
    const categories=(categoryRows||[]) as Category[];
    const detectedCategoryId=guessCategoryId(categories,identified.subjects||[],identified.title,identified.description||"",detectedAuthor||book.author);
    const detectedCategory=categories.find(item=>item.id===detectedCategoryId)||null;

    let coverUrl:string|null=null;let coverSource:string|null=null;
    if(identified.embeddedCover){
      try{
        const ext=identified.embeddedCover.extension||"jpg";
        const uploaded=await uploadCatalogCoverBytes(book.id+"-analysis-cover."+ext,identified.embeddedCover.bytes,identified.embeddedCover.mimeType);
        coverUrl="/api/covers/"+encodeURIComponent(uploaded.id);coverSource="embedded-file";
      }catch(error){console.warn("[book-analysis] embedded cover failed",{bookId,error:error instanceof Error?error.message:"unknown"});}
    }
    if(!coverUrl&&source.format==="pdf"){
      try{
        const thumb=await fetchDriveThumbnail(source.id);
        if(thumb){const uploaded=await uploadCatalogCoverBytes(book.id+"-analysis-page-1."+thumb.extension,thumb.bytes,thumb.mimeType);coverUrl="/api/covers/"+encodeURIComponent(uploaded.id);coverSource="pdf-page-1";}
      }catch(error){console.warn("[book-analysis] PDF cover failed",{bookId,error:error instanceof Error?error.message:"unknown"});}
    }
    if(!coverUrl&&identified.coverUrl){coverUrl=identified.coverUrl;coverSource="metadata-fallback";}

    await setAnalysis(bookId,{
      status:"completed",
      source_file_id:source.id,
      source_file_name:source.name,
      source_format:source.format,
      detected_title:identified.title,
      detected_author:detectedAuthor,
      detected_description:identified.description,
      detected_language:identified.language,
      detected_language_source:identified.languageSource,
      detected_isbn:identified.isbn,
      detected_category_id:detectedCategoryId,
      detected_category_name:detectedCategory?.name||null,
      detected_cover_url:coverUrl,
      detected_cover_source:coverSource,
      confidence:identified.confidence,
      subjects:identified.subjects||[],
      error:null,
      completed_at:new Date().toISOString()
    });
    return {bookId,status:"completed" as AnalysisStatus,title:book.title,sourceFormat:source.format,language:identified.language,author:detectedAuthor,category:detectedCategory?.name||null};
  }catch(error){
    const {data:job}=await db.from("book_analysis_jobs").select("attempts").eq("book_id",bookId).maybeSingle();
    const attempts=Number(job?.attempts||1);const final=attempts>=3;
    await setAnalysis(bookId,{status:final?"error":"pending",error:error instanceof Error?error.message:"Falha na análise.",completed_at:final?new Date().toISOString():null});
    return {bookId,status:(final?"error":"pending") as AnalysisStatus,title:book.title,error:error instanceof Error?error.message:"Falha na análise."};
  }
}

export async function claimAnalysisJobs(limit=4){
  const db=createAdminSupabaseClient();const ids:string[]=[];const safe=Math.max(1,Math.min(4,Math.floor(limit)||1));
  for(let i=0;i<safe;i++){
    const {data,error}=await db.rpc("claim_next_book_analysis_job");if(error)throw new Error(error.message);
    const row=Array.isArray(data)?data[0]:data;if(!row?.book_id)break;ids.push(row.book_id);
  }
  return ids;
}

export async function processBookAnalysisBatch(limit=4){
  const ids=await claimAnalysisJobs(limit);
  if(!ids.length)return [];
  return Promise.all(ids.map(id=>processBookAnalysisJob(id)));
}
