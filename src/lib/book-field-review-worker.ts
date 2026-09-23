import "server-only";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
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
function suspiciousAuthor(value?:string|null){
  const raw=String(value||"").replace(/\s+/g," ").trim();const v=titleNorm(raw).replace(/\s+/g,"");
  if(!v||v==="autornaoinformado"||v==="autornaoidentificado"||v==="desconhecido"||v==="unknown")return true;
  if(raw.length>90||raw.split(" ").length>6)return true;
  if(/\b(?:microsoft|adobe|scanner|digitalizado|editora|publisher|copyright|ebook|arquivo|documento|escrito|written)\b/i.test(raw))return true;
  if(/^[A-ZÀ-Ý]{4,}$/.test(raw))return true;
  return false;
}
function goodSynopsis(value?:string|null){const v=String(value||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return v.length>=60?v:null;}
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

export async function processBookFieldReviewJob(bookId:string,field:BookReviewField){
  const db=createAdminSupabaseClient();
  const [{data:bookData,error:bookError},{data:analysis,error:analysisError}]=await Promise.all([
    db.from("books").select("*").eq("id",bookId).maybeSingle(),
    db.from("book_analysis_jobs").select("*").eq("book_id",bookId).maybeSingle()
  ]);
  if(bookError)throw new Error(bookError.message);
  if(analysisError)throw new Error(analysisError.message);
  if(!bookData){await setJob(bookId,field,{status:"error",error:"Livro não encontrado.",completed_at:new Date().toISOString()});return {bookId,field,status:"error" as JobStatus};}
  if(!analysis||analysis.status!=="completed"){await setJob(bookId,field,{status:"pending",error:"Aguardando leitura central do arquivo.",started_at:null,completed_at:null});return {bookId,field,status:"pending" as JobStatus,title:bookData.title};}

  const book=bookData as Book;
  try{
    const patch:Record<string,unknown>={};const changes:Record<string,unknown>={};
    let detectedValue:string|null=null;let detectionSource:string|null=analysis.confidence||null;

    if(field==="cover"){
      detectedValue=analysis.detected_cover_url||book.cover_url||null;detectionSource=analysis.detected_cover_source||analysis.confidence||null;
      if(!book.cover_url&&analysis.detected_cover_url){
        patch.cover_url=analysis.detected_cover_url;changes.cover=jsonChange(book.cover_url,analysis.detected_cover_url);
        await db.from("book_covers").upsert({book_id:book.id,cover_url:analysis.detected_cover_url,label:"Capa identificada pela leitura central",source:analysis.detected_cover_source||"automatic"},{onConflict:"book_id,cover_url"});
      }
    }

    if(field==="author"){
      const candidate=String(analysis.detected_author||"").trim()||null;detectedValue=candidate||book.author;
      if(candidate&&!suspiciousAuthor(candidate)&&(suspiciousAuthor(book.author)||(!same(book.author,candidate)&&analysis.confidence==="metadata"))){
        patch.author=candidate;changes.author=jsonChange(book.author,candidate);
      }
    }

    if(field==="title"){
      const candidate=String(analysis.detected_title||"").trim()||null;detectedValue=candidate||book.title;
      if(candidate&&shouldImproveTitle(book.title,candidate,String(analysis.source_format||""),String(analysis.confidence||""))){
        patch.title=candidate;patch.slug=await uniqueSlug(candidate,book.id);patch.drive_folder_letter=driveLetter(candidate);changes.title=jsonChange(book.title,candidate);
      }
    }

    if(field==="description"){
      const candidate=goodSynopsis(analysis.detected_description);const current=goodSynopsis(book.description);detectedValue=candidate||current||null;
      if(candidate&&(!current||candidate.length>current.length*1.35)){patch.description=candidate;changes.description=jsonChange(book.description,candidate);}
    }

    if(field==="language"){
      const candidate=String(analysis.detected_language||"").trim().toLowerCase()||null;detectedValue=candidate;detectionSource=analysis.detected_language_source||analysis.confidence||null;
      const current=String(book.language||"").trim().toLowerCase()||null;const reliable=analysis.detected_language_source==="metadata"||analysis.detected_language_source==="content";
      if(candidate&&candidate!==current&&reliable){
        patch.language=candidate;changes.language=jsonChange(current,candidate);
        const {data:rows}=await db.from("book_language_files").select("id,language,format,drive_file_id").eq("book_id",book.id);
        const sourceRows=(rows||[]).filter(row=>row.drive_file_id===analysis.source_file_id&&String(row.language||"").toLowerCase()!==candidate);
        for(const row of sourceRows){
          const conflict=(rows||[]).find(other=>other.id!==row.id&&other.format===row.format&&String(other.language||"").toLowerCase()===candidate);
          if(conflict)await db.from("book_language_files").delete().eq("id",row.id);
          else await db.from("book_language_files").update({language:candidate,updated_at:new Date().toISOString()}).eq("id",row.id);
        }
      }
    }

    if(field==="category"){
      const detectedId=analysis.detected_category_id as string|null;detectedValue=analysis.detected_category_name||null;
      if(detectedId){
        const {data:categoryRows}=await db.from("categories").select("id,name,slug,parent_id").order("name");
        const categories=(categoryRows||[]) as Category[];const current=categories.find(item=>item.id===book.category_id)||null;const detected=categories.find(item=>item.id===detectedId)||null;
        const canImprove=Boolean(!book.category_id||(current&&!current.parent_id&&detected?.parent_id===current.id&&detected.id!==current.id));
        if(canImprove){patch.category_id=detectedId;changes.category=jsonChange(current?.name||null,detected?.name||analysis.detected_category_name||detectedId);}
      }
    }

    if(Object.keys(patch).length){patch.updated_at=new Date().toISOString();const {error}=await db.from("books").update(patch).eq("id",book.id);if(error)throw new Error(error.message);}
    await setJob(bookId,field,{status:"completed",detected_value:detectedValue,detection_source:detectionSource,changes,error:null,completed_at:new Date().toISOString()});
    return {bookId,field,status:"completed" as JobStatus,title:String(patch.title||book.title),detectedValue,changes,reusedAnalysis:true};
  }catch(error){
    const {data:job}=await db.from("book_field_review_jobs").select("attempts").eq("book_id",bookId).eq("field",field).maybeSingle();
    const attempts=Number(job?.attempts||1);const final=attempts>=3;
    await setJob(bookId,field,{status:final?"error":"pending",error:error instanceof Error?error.message:"Falha ao aplicar revisão.",completed_at:final?new Date().toISOString():null});
    return {bookId,field,status:(final?"error":"pending") as JobStatus,title:book.title,error:error instanceof Error?error.message:"Falha ao aplicar revisão."};
  }
}

export async function processNextBookFieldReviewJob(field?:BookReviewField|null){
  const db=createAdminSupabaseClient();const {data,error}=await db.rpc("claim_next_book_field_review_job",{requested_field:field||null});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row?.book_id||!row?.field)return null;
  return processBookFieldReviewJob(row.book_id,row.field as BookReviewField);
}
export async function processBookFieldReviewBatch(limit=1,field?:BookReviewField|null){
  const safe=Math.max(1,Math.min(20,Math.floor(limit)||1));const results=[];
  for(let i=0;i<safe;i++){const result=await processNextBookFieldReviewJob(field);if(!result)break;results.push(result);}
  return results;
}
