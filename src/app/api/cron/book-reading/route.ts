import {NextRequest,NextResponse} from "next/server";
import {processBookReadingBatch} from "@/lib/book-reading-worker";

export const maxDuration=300;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  const limit=Math.max(1,Math.min(3,Number(request.nextUrl.searchParams.get("limit"))||2));
  const started=Date.now();
  try{
    const results=await processBookReadingBatch(limit);
    return NextResponse.json({ok:true,processed:results.length,results,elapsedMs:Date.now()-started});
  }catch(error){
    console.error("[book-reading-cron]",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha no processamento.",elapsedMs:Date.now()-started},{status:500});
  }
}
