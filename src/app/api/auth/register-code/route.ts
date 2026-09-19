import { randomUUID } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hashInviteCode,normalizeInviteCode } from "@/lib/invite-codes";

function validUsername(value:string){return /^[a-z0-9._-]{3,24}$/.test(value);}

export async function POST(request:NextRequest){
  let codeHash="";
  let createdUserId:string|null=null;
  try{
    const body=await request.json().catch(()=>({}));
    const normalizedCode=normalizeInviteCode(String(body.code||""));
    const username=String(body.username||"").trim().toLowerCase();
    const password=String(body.password||"");

    const validShortCode=/^\d{6}$/.test(normalizedCode);
    const validLegacyCode=/^[A-F0-9]{32}$/.test(normalizedCode);
    if(!validShortCode&&!validLegacyCode)return NextResponse.json({error:"Código inválido."},{status:400});
    if(!validUsername(username))return NextResponse.json({error:"Use de 3 a 24 caracteres no usuário: letras minúsculas, números, ponto, hífen ou underline."},{status:400});
    if(password.length<8)return NextResponse.json({error:"A senha precisa ter pelo menos 8 caracteres."},{status:400});

    const admin=createAdminSupabaseClient();
    const {data:existing,error:usernameError}=await admin.from("profiles").select("id").ilike("username",username).limit(1);
    if(usernameError)throw usernameError;
    if(existing?.length)return NextResponse.json({error:"Este nome de usuário já está em uso."},{status:409});

    codeHash=hashInviteCode(normalizedCode);
    const now=new Date().toISOString();
    const {data:invite,error:claimError}=await admin.from("user_invite_codes")
      .update({used_at:now})
      .eq("code_hash",codeHash)
      .is("used_at",null)
      .gt("expires_at",now)
      .select("code_hash,plan_type,created_by,expires_at")
      .maybeSingle();
    if(claimError)throw claimError;
    if(!invite)return NextResponse.json({error:"Este código é inválido, expirou ou já foi utilizado."},{status:400});

    try{
      const syntheticEmail=`u-${randomUUID()}@users.estantevirtual.shop`;
      const {data,error}=await admin.auth.admin.createUser({email:syntheticEmail,password,email_confirm:true,user_metadata:{username,full_name:username},app_metadata:{signup_method:"invite"}});
      if(error||!data.user)throw new Error(error?.message||"Não foi possível criar a conta.");
      createdUserId=data.user.id;

      const {error:profileError}=await admin.from("profiles").update({email:syntheticEmail,full_name:username,username,role:"reader",approved:true,updated_at:now}).eq("id",createdUserId);
      if(profileError)throw profileError;

      const lifetime=invite.plan_type==="lifetime";
      const activeUntil=lifetime?"9999-12-31T23:59:59.999Z":new Date(Date.now()+30*86400000).toISOString();
      const {error:subscriptionError}=await admin.from("subscriptions").upsert({user_id:createdUserId,status:"active",active_until:activeUntil,activated_at:now,activated_by:invite.created_by,note:lifetime?"Acesso vitalício criado por código de usuário":"Acesso mensal criado por código de usuário",plan_type:lifetime?"lifetime":"monthly",updated_at:now},{onConflict:"user_id"});
      if(subscriptionError)throw subscriptionError;

      const {error:finishError}=await admin.from("user_invite_codes").update({used_by:createdUserId}).eq("code_hash",codeHash).eq("used_at",now);
      if(finishError)throw finishError;
      return NextResponse.json({ok:true,username});
    }catch(error){
      if(createdUserId)await admin.auth.admin.deleteUser(createdUserId).catch(()=>undefined);
      await admin.from("user_invite_codes").update({used_at:null,used_by:null}).eq("code_hash",codeHash).is("used_by",null);
      throw error;
    }
  }catch(error){
    const message=error instanceof Error?error.message:"Não foi possível criar a conta.";
    const friendly=/duplicate|unique|already/i.test(message)?"Este nome de usuário já está em uso.":message;
    return NextResponse.json({error:friendly},{status:400});
  }
}
