"use client";

import Link from "next/link";
import { useEffect,useMemo,useState } from "react";

type Category={id:string;name:string;slug:string};
type Book={id:string;slug:string;title:string;author:string|null;cover_url:string|null;description:string|null;categories?:{name?:string|null}|null};
type Payload={categories:Category[];books:Book[];total:number;page:number;browse:boolean;error?:string};

function BookTile({book}:{book:Book}){
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

export function CloudflareLibrary({q,categoria,pagina,todos,displayName}:{q:string;categoria:string;pagina:number;todos:boolean;displayName:string}){
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const apiUrl=useMemo(()=>{
    const params=new URLSearchParams();
    if(q)params.set("q",q);
    if(categoria)params.set("categoria",categoria);
    if(pagina>1)params.set("pagina",String(pagina));
    if(todos)params.set("todos","1");
    return "/api/library-feed?"+params.toString();
  },[q,categoria,pagina,todos]);

  useEffect(()=>{
    let alive=true;
    setLoading(true);
    setError("");
    fetch(apiUrl,{credentials:"same-origin"})
      .then(async response=>{
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(body.error||"Não foi possível carregar o catálogo.");
        return body as Payload;
      })
      .then(body=>{if(alive)setData(body);})
      .catch(err=>{if(alive)setError(err instanceof Error?err.message:"Não foi possível carregar o catálogo.");})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[apiUrl]);

  const categories=data?.categories||[];
  const books=data?.books||[];
  const browse=Boolean(q||categoria||todos||pagina>1);
  const selectedCategory=categories.find(category=>category.slug===categoria);
  const totalPages=Math.max(1,Math.ceil((data?.total||0)/24));
  const spotlight=books.find(book=>book.cover_url)||books[0];

  return <main className="lv-lite">
    {!browse&&<section className="lv-lite-hero">
      <div className="lv-lite-shell lv-lite-hero-grid">
        <div className="lv-lite-hero-copy">
          <span className="lv-lite-eyebrow">OLÁ, {displayName.toUpperCase()}</span>
          <h1>Histórias para todos os seus momentos.</h1>
          <p>Explore o acervo, escolha seu próximo livro e baixe em PDF ou EPUB para ler onde preferir.</p>

          <form action="/biblioteca" method="get" className="lv-lite-hero-search">
            <input name="q" placeholder="Qual livro você procura?"/>
            <button type="submit">Buscar</button>
          </form>

          <div className="lv-lite-stats">
            <div><strong>{loading?"…":(data?.total||0).toLocaleString("pt-BR")}</strong><span>livros no catálogo</span></div>
            <div><strong>{loading?"…":categories.length}</strong><span>categorias principais</span></div>
          </div>
        </div>

        <div className="lv-lite-visual">
          <div className="lv-lite-visual-copy">
            <span>LEITURAVERSO</span>
            <strong>Seu próximo livro está aqui.</strong>
            <p>Descubra, organize e baixe suas leituras em poucos cliques.</p>
          </div>
          <div className="lv-lite-mini-covers">
            {books.filter(book=>book.cover_url).slice(0,3).map((book,index)=><Link key={book.id} className={"lv-lite-mini-cover mini-"+(index+1)} href={"/livro/"+book.slug}>
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
        {categories.map(category=><Link className={categoria===category.slug?"active":""} key={category.id} href={"/biblioteca?categoria="+encodeURIComponent(category.slug)}>{category.name}</Link>)}
      </div>

      {loading&&<section className="lv-home-section"><div className="library-loading-card"><strong>Carregando sua biblioteca…</strong><span>O layout já está pronto; estamos buscando os livros.</span></div></section>}

      {error&&<section className="lv-home-section"><div className="library-error-card"><strong>Não foi possível carregar o catálogo.</strong><span>{error}</span><button type="button" onClick={()=>location.reload()}>Tentar novamente</button></div></section>}

      {!loading&&!error&&!browse&&<section id="novidades" className="lv-home-section">
        <div className="lv-home-heading">
          <div>
            <span className="lv-lite-eyebrow">NOVIDADES</span>
            <h2>Adicionados recentemente</h2>
            <p>Deslize para o lado para explorar as últimas adições.</p>
          </div>
          <Link className="lv-see-all" href="/biblioteca?todos=1">Ver todos <span>→</span></Link>
        </div>
        <div className="lv-horizontal-scroll">{books.map(book=><BookTile book={book} key={book.id}/>)}</div>
      </section>}

      {!loading&&!error&&!browse&&spotlight&&<section className="lv-lite-spotlight">
        <div className="lv-lite-spotlight-cover">
          {spotlight.cover_url?<img src={spotlight.cover_url} alt={"Capa de "+spotlight.title}/>:<div className="lv-cover-fallback"><span>LEITURAVERSO</span><strong>{spotlight.title}</strong></div>}
        </div>
        <div className="lv-lite-spotlight-copy">
          <span className="lv-lite-eyebrow">DESTAQUE</span>
          <h2>{spotlight.title}</h2>
          <p className="meta">{spotlight.categories?.name||"Livro"} · {spotlight.author||"Autor não informado"}</p>
          <p>{(spotlight.description||"Sinopse não informada.").slice(0,260)}{(spotlight.description||"").length>260?"…":""}</p>
          <Link href={"/livro/"+spotlight.slug}>Conferir livro</Link>
        </div>
      </section>}

      {!loading&&!error&&browse&&<section className="lv-lite-section lv-browse-section">
        <div className="lv-lite-section-head">
          <div>
            <span className="lv-lite-eyebrow">CATÁLOGO</span>
            <h2>{q?("Resultados para “"+q+"”"):(selectedCategory?.name||"Todos os livros")}</h2>
            <p>{(data?.total||0).toLocaleString("pt-BR")} {(data?.total||0)===1?"livro encontrado":"livros encontrados"}.</p>
          </div>
          {(q||categoria)&&<Link className="lv-clear-filter" href="/biblioteca?todos=1">Limpar filtros</Link>}
        </div>

        <div className="lv-lite-grid">{books.map(book=><BookTile book={book} key={book.id}/>)}</div>

        {books.length===0&&<div className="lv-lite-empty"><h3>Nenhum livro encontrado</h3><p>Tente outro título ou categoria.</p></div>}

        {totalPages>1&&<nav className="lv-lite-pagination">
          {pagina>1&&<Link href={"/biblioteca?pagina="+(pagina-1)+(q?"&q="+encodeURIComponent(q):"")+(categoria?"&categoria="+encodeURIComponent(categoria):"")+(todos?"&todos=1":"")}>← Anterior</Link>}
          <span>Página {pagina} de {totalPages}</span>
          {pagina<totalPages&&<Link href={"/biblioteca?pagina="+(pagina+1)+(q?"&q="+encodeURIComponent(q):"")+(categoria?"&categoria="+encodeURIComponent(categoria):"")+(todos?"&todos=1":"")}>Próxima →</Link>}
        </nav>}
      </section>}
    </div>
  </main>;
}
