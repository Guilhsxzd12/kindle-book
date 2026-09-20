import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deleteDriveFile } from "@/lib/google-drive";

async function isAdmin(){const viewer=await getApiViewer();return Boolean(viewer.user&&viewer.profile?.role==="admin");}
function text(value:unknown){return String(value||"").trim();}
function driveCoverId(url:string){const match=url.match(/^\/api\/covers\/([^/?#]+)/);return match?.[1]?decodeURIComponent(match[1]):null;}

export async function GET(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  const bookId=request.nextUrl.searchParams.get("bookId")?.trim();
  if(!bookId)return NextResponse.json({covers:[]});
  const {data,error}=await createAdminSupabaseClient().from("book_covers").select("id,book_id,cover_url,label,source,created_at").eq("book_id",bookId).order("created_at",{ascending:true});
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({covers:data||[]});
}

export async function POST(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const bookId=text(body.bookId);const coverUrl=text(body.coverUrl);const label=text(body.label)||null;
    if(!bookId||!coverUrl)return NextResponse.json({error:"Livro e capa são obrigatórios."},{status:400});
    const admin=createAdminSupabaseClient();
    const {data:book}=await admin.from("books").select("id,cover_url").eq("id",bookId).maybeSingle();
    if(!book)return NextResponse.json({error:"Livro não encontrado."},{status:404});
    const {data,error}=await admin.from("book_covers").upsert({book_id:bookId,cover_url:coverUrl,label,source:"manual"},{onConflict:"book_id,cover_url"}).select("id,book_id,cover_url,label,source,created_at").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    const promotedToMain=!text(book.cover_url);
    if(promotedToMain){const {error:bookError}=await admin.from("books").update({cover_url:coverUrl,updated_at:new Date().toISOString()}).eq("id",bookId);if(bookError)return NextResponse.json({error:bookError.message},{status:400});}
    return NextResponse.json({cover:data,promotedToMain});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível salvar a capa."},{status:400});}
}

export async function DELETE(request:NextRequest){
  if(!await isAdmin())return NextResponse.json({error:"Acesso negado."},{status:403});
  const id=request.nextUrl.searchParams.get("id")?.trim();if(!id)return NextResponse.json({error:"Capa obrigatória."},{status:400});
  const admin=createAdminSupabaseClient();const {data}=await admin.from("book_covers").select("cover_url").eq("id",id).maybeSingle();
  const {error}=await admin.from("book_covers").delete().eq("id",id);if(error)return NextResponse.json({error:error.message},{status:400});
  const fileId=data?.cover_url?driveCoverId(data.cover_url):null;if(fileId)try{await deleteDriveFile(fileId);}catch{}
  return NextResponse.json({ok:true});
}
