import {NextRequest,NextResponse} from "next/server";
import {processBookFieldReviewBatch,type BookReviewField} from "@/lib/book-field-review-worker";

export const maxDuration=300;
export const dynamic="force-dynamic";

const fields:BookReviewField[]=["cover","author","category","title","description","language"];
const allowed=new Set<BookReviewField>(fields);

export async function GET(request:NextRequest){
  // A aplicação das revisões em lote também fica no worker local.
  if(process.env.VERCEL){
    return NextResponse.json({ok:true,processed:0,delegatedTo:"local-worker"});
  }

  const limit=Math.max(1,Math.min(6,Number(request.nextUrl.searchParams.get("limit"))||6));
  const raw=request.nextUrl.searchParams.get("field")||"";
  const field=allowed.has(raw as BookReviewField)?raw as BookReviewField:null;
  const started=Date.now();
  try{
    if(field){
      const results=await processBookFieldReviewBatch(Math.min(limit,2),field);
      return NextResponse.json({ok:true,processed:results.length,results,elapsedMs:Date.now()-started});
    }

    // Processa as seis filas em sequência, nunca em paralelo.
    // Isso evita rajadas de consultas e mantém o uso de memória previsível.
    const grouped:{field:BookReviewField;results:Awaited<ReturnType<typeof processBookFieldReviewBatch>>}[]=[];
    const perField=Math.max(1,Math.floor(limit/fields.length));
    for(const current of fields){
      grouped.push({field:current,results:await processBookFieldReviewBatch(perField,current)});
    }
    const results=grouped.flatMap(group=>group.results);
    return NextResponse.json({
      ok:true,
      processed:results.length,
      byField:Object.fromEntries(grouped.map(group=>[group.field,group.results.length])),
      results,
      elapsedMs:Date.now()-started
    });
  }catch(error){
    console.error("[book-field-review-cron]",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha no processamento.",elapsedMs:Date.now()-started},{status:500});
  }
}
