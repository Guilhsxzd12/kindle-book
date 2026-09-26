import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { StableSiteShell } from "@/components/StableSiteShell";
import { searchCatalog,catalogCategories } from "@/lib/catalog";
import type { Category } from "@/lib/types";

type LibraryQuery={q?:string;categoria?:string;pagina?:string;todos?:string};

function categoryOrder(a:Category,b:Category){
  return (a.sort_order??100)-(b.sort_order??100)||a.name.localeCompare(b.name,"pt-BR");
}

function hrefFor(opts:{q?:string;categoria?:string;pagina?:number;todos?:string}){
  const p=new URLSearchParams();
  if(opts.q)p.set("q",opts.q);
  if(opts.categoria)p.set("categoria",opts.categoria);
  if(opts.todos)p.set("todos",opts.todos);
  if(opts.pagina&&opts.pagina>1)p.set("pagina",String(opts.pagina));
  const s=p.toString();
  return s?"/biblioteca?"+s:"/biblioteca";
}

function BookTile({book}:{book:any}){
  return <Link className="lv-slide-book" href={"/livro/"+book.slug}>
    <div className="lv-slide-cover">
      {book.cover_url?<img src={book.cover_url} alt={"Capa de "+book.title}/>:<div className="lv-cover-fallback"><span>LEITURAVERSO</span><strong>{book.title}</strong></div>}
    </div>
    <div className="lv-slide-copy">
      <h3>{book.title}</h3>
      <p>{book.author||"Autor não informado"}</p>
      <span>{book.categories?.name||"Livro"}</span>
    </div>
  </Link>;
}

export default async function LibraryPage({searchParams}:{searchParams:Promise<LibraryQuery>}){
  const {supabase,profile}=await requireApproved();
  const {q="",categoria="",pagina="1",todos=""}=await searchParams;
  const query=q.trim();
  const page=Math.max(1,Number.parseInt(pagina,10)||1);
  const browseMode=Boolean(query||categoria||todos||page>1);

  console.info("[biblioteca-classic-lite] start",{query,categoria,page,browseMode});

  const categoryData=await catalogCategories(supabase);
  const categories=((categoryData||[]) as Category[]).filter(c=>!c.parent_id).sort(categoryOrder);

  const result=await searchCatalog(supabase,{
    search:query,
    category:categoria,
    page:browseMode?page:1,
    size:browseMode?24:12,
    sort:query||categoria||todos?"title":"recent"
  });

  console.info("[biblioteca-classic-lite] ok",{total:result.total,books:result.books.length});

  const recent=result.books;
  const featured=recent.filter(b=>b.cover_url).slice(0,3);
  const spotlight=recent.find(b=>b.cover_url)||recent[0];
  const totalPages=Math.max(1,Math.ceil(result.total/24));
  const selectedCategory=categories.find(c=>c.slug===categoria);
  const title=query?("Resultados para “"+query+"”"):(selectedCategory?.name||"Todos os livros");

  return <StableSiteShell isAdmin={profile.role==="admin"}><main className="lv-lite">

    {!browseMode&&<section className="lv-lite-hero">
      <div className="lv-lite-shell lv-lite-hero-grid">
        <div className="lv-lite-hero-copy">
          <span className="lv-lite-eyebrow">OLÁ, {(profile.full_name?.split(" ")[0]||profile.username||"LEITOR").toUpperCase()}</span>
          <h1>Histórias para todos os seus momentos.</h1>
          <p>Explore milhares de e-books, encontre sua próxima leitura e baixe em PDF ou EPUB.</p>

          <form action="/biblioteca" method="get" className="lv-lite-hero-search">
            <input name="q" placeholder="Qual livro você procura?"/>
            <button type="submit">Buscar</button>
          </form>

          <div className="lv-lite-stats">
            <div><strong>{result.total.toLocaleString("pt-BR")}+</strong><span>livros no catálogo</span></div>
            <div><strong>{categories.length}</strong><span>categorias principais</span></div>
          </div>
        </div>

        <div className="lv-lite-visual">
          <div className="lv-lite-visual-copy">
            <span>LEITURAVERSO</span>
            <strong>Seu próximo livro está aqui.</strong>
            <p>Descubra, organize e baixe suas leituras em poucos cliques.</p>
          </div>
          <div className="lv-lite-mini-covers">
            {featured.map((book,index)=><Link key={book.id} className={"lv-lite-mini-cover mini-"+(index+1)} href={"/livro/"+book.slug}>
              <img src={book.cover_url!} alt={"Capa de "+book.title}/>
            </Link>)}
          </div>
        </div>
      </div>
    </section>}

    <div className="lv-lite-shell">
      <div className="lv-lite-categories">
        <Link className={!categoria&&!todos?"active":""} href="/biblioteca">Início</Link>
        <Link className={todos?"active":""} href="/biblioteca?todos=1">Todos os livros</Link>
        {categories.map(category=><Link className={categoria===category.slug?"active":""} key={category.id} href={hrefFor({categoria:category.slug})}>{category.name}</Link>)}
      </div>

      {!browseMode&&<section id="novidades" className="lv-home-section">
        <div className="lv-home-heading">
          <div>
            <span className="lv-lite-eyebrow">NOVIDADES</span>
            <h2>Adicionados recentemente</h2>
            <p>Deslize para o lado e descubra as últimas adições ao acervo.</p>
          </div>
          <Link className="lv-see-all" href="/biblioteca?todos=1">Ver todos <span>→</span></Link>
        </div>

        <div className="lv-horizontal-scroll">
          {recent.map(book=><BookTile book={book} key={book.id}/>)}
        </div>
      </section>}

      {!browseMode&&spotlight&&<section className="lv-lite-spotlight">
        <div className="lv-lite-spotlight-cover">
          {spotlight.cover_url?<img src={spotlight.cover_url} alt={"Capa de "+spotlight.title}/>:<div className="lv-cover-fallback"><span>LEITURAVERSO</span><strong>{spotlight.title}</strong></div>}
        </div>
        <div className="lv-lite-spotlight-copy">
          <span className="lv-lite-eyebrow">DESTAQUE DA SEMANA</span>
          <h2>{spotlight.title}</h2>
          <p className="meta">{spotlight.categories?.name||"Livro"} · {spotlight.author||"Autor não informado"}</p>
          <p>{(spotlight.description||"Sinopse não informada.").slice(0,260)}{(spotlight.description||"").length>260?"…":""}</p>
          <Link href={"/livro/"+spotlight.slug}>Conferir livro</Link>
        </div>
      </section>}

      {browseMode&&<section className="lv-lite-section lv-browse-section">
        <div className="lv-lite-section-head">
          <div>
            <span className="lv-lite-eyebrow">CATÁLOGO</span>
            <h2>{title}</h2>
            <p>{result.total.toLocaleString("pt-BR")} {result.total===1?"livro encontrado":"livros encontrados"}.</p>
          </div>
          {(query||categoria)&&<Link className="lv-clear-filter" href="/biblioteca?todos=1">Limpar filtros</Link>}
        </div>

        <div className="lv-lite-grid">
          {result.books.map(book=><BookTile book={book} key={book.id}/>)}
        </div>

        {result.books.length===0&&<div className="lv-lite-empty">
          <h3>Nenhum livro encontrado</h3>
          <p>Tente outro título ou categoria.</p>
        </div>}

        {totalPages>1&&<nav className="lv-lite-pagination">
          {page>1&&<Link href={hrefFor({q:query,categoria,todos,pagina:page-1})}>← Anterior</Link>}
          <span>Página {page} de {totalPages}</span>
          {page<totalPages&&<Link href={hrefFor({q:query,categoria,todos,pagina:page+1})}>Próxima →</Link>}
        </nav>}
      </section>}
    </div>
  </main></StableSiteShell>;
}
