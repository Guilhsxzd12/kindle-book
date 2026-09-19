import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateInviteCode,hashInviteCode,inviteRegistrationUrl,type InvitePlan } from "@/lib/invite-codes";

async function requireApiAdmin(){
  const viewer=await getApiViewer();
  return viewer.user&&viewer.profile?.role==="admin"?viewer:null;
}

export async function POST(request:NextRequest){
  const viewer=await requireApiAdmin();
  if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json().catch(()=>({}));
    const planType=String(body.planType||"lifetime") as InvitePlan;
    if(planType!=="monthly"&&planType!=="lifetime")return NextResponse.json({error:"Tipo de acesso inválido."},{status:400});
    const code=generateInviteCode();
    const codeHash=hashInviteCode(code);
    const expiresAt=new Date(Date.now()+7*86400000).toISOString();
    const admin=createAdminSupabaseClient();
    const {error}=await admin.from("user_invite_codes").insert({code_hash:codeHash,plan_type:planType,created_by:viewer.user.id,expires_at:expiresAt});
    if(error)throw error;
    return NextResponse.json({code,link:inviteRegistrationUrl(code),expiresAt,planType});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível gerar o código."},{status:400});
  }
}
