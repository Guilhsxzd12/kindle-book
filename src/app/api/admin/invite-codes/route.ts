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

    const admin=createAdminSupabaseClient();
    const expiresAt=new Date(Date.now()+7*86400000).toISOString();

    for(let attempt=0;attempt<30;attempt++){
      const code=generateInviteCode();
      const codeHash=hashInviteCode(code);
      const {error}=await admin.from("user_invite_codes").insert({code_hash:codeHash,plan_type:planType,created_by:viewer.user.id,expires_at:expiresAt});
      if(!error)return NextResponse.json({code,link:inviteRegistrationUrl(code),expiresAt,planType});
      if(error.code!=="23505")throw error;
    }

    return NextResponse.json({error:"Não foi possível gerar um código exclusivo agora. Tente novamente."},{status:503});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível gerar o código."},{status:400});
  }
}
