import {NextRequest,NextResponse} from "next/server";
import {createServerSupabaseClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const supabase=await createServerSupabaseClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Acesso negado."},{status:401});

  const q=(request.nextUrl.searchParams.get("q")||"").trim().slice(0,100);
  if(q.length<2)return NextResponse.json({items:[]});

  const {data,error}=await supabase.rpc("catalog_search_suggestions",{p_search:q,p_limit:8});
  if(error){
    console.error("[catalog_search_suggestions]",{code:error.code,message:error.message});
    return NextResponse.json({error:"Não foi possível pesquisar agora."},{status:500});
  }

  const response=NextResponse.json({items:data||[]});
  response.headers.set("Cache-Control","private, max-age=30, stale-while-revalidate=120");
  return response;
}
