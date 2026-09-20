import {NextRequest,NextResponse} from "next/server";
import {getApiViewer} from "@/lib/auth";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";

async function allowed(){
  const viewer=await getApiViewer();
  return Boolean(viewer.user&&viewer.profile?.role==="admin");
}

function cleanQuery(value:string){
  return value.replace(/[%*_(),]/g," ").replace(/\s+/g," ").trim().slice(0,80);
}

export async function GET(request:NextRequest){
  if(!await allowed())return NextResponse.json({error:"Acesso negado."},{status:403});
  const admin=createAdminSupabaseClient();
  const q=cleanQuery(request.nextUrl.searchParams.get("q")||"");

  if(!q){
    const {data,error,count}=await admin.from("books")
      .select("*",{count:"exact"})
      .eq("needs_correction",true)
      .order("updated_at",{ascending:false})
      .limit(120);
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({books:data||[],total:count||0});
  }

  const [titleResult,authorResult,totalResult]=await Promise.all([
    admin.from("books").select("*").eq("needs_correction",true).ilike("title","%"+q+"%").limit(80),
    admin.from("books").select("*").eq("needs_correction",true).ilike("author","%"+q+"%").limit(80),
    admin.from("books").select("id",{count:"exact",head:true}).eq("needs_correction",true)
  ]);
  if(titleResult.error)return NextResponse.json({error:titleResult.error.message},{status:400});
  if(authorResult.error)return NextResponse.json({error:authorResult.error.message},{status:400});

  const merged=new Map<string,any>();
  for(const book of [...(titleResult.data||[]),...(authorResult.data||[])])merged.set(book.id,book);
  const books=[...merged.values()].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),"pt-BR")).slice(0,120);
  return NextResponse.json({books,total:totalResult.count||0});
}
