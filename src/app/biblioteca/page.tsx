import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { searchCatalog,catalogCategories } from "@/lib/catalog";
import type { Category } from "@/lib/types";

type LibraryQuery={q?:string;categoria?:string;pagina?:string};

function categoryOrder(a:Category,b:Category){
  return (a.sort_order??100)-(b.sort_order??100)||a.name.localeCompare(b.name,"pt-BR");
}

export default async function LibraryPage({searchParams}:{searchParams:Promise<LibraryQuery>}){
  const {supabase,profile}=await requireApproved();
  if(!profile)redirect("/login");

  const {q="",categoria="",pagina="1"}=await searchParams;
  const query=q.trim();
  const page=Math.max(1,Number.parseInt(pagina,10)||1);

  console.info("[biblioteca-lite] start",{query,categoria,page});

  const categoryData=await catalogCategories(supabase);
  const categories=((categoryData||[]) as Category[]).filter(c=>!c.parent_id).sort(categoryOrder);

  const result=await searchCatalog(supabase,{
    search:query,
    category:categoria,
    page,
    size:24,
    sort:query||categoria?"title":"recent"
  });

  console.info("[biblioteca-lite] ok",{total:result.total,books:result.books.length});

  const totalPages=Math.max(1,Math.ceil(result.total/24));

  return <main style={{minHeight:"100vh",background:"#f6f1ea",color:"#201923",fontFamily:"Arial,Helvetica,sans-serif"}}>
    <header style={{position:"sticky",top:0,zIndex:10,background:"#fff",borderBottom:"1px solid #eadfd7"}}>
      <div style={{maxWidth:1180,margin:"0 auto",padding:"16px 20px",display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
        <Link href="/biblioteca" style={{display:"inline-flex",alignItems:"center",textDecoration:"none"}}>
          <img src="/leituraverso-header-final.svg" alt="LeituraVerso" style={{width:160,height:"auto"}}/>
        </Link>

        <form action="/biblioteca" method="get" style={{flex:"1 1 320px",display:"flex",gap:8}}>
          <input name="q" defaultValue={query} placeholder="Pesquisar livro ou autor..." style={{flex:1,minWidth:0,height:44,border:"1px solid #d8ccc5",borderRadius:12,padding:"0 14px",fontSize:15,background:"#fff"}}/>
          {categoria&&<input type="hidden" name="categoria" value={categoria}/>}
          <button type="submit" style={{height:44,padding:"0 18px",border:0,borderRadius:12,background:"#5c233d",color:"#fff",fontWeight:800,cursor:"pointer"}}>Pesquisar</button>
        </form>

        {profile.role==="admin"&&<Link href="/admin" style={{color:"#5c233d",fontWeight:800,textDecoration:"none"}}>Admin</Link>}
      </div>
    </header>

    <section style={{maxWidth:1180,margin:"0 auto",padding:"34px 20px 18px"}}>
      <div style={{marginBottom:24}}>
        <p style={{margin:"0 0 8px",fontSize:12,fontWeight:900,letterSpacing:1.4,color:"#8a4d63"}}>LEITURAVERSO</p>
        <h1 style={{margin:0,fontSize:"clamp(30px,5vw,52px)",lineHeight:1.03}}>Sua biblioteca digital</h1>
        <p style={{margin:"12px 0 0",color:"#6d6268",fontSize:16}}>{result.total.toLocaleString("pt-BR")} livros disponíveis no catálogo.</p>
      </div>

      <nav style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginBottom:26}}>
        <Link href={query?"/biblioteca?q="+encodeURIComponent(query):"/biblioteca"} style={{whiteSpace:"nowrap",padding:"10px 14px",borderRadius:999,textDecoration:"none",fontWeight:800,background:!categoria?"#5c233d":"#fff",color:!categoria?"#fff":"#4e4046",border:"1px solid #dfd1cb"}}>Todos</Link>
        {categories.map(category=><Link key={category.id} href={"/biblioteca?categoria="+encodeURIComponent(category.slug)+(query?"&q="+encodeURIComponent(query):"")} style={{whiteSpace:"nowrap",padding:"10px 14px",borderRadius:999,textDecoration:"none",fontWeight:800,background:categoria===category.slug?"#5c233d":"#fff",color:categoria===category.slug?"#fff":"#4e4046",border:"1px solid #dfd1cb"}}>{category.name}</Link>)}
      </nav>

      {result.books.length>0?
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:20}}>
          {result.books.map(book=><Link key={book.id} href={"/livro/"+book.slug} style={{textDecoration:"none",color:"inherit"}}>
            <article style={{background:"#fff",border:"1px solid #eadfd7",borderRadius:16,padding:10,boxShadow:"0 8px 24px rgba(58,40,49,.06)",height:"100%"}}>
              <div style={{aspectRatio:"2/3",borderRadius:11,overflow:"hidden",background:"#eee5df",marginBottom:11}}>
                {book.cover_url?<img src={book.cover_url} alt={"Capa de "+book.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{height:"100%",display:"grid",placeItems:"center",padding:14,textAlign:"center",fontWeight:800,color:"#7a6a71"}}>{book.title}</div>}
              </div>
              <h2 style={{margin:"0 0 6px",fontSize:15,lineHeight:1.25}}>{book.title}</h2>
              <p style={{margin:0,color:"#7c7176",fontSize:12,lineHeight:1.35}}>{book.author||"Autor não informado"}</p>
            </article>
          </Link>)}
        </div>
        :
        <div style={{padding:"48px 20px",textAlign:"center",background:"#fff",border:"1px solid #eadfd7",borderRadius:18}}>
          <h2 style={{margin:"0 0 8px"}}>Nenhum livro encontrado</h2>
          <p style={{margin:0,color:"#776b70"}}>Tente outro título ou categoria.</p>
        </div>
      }

      {totalPages>1&&<nav style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10,margin:"34px 0 8px"}}>
        {page>1&&<Link href={"/biblioteca?pagina="+(page-1)+(query?"&q="+encodeURIComponent(query):"")+(categoria?"&categoria="+encodeURIComponent(categoria):"")} style={{padding:"10px 14px",background:"#fff",border:"1px solid #dfd1cb",borderRadius:10,textDecoration:"none",color:"#5c233d",fontWeight:800}}>← Anterior</Link>}
        <span style={{color:"#766b70",fontWeight:700}}>Página {page} de {totalPages}</span>
        {page<totalPages&&<Link href={"/biblioteca?pagina="+(page+1)+(query?"&q="+encodeURIComponent(query):"")+(categoria?"&categoria="+encodeURIComponent(categoria):"")} style={{padding:"10px 14px",background:"#fff",border:"1px solid #dfd1cb",borderRadius:10,textDecoration:"none",color:"#5c233d",fontWeight:800}}>Próxima →</Link>}
      </nav>}
    </section>
  </main>;
}
