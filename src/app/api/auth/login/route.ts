import { NextRequest,NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request:NextRequest){
  try{
    const body=await request.json();
    const identifier=String(body.identifier||"").trim().toLowerCase();
    const password=String(body.password||"");
    if(identifier.length<3||!password)return NextResponse.json({error:"Dados de acesso inválidos."},{status:400});

    let email=identifier;
    if(!identifier.includes("@")){
      const admin=createAdminSupabaseClient();
      const {data}=await admin.from("profiles").select("email").ilike("username",identifier).maybeSingle();
      if(!data?.email)return NextResponse.json({error:"Usuário ou senha incorretos."},{status:401});
      email=String(data.email).toLowerCase();
    }

    const supabase=await createServerSupabaseClient();
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error||!data.user)return NextResponse.json({error:"Usuário ou senha incorretos."},{status:401});
    return NextResponse.json({ok:true});
  }catch{
    return NextResponse.json({error:"Não foi possível entrar agora."},{status:500});
  }
}
