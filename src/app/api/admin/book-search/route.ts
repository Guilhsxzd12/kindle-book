import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||viewer.profile?.role!=="admin")return NextResponse.json({error:"Acesso negado."},{status:403});
  const raw=request.nextUrl.searchParams.get("q")?.trim()||"";
  const q=raw.replace(/[,()%*]/g," ").replace(/\s+/g," ").trim().slice(0,80);
  if(q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").length<4)return NextResponse.json({books:[]});
  const admin=createAdminSupabaseClient();
  const {data,error}=await admin.from("books").select("*,categories(name)").or(`title.ilike.%${q}%,author.ilike.%${q}%`).order("title",{ascending:true}).limit(40);
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({books:data||[]});
}
