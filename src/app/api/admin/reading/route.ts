import {NextRequest,NextResponse} from "next/server";
import {getApiViewer} from "@/lib/auth";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";
import {processBookReadingBatch} from "@/lib/book-reading-worker";

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

export async function GET(){
  if(!await requireAdminApi())return NextResponse.json({error:"Acesso negado."},{status:403});
  const [stats,items]=await Promise.all([counts(),activity()]);
  return NextResponse.json({stats,items,updatedAt:new Date().toISOString()});
}

export async function POST(request:NextRequest){
  if(!await requireAdminApi())return NextResponse.json({error:"Acesso negado."},{status:403});
  let body:any={};try{body=await request.json();}catch{}
  const db=createAdminSupabaseClient();

  if(body.action==="retry-errors"){
    const {error}=await db.from("book_reading_jobs").update({status:"pending",attempts:0,error:null,started_at:null,completed_at:null,queued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("status","error");
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  const limit=Math.max(1,Math.min(3,Number(body.limit)||1));
  const results=await processBookReadingBatch(limit);
  return NextResponse.json({results});
}
