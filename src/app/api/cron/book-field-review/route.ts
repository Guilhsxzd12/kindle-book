import {NextRequest,NextResponse} from "next/server";
import {processBookFieldReviewBatch,type BookReviewField} from "@/lib/book-field-review-worker";

export const maxDuration=300;
export const dynamic="force-dynamic";

const fields:BookReviewField[]=["cover","author","category","title","description","language"];
const allowed=new Set<BookReviewField>(fields);

export async function GET(request:NextRequest){
  const limit=Math.max(1,Math.min(24,Number(request.nextUrl.searchParams.get("limit"))||12));
  const raw=request.nextUrl.searchParams.get("field")||"";
  const field=allowed.has(raw as BookReviewField)?raw as BookReviewField:null;
  const started=Date.now();
  try{
    if(field){
      const results=await processBookFieldReviewBatch(limit,field);
      return NextResponse.json({ok:true,processed:results.length,results,elapsedMs:Date.now()-started});
    }

    // Sem uma aba específica, distribui o lote igualmente entre as seis filas.
    // Assim Capas, Autores, Categorias, Títulos, Sinopses e Idioma avançam juntas.
    const perField=Math.max(1,Math.floor(limit/fields.length));
    const grouped=await Promise.all(fields.map(async current=>({
      field:current,
      results:await processBookFieldReviewBatch(perField,current)
    })));
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
