import {NextRequest,NextResponse} from "next/server";
import {processBookFieldReviewBatch,type BookReviewField} from "@/lib/book-field-review-worker";

export const maxDuration=300;
export const dynamic="force-dynamic";

const allowed=new Set<BookReviewField>(["cover","author","category","title","description","language"]);

export async function GET(request:NextRequest){
  const limit=Math.max(1,Math.min(3,Number(request.nextUrl.searchParams.get("limit"))||2));
  const raw=request.nextUrl.searchParams.get("field")||"";
  const field=allowed.has(raw as BookReviewField)?raw as BookReviewField:null;
  const started=Date.now();
  try{
    const results=await processBookFieldReviewBatch(limit,field);
    return NextResponse.json({ok:true,processed:results.length,results,elapsedMs:Date.now()-started});
  }catch(error){
    console.error("[book-field-review-cron]",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha no processamento.",elapsedMs:Date.now()-started},{status:500});
  }
}
