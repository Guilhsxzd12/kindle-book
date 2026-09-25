import {NextRequest,NextResponse} from "next/server";
import {touchLocalWorker} from "@/lib/local-worker-heartbeat";
import {processBookAnalysisBatch} from "@/lib/book-analysis-worker";

export const maxDuration=300;
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  // O processamento pesado pertence ao worker local do LeituraVerso.
  // Na Vercel esta rota fica intencionalmente inativa para não consumir
  // memória/CPU do site público nem derrubar o catálogo.
  if(process.env.VERCEL){
    return NextResponse.json({ok:true,processed:0,delegatedTo:"local-worker"});
  }
  await touchLocalWorker();

  const limit=Math.max(1,Math.min(1,Number(request.nextUrl.searchParams.get("limit"))||1));
  const started=Date.now();
  try{
    const results=await processBookAnalysisBatch(limit);
    return NextResponse.json({ok:true,processed:results.length,results,elapsedMs:Date.now()-started});
  }catch(error){
    console.error("[book-analysis-cron]",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha no processamento.",elapsedMs:Date.now()-started},{status:500});
  }
}
