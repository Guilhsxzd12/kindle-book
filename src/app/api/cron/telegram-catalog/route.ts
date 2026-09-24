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

  const requestedLimit=Number(request.nextUrl.searchParams.get("limit")||"5");
  const batchSize=Number.isFinite(requestedLimit)?Math.max(1,Math.min(20,Math.floor(requestedLimit))):5;
  const db=createAdminSupabaseClient();

  const {data:channels,error:channelError}=await db.from("telegram_channels").select("id").eq("active",true);
  if(channelError)throw new Error(channelError.message);
  if(!channels?.length)return NextResponse.json({ok:false,error:"no-active-channels"},{status:409});

  const {data:books,error}=await db.rpc("telegram_catalog_pending_books",{p_limit:batchSize});
  if(error)throw new Error(error.message);

  const pending=(books||[]) as Array<{id:string;title:string;created_at:string}>;
  const results=[];
  for(const book of pending){
    try{
      results.push(await publishBookToTelegramChannels(book.id,false));
    }catch(error){
      results.push({book:{id:book.id,title:book.title},error:error instanceof Error?error.message:"Falha"});
    }
  }

  return NextResponse.json({ok:true,processed:pending.length,results});
}
