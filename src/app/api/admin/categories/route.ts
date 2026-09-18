import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { slugifyTitle } from "@/lib/slugify";
async function admin(){ const v=await getApiViewer(); return v.user&&v.profile?.role==="admin"?v:null; }
export async function POST(request:NextRequest){ const v=await admin(); if(!v)return NextResponse.json({error:"Acesso negado."},{status:403}); const {name,parentId}=await request.json(); const value=String(name||"").trim(); if(!value)return NextResponse.json({error:"Nome obrigatório."},{status:400}); const {data,error}=await v.supabase.from("categories").insert({name:value,slug:slugifyTitle(value).toLowerCase(),parent_id:parentId||null}).select("*").single(); return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({category:data}); }
export async function DELETE(request:NextRequest){ const v=await admin(); if(!v)return NextResponse.json({error:"Acesso negado."},{status:403}); const id=request.nextUrl.searchParams.get("id"); const {error}=await v.supabase.from("categories").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true}); }
