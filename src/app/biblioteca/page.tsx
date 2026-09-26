import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { searchCatalog,catalogCategories } from "@/lib/catalog";
import type { Category } from "@/lib/types";

type LibraryQuery={q?:string;categoria?:string;pagina?:string};

function categoryOrder(a:Category,b:Category){
  return (a.sort_order??100)-(b.sort_order??100)||a.name.localeCompare(b.name,"pt-BR");
}

function hrefFor(opts:{q:string;categoria:string;pagina?:number}){
  const p=new URLSearchParams();
  if(opts.q)p.set("q",opts.q);
  if(opts.categoria)p.set("categoria",opts.categoria);
  if(opts.pagina&&opts.pagina>1)p.set("pagina",String(opts.pagina));
  const s=p.toString();
  return s?"/biblioteca?"+s:"/biblioteca";
}

export default async function LibraryPage({searchParams}:{searchParams:Promise<LibraryQuery>}){
  const {supabase,profile}=await requireApproved();
  const {q="",categoria="",pagina="1"}=await searchParams;
  const query=q.trim();
  const page=Math.max(1,Number.parseInt(pagina,10)||1);

  console.info("[biblioteca-classic-lite] start",{query,categoria,page});

  const categoryData=await catalogCategories(supabase);
  const categories=((categoryData||[]) as Category[]).filter(c=>!c.parent_id).sort(categoryOrder);

  const result=await searchCatalog(supabase,{
    search:query,
    category:categoria,
    page,
    size:24,
    sort:query||categoria?"title":"recent"
  });

  console.info("[biblioteca-classic-lite] ok",{total:result.total,books:result.books.length});

  const featured=result.books.filter(b=>b.cover_url).slice(0,4);
  const spotlight=result.books[0];
  const totalPages=Math.max(1,Math.ceil(result.total/24));
  const title=query?("Resultados para “"+query+"”"):(categoria?(categories.find(c=>c.slug===categoria)?.name||"Livros"):"Adicionados recentemente");

  return <main className="lv-lite">
    <header className="lv-lite-header">
      <div className="lv-lite-header-inner">
        <Link href="/biblioteca" className="lv-lite-brand">
          <img src="/leituraverso-header-final.svg" alt="LeituraVerso"/>
        </Link>

        <nav className="lv-lite-nav">
          <Link href="/biblioteca">Início</Link>
          <a href="#novidades">Novidades</a>
          <Link href="/ajuda">Ajuda</Link>
          {profile.role==="admin"&&<Link href="/admin">Admin</Link>}
        </nav>

        <form action="/biblioteca" method="get" className="lv-lite-search">
          <input name="q" defaultValue={query} placeholder="Livro ou autor..."/>
          {categoria&&<input type="hidden" name="categoria" value={categoria}/>}
          <button type="submit">Pesquisar</button>
        </form>

        <Link href="/pedido" className="lv-lite-request">Pedir livro</Link>
      </div>
    </header>

    {!query&&!categoria&&<section className="lv-lite-hero">
      <div className="lv-lite-shell lv-lite-hero-grid">
        <div className="lv-lite-hero-copy">
          <span className="lv-lite-eyebrow">OLÁ, {(profile.full_name?.split(" ")[0]||profile.username||"LEITOR").toUpperCase()}</span>
          <h1>Histórias para todos<br/>os seus momentos.</h1>
          <p>Explore o acervo, escolha seu próximo livro e baixe em PDF ou EPUB para ler onde preferir.</p>

          <form action="/biblioteca" method="get" className="lv-lite-hero-search">
            <input name="q" placeholder="Qual livro você procura?"/>
            <button type="submit">Buscar</button>
          </form>

          <div className="lv-lite-stats">
            <div><strong>{result.total.toLocaleString("pt-BR")}</strong><span>livros no catálogo</span></div>
            <div><strong>{categories.length}</strong><span>categorias principais</span></div>
          </div>
        </div>

        <div className="lv-lite-collage">
          {featured.map((book,index)=><Link className={"lv-lite-cover lv-lite-cover-"+(index+1)} key={book.id} href={"/livro/"+book.slug}>
            <img src={book.cover_url!} alt={"Capa de "+book.title}/>
          </Link>)}
        </div>
      </div>
    </section>}

    <div className="lv-lite-shell">
      <div className="lv-lite-categories">
        <Link className={!categoria?"active":""} href={hrefFor({q:query,categoria:""})}>Todos os livros</Link>
        {categories.map(category=><Link className={categoria===category.slug?"active":""} key={category.id} href={hrefFor({q:query,categoria:category.slug})}>{category.name}</Link>)}
      </div>

      <section id="novidades" className="lv-lite-section">
        <div className="lv-lite-section-head">
          <div>
            <span className="lv-lite-eyebrow">{query||categoria?"CATÁLOGO":"NOVIDADES"}</span>
            <h2>{title}</h2>
            <p>{result.total.toLocaleString("pt-BR")} {result.total===1?"livro encontrado":"livros encontrados"}.</p>
          </div>
        </div>

        <div className="lv-lite-grid">
          {result.books.map(book=><Link className="lv-lite-book" href={"/livro/"+book.slug} key={book.id}>
            <div className="lv-lite-book-cover">
              {book.cover_url?<img src={book.cover_url} alt={"Capa de "+book.title}/>:<span>{book.title}</span>}
            </div>
            <div className="lv-lite-book-copy">
              <h3>{book.title}</h3>
              <p>{book.author||"Autor não informado"}</p>
              <span>{book.categories?.name||"Livro"}</span>
            </div>
          </Link>)}
        </div>

        {result.books.length===0&&<div className="lv-lite-empty">
          <h3>Nenhum livro encontrado</h3>
          <p>Tente outro título ou categoria.</p>
        </div>}

        {totalPages>1&&<nav className="lv-lite-pagination">
          {page>1&&<Link href={hrefFor({q:query,categoria,pagina:page-1})}>← Anterior</Link>}
          <span>Página {page} de {totalPages}</span>
          {page<totalPages&&<Link href={hrefFor({q:query,categoria,pagina:page+1})}>Próxima →</Link>}
        </nav>}
      </section>

      {!query&&!categoria&&spotlight&&<section className="lv-lite-spotlight">
        <div className="lv-lite-spotlight-cover">
          {spotlight.cover_url?<img src={spotlight.cover_url} alt={"Capa de "+spotlight.title}/>:<span>{spotlight.title}</span>}
        </div>
        <div className="lv-lite-spotlight-copy">
          <span className="lv-lite-eyebrow">DESTAQUE</span>
          <h2>{spotlight.title}</h2>
          <p className="meta">{spotlight.categories?.name||"Livro"} · {spotlight.author||"Autor não informado"}</p>
          <p>{(spotlight.description||"Sinopse não informada.").slice(0,300)}{(spotlight.description||"").length>300?"…":""}</p>
          <Link href={"/livro/"+spotlight.slug}>Conferir livro</Link>
        </div>
      </section>}
    </div>
  </main>;
}
