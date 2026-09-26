import { NextRequest,NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { searchCatalog,catalogCategories } from "@/lib/catalog";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
  try{
    const {supabase}=await requireApproved();
    const q=(request.nextUrl.searchParams.get("q")||"").trim().slice(0,120);
    const categoria=(request.nextUrl.searchParams.get("categoria")||"").trim().slice(0,120);
    const todos=request.nextUrl.searchParams.get("todos")==="1";
    const page=Math.max(1,Number.parseInt(request.nextUrl.searchParams.get("pagina")||"1",10)||1);
    const browse=Boolean(q||categoria||todos||page>1);

    const categoryData=await catalogCategories(supabase);
    const categories=(categoryData||[]).filter((item:any)=>!item.parent_id);

    const result=await searchCatalog(supabase,{
      search:q,
      category:categoria,
      page:browse?page:1,
      size:browse?24:12,
      sort:q||categoria||todos?"title":"recent"
    });

    // Keep the origin payload intentionally small. Catalog RPCs may return fields
    // used by admin/detail pages, but library cards only need this public subset.
    // Description is only needed by the home spotlight; browse/search results omit it.
    const books=(result.books||[]).map((book:any)=>({
      id:book.id,
      slug:book.slug,
      title:book.title,
      author:book.author,
      cover_url:book.cover_url,
      ...(browse?{}:{description:book.description}),
      categories:book.categories?.name?{name:book.categories.name}:null
    }));

    const response=NextResponse.json({
      categories,
      books,
      total:result.total,
      page:result.page,
      browse
    });
    response.headers.set("Cache-Control","private, max-age=15, stale-while-revalidate=60");
    return response;
  }catch(error){
    console.error("[library_feed]",{message:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:"Não foi possível carregar o catálogo agora."},{status:500});
  }
}
