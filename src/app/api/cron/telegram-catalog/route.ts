import { NextRequest,NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publishBookToTelegramChannels } from "@/lib/telegram-channels";

export const maxDuration=300;
export async function GET(request:NextRequest){
  const auth=request.headers.get("authorization");
  const secret=process.env.CRON_SECRET;
  if(secret&&auth!==`Bearer ${secret}`)return NextResponse.json({ok:false},{status:401});
  const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",hour:"2-digit",hour12:false}).format(new Date()));
  if(hour<6||hour>23)return NextResponse.json({ok:true,skipped:"outside-window"});
  const db=createAdminSupabaseClient();
  const {data:channels}=await db.from("telegram_channels").select("id").eq("active",true);
  if(!channels?.length)return NextResponse.json({ok:false,error:"no-active-channels"},{status:409});
  const {data:books,error}=await db.from("books").select("id,title,created_at").eq("published",true).eq("allow_download",true).order("created_at",{ascending:true}).limit(1000);
  if(error)throw new Error(error.message);
  const {data:pubs}=await db.from("telegram_channel_publications").select("book_id,channel_id,epub_message_id,pdf_message_id,status");
  const done=new Map<string,Set<string>>();
  for(const p of pubs||[]){if(p.status==="sent"){const s=done.get(p.book_id)||new Set<string>();s.add(p.channel_id);done.set(p.book_id,s);}}
  const pending=(books||[]).filter(b=>(done.get(b.id)?.size||0)<channels.length).slice(0,20);
  const results=[];for(const book of pending){try{results.push(await publishBookToTelegramChannels(book.id,false));}catch(error){results.push({book:{id:book.id,title:book.title},error:error instanceof Error?error.message:"Falha"});}}
  return NextResponse.json({ok:true,processed:pending.length,results});
}