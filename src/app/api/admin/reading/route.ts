import {NextRequest,NextResponse} from "next/server";
import {getApiViewer} from "@/lib/auth";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
import {processBookReadingBatch} from "@/lib/book-reading-worker";
import {processBookFieldReviewBatch,type BookReviewField} from "@/lib/book-field-review-worker";

const fields:BookReviewField[]=["cover","author","category","title","description","language"];
const fieldSet=new Set<BookReviewField>(fields);

async function requireAdminApi(){
  const viewer=await getApiViewer();
  return viewer.user&&viewer.profile?.role==="admin";
}

async function counts(){
  const db=createAdminSupabaseClient();
  const statuses=["pending","processing","completed","error","unavailable"] as const;
  const pairs=await Promise.all(statuses.map(async status=>{
    const {count}=await db.from("book_reading_jobs").select("book_id",{count:"exact",head:true}).eq("status",status);
    return [status,count||0] as const;
  }));
  const result=Object.fromEntries(pairs) as Record<string,number>;
  const {count:total}=await db.from("book_reading_jobs").select("book_id",{count:"exact",head:true});
  return {total:total||0,...result};
}

async function activity(){
  const db=createAdminSupabaseClient();
  const {data:jobs}=await db.from("book_reading_jobs")
    .select("book_id,status,attempts,source_format,detected_title,detected_author,detected_category_name,confidence,changes,error,started_at,completed_at,updated_at")
    .in("status",["processing","completed","error","unavailable"])
    .order("updated_at",{ascending:false})
    .limit(40);
  const ids=[...new Set((jobs||[]).map(item=>item.book_id))];
  const {data:books}=ids.length?await db.from("books").select("id,title,author,slug,cover_url").in("id",ids):{data:[] as any[]};
  const byId=new Map((books||[]).map(book=>[book.id,book]));
  return (jobs||[]).map(job=>({...job,book:byId.get(job.book_id)||null}));
}

async function fieldCounts(){
  const db=createAdminSupabaseClient();const statuses=["pending","processing","completed","error","unavailable"] as const;
  const result:Record<string,Record<string,number>>={};
  await Promise.all(fields.map(async field=>{
    const pairs=await Promise.all(statuses.map(async status=>{
      const {count}=await db.from("book_field_review_jobs").select("book_id",{count:"exact",head:true}).eq("field",field).eq("status",status);
      return [status,count||0] as const;
    }));
    const stats=Object.fromEntries(pairs) as Record<string,number>;
    const {count:total}=await db.from("book_field_review_jobs").select("book_id",{count:"exact",head:true}).eq("field",field);
    result[field]={total:total||0,...stats};
  }));
  return result;
}

async function analysisCounts(){
  const db=createAdminSupabaseClient();const statuses=["pending","processing","completed","error","unavailable"] as const;
  const pairs=await Promise.all(statuses.map(async status=>{
    const {count}=await db.from("book_analysis_jobs").select("book_id",{count:"exact",head:true}).eq("status",status);
    return [status,count||0] as const;
  }));
  const result=Object.fromEntries(pairs) as Record<string,number>;
  const {count:total}=await db.from("book_analysis_jobs").select("book_id",{count:"exact",head:true});
  return {total:total||0,...result};
}

async function overview(){
  const db=createAdminSupabaseClient();
  const [{data:summary,error:summaryError},{data:recent,error:recentError}]=await Promise.all([
    db.rpc("get_book_review_overview"),
    db.rpc("get_recent_fully_reviewed_books",{result_limit:20})
  ]);
  if(summaryError)throw new Error(summaryError.message);
  if(recentError)throw new Error(recentError.message);
  return {summary:summary||{},recent:recent||[]};
}

async function fieldActivity(field:BookReviewField){
  const db=createAdminSupabaseClient();
  const {data:jobs}=await db.from("book_field_review_jobs")
    .select("book_id,field,status,attempts,detected_value,detection_source,changes,error,started_at,completed_at,updated_at")
    .eq("field",field)
    .in("status",["processing","completed","error","unavailable"])
    .order("updated_at",{ascending:false})
    .limit(50);
  const ids=[...new Set((jobs||[]).map(item=>item.book_id))];
  const {data:books}=ids.length?await db.from("books").select("id,title,author,slug,cover_url,description,language,category_id").in("id",ids):{data:[] as any[]};
  const byId=new Map((books||[]).map(book=>[book.id,book]));
  return (jobs||[]).map(job=>({...job,book:byId.get(job.book_id)||null}));
}

export async function GET(request:NextRequest){
  if(!await requireAdminApi())return NextResponse.json({error:"Acesso negado."},{status:403});
  const raw=request.nextUrl.searchParams.get("field")||"cover";
  const selectedField=fieldSet.has(raw as BookReviewField)?raw as BookReviewField:"cover";
  const [stats,items,reviewStats,reviewItems,analysisStats,overviewData]=await Promise.all([counts(),activity(),fieldCounts(),fieldActivity(selectedField),analysisCounts(),overview()]);
  return NextResponse.json({stats,items,reviewStats,reviewItems,analysisStats,overview:overviewData.summary,recentFullyReviewed:overviewData.recent,selectedField,updatedAt:new Date().toISOString()});
}

export async function POST(request:NextRequest){
  if(!await requireAdminApi())return NextResponse.json({error:"Acesso negado."},{status:403});
  let body:any={};try{body=await request.json();}catch{}
  const db=createAdminSupabaseClient();

  if(body.action==="queue-field"){
    const field=String(body.field||"") as BookReviewField;
    if(!fieldSet.has(field))return NextResponse.json({error:"Campo de revisão inválido."},{status:400});
    const {data,error}=await db.rpc("queue_books_for_field_review",{review_field:field});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,field,queued:Number(data||0)});
  }

  if(body.action==="retry-field-errors"){
    const field=String(body.field||"") as BookReviewField;
    if(!fieldSet.has(field))return NextResponse.json({error:"Campo de revisão inválido."},{status:400});
    const now=new Date().toISOString();
    const {error}=await db.from("book_field_review_jobs").update({status:"pending",attempts:0,error:null,started_at:null,completed_at:null,queued_at:now,updated_at:now}).eq("field",field).eq("status","error");
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  if(body.action==="process-field"){
    const field=String(body.field||"") as BookReviewField;
    if(!fieldSet.has(field))return NextResponse.json({error:"Campo de revisão inválido."},{status:400});
    const limit=Math.max(1,Math.min(12,Number(body.limit)||3));
    const results=await processBookFieldReviewBatch(limit,field);
    return NextResponse.json({results});
  }

  if(body.action==="retry-errors"){
    const {error}=await db.from("book_reading_jobs").update({status:"pending",attempts:0,error:null,started_at:null,completed_at:null,queued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("status","error");
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  if(body.action==="review-languages"){
    const {data,error}=await db.rpc("queue_books_for_field_review",{review_field:"language"});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,queued:Number(data||0)});
  }

  const limit=Math.max(1,Math.min(3,Number(body.limit)||1));
  const results=await processBookReadingBatch(limit);
  return NextResponse.json({results});
}
