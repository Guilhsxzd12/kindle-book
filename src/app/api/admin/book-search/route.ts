import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||viewer.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});

  const raw=request.nextUrl.searchParams.get("q")?.trim()||"";
  const q=raw.replace(/[%*_(),]/g," ").replace(/\s+/g," ").trim().slice(0,80);
  const normalized=q.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(normalized.length<4)return NextResponse.json({books:[]});

  const admin=createAdminSupabaseClient();
  const columns="*,categories(name)";
  const [titleResult,authorResult]=await Promise.all([
    admin.from("books").select(columns).ilike("title",`%${q}%`).limit(40),
    admin.from("books").select(columns).ilike("author",`%${q}%`).limit(40)
  ]);

  if(titleResult.error)return NextResponse.json({error:titleResult.error.message},{status:400});
  if(authorResult.error)return NextResponse.json({error:authorResult.error.message},{status:400});

  const merged=new Map<string,any>();
  for(const book of [...(titleResult.data||[]),...(authorResult.data||[])])merged.set(book.id,book);
  const books=[...merged.values()].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),"pt-BR")).slice(0,40);
  return NextResponse.json({books});
}
