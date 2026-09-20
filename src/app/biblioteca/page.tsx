import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BackToPrevious } from "@/components/BackToPrevious";
import { BookCard } from "@/components/BookCard";
import { CategoryHub } from "@/components/CategoryHub";
import { HorizontalBookSlider } from "@/components/HorizontalBookSlider";
import { RealtimeBookCount } from "@/components/RealtimeBookCount";
import { requireApproved } from "@/lib/auth";
import { searchCatalog,catalogAuthors,catalogShelves } from "@/lib/catalog";
import type { CatalogShelfMap } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Category } from "@/lib/types";

type LibraryQuery={q?:string;categoria?:string;autor?:string;pagina?:string;todos?:string};

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function excerpt(value:string|null,max=220){const text=(value||"Sinopse não informada.").replace(/\s+/g," ").trim();return text.length>max?`${text.slice(0,max).trim()}…`:text;}
function categoryOrder(a:Category,b:Category){return (a.sort_order??100)-(b.sort_order??100)||a.name.localeCompare(b.name,"pt-BR");}
function urlWith(base:LibraryQuery,patch:LibraryQuery){
  const params=new URLSearchParams();const next={...base,...patch};
  if(next.todos)params.set("todos",next.todos);if(next.q)params.set("q",next.q);if(next.categoria)params.set("categoria",next.categoria);if(next.autor)params.set("autor",next.autor);if(next.pagina&&next.pagina!=="1")params.set("pagina",next.pagina);
  const qs=params.toString();return qs?`/biblioteca?${qs}`:"/biblioteca";
}
function paginationItems(current:number,total:number):(number|string)[]{
  if(total<=7)return Array.from({length:total},(_,index)=>index+1);
  const items:(number|string)[]=[1];const start=Math.max(2,current-2);const end=Math.min(total-1,current+2);
  if(start>2)items.push("…");for(let page=start;page<=end;page++)items.push(page);if(end<total-1)items.push("…");items.push(total);return items;
}

export default async function LibraryPage({searchParams}:{searchParams:Promise<LibraryQuery>}){
  const {supabase,profile}=await requireApproved();
  const isAdmin=profile.role==="admin";
  const admin=createAdminSupabaseClient();
  const {q="",categoria="",autor="",pagina="1",todos=""}=await searchParams;
  const query=q.trim();const authorFilter=autor.trim();
  const [{data:categoryData,error:categoryError},authors]=await Promise.all([
    supabase.from("categories").select("id,name,slug,parent_id,sort_order").order("sort_order").order("name"),catalogAuthors(supabase)
  ]);
  if(categoryError){console.error("[catalog_categories]",categoryError);throw new Error("Não foi possível carregar as categorias.");}
  const categories=((categoryData||[]) as Category[]).sort(categoryOrder);
  const topLevelCategories=categories.filter(category=>!category.parent_id);
  const selectedCategory=categories.find(c=>c.slug===categoria);

  if(selectedCategory?.parent_id){
    const parent=categories.find(category=>category.id===selectedCategory.parent_id);
    if(parent)redirect(`/biblioteca?categoria=${encodeURIComponent(parent.slug)}#subcategoria-${encodeURIComponent(selectedCategory.slug)}`);
  }

  const childCategories=selectedCategory?categories.filter(c=>c.parent_id===selectedCategory.id).sort(categoryOrder):[];
  const filteredMode=Boolean(query||categoria||authorFilter||todos);
  const categoryHubMode=Boolean(selectedCategory&&!selectedCategory.parent_id&&!query&&!authorFilter&&!todos);
  const parsedPage=Number.parseInt(pagina,10);
  const requestedPage=Number.isFinite(parsedPage)&&parsedPage>0?parsedPage:1;
  const pageSize=20;

  const resultPromise=searchCatalog(supabase,filteredMode
    ?{search:query,category:categoria,author:authorFilter,page:categoryHubMode?1:requestedPage,size:categoryHubMode?30:pageSize,sort:"title"}
    :{size:12,sort:"recent"});
  const popularPromise=filteredMode?Promise.resolve(null):searchCatalog(admin,{size:12,sort:"popular"});
  const accessedPromise=filteredMode?Promise.resolve(null):searchCatalog(admin,{size:12,sort:"views"});
  const homeShelvesPromise=filteredMode?Promise.resolve({} as CatalogShelfMap):catalogShelves(supabase,"",12);
  const childResultsPromise=categoryHubMode&&childCategories.length
    ?Promise.all(childCategories.map(async category=>{
      const childResult=await searchCatalog(supabase,{category:category.slug,page:1,size:30,sort:"title"});
      return {category,books:childResult.books,total:childResult.total};
    }))
    :Promise.resolve([]);

  const [result,popularResult,accessedResult,shelves,childResults]=await Promise.all([
    resultPromise,popularPromise,accessedPromise,homeShelvesPromise,childResultsPromise
  ]);

  const totalBooks=result.total;
  const recent=filteredMode?[]:result.books;
  const featured=recent.filter(book=>book.cover_url).slice(0,4);
  const popular=popularResult?.books||[];
  const mostAccessed=accessedResult?.books||[];
  const spotlight=popular[0]||mostAccessed[0]||recent[0];
  const homeCategories=filteredMode?topLevelCategories:topLevelCategories.filter(category=>(shelves[category.id]||[]).length>0);
  const activeBase:LibraryQuery={q:query||undefined,categoria:categoria||undefined,autor:authorFilter||undefined,todos:todos||undefined};
  const totalPages=Math.max(1,Math.ceil(result.total/pageSize));
  const currentPage=result.page;
  const pagedFiltered=result.books;
  const pageItems=paginationItems(currentPage,totalPages);

  const filters=<div className="filter-panel-inner">
    <div className="filter-block"><h3>Pesquisar</h3><form className="filter-search" action="/biblioteca"><input name="q" defaultValue={query} placeholder="Título ou autor"/><button type="submit">Buscar</button></form></div>
    <div className="filter-block"><h3>Categorias</h3><div className="filter-links"><Link className={!selectedCategory?"active":""} href={urlWith(activeBase,{categoria:"",pagina:""})}>Todas</Link>{topLevelCategories.map(category=><Link className={selectedCategory?.id===category.id?"active":""} key={category.id} href={urlWith(activeBase,{categoria:category.slug,pagina:""})}>{category.name}</Link>)}</div></div>
    <div className="filter-block"><h3>Autores</h3><div className="filter-links author-filter-links"><Link className={!authorFilter?"active":""} href={urlWith(activeBase,{autor:"",pagina:""})}>Todos</Link>{authors.slice(0,18).map(author=><Link className={norm(author)===norm(authorFilter)?"active":""} key={author} href={urlWith(activeBase,{autor:author,pagina:""})}>{author}</Link>)}</div></div>
    {(query||selectedCategory||authorFilter)&&<Link className="clear-filters" href="/biblioteca">Limpar filtros</Link>}
  </div>;

  return <AppShell><main className="library-home">
    {!filteredMode&&<section className="editorial-hero">
      <div className="shell-width editorial-hero-inner">
        <div className="editorial-copy"><span className="eyebrow">OLÁ, {profile.full_name?.split(" ")[0]?.toUpperCase()||"LEITOR"}</span><h1>Histórias para todos<br/>os seus momentos.</h1><p>Explore o acervo, escolha seu próximo livro e baixe em PDF ou EPUB para ler no aplicativo que preferir.</p><form className="hero-search" action="/biblioteca"><input name="q" placeholder="Qual livro você procura?" aria-label="Pesquisar livro"/><button>Buscar</button></form><div className="hero-stats"><div><RealtimeBookCount initialCount={totalBooks}/><span>livros disponíveis</span></div><div><strong>{homeCategories.length}</strong><span>categorias principais</span></div></div></div>
        <div className="cover-collage" aria-label="Livros em destaque">{featured.map((book,index)=><Link href={`/livro/${book.slug}`} className={`collage-book collage-${index+1}`} key={book.id}>{book.cover_url&&<img src={book.cover_url} alt={`Capa de ${book.title}`}/>}</Link>)}</div>
      </div>
    </section>}

    <div className="shell-width library-content">
      {!filteredMode&&<nav className="category-strip" aria-label="Categorias"><Link className="active" href="/biblioteca?todos=1">Todos os livros</Link>{homeCategories.map(c=><Link href={`/biblioteca?categoria=${encodeURIComponent(c.slug)}`} key={c.id}>{c.name}</Link>)}</nav>}

      {!filteredMode&&recent.length>0&&<section id="novidades" className="library-section"><div className="section-heading"><div><span className="eyebrow">NOVIDADES</span><h2>Adicionados recentemente</h2><p>Deslize para o lado para explorar os títulos mais novos.</p></div></div><HorizontalBookSlider>{recent.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}</HorizontalBookSlider></section>}

      {!filteredMode&&spotlight&&<section className="spotlight-section"><div className="spotlight-card"><div className="spotlight-cover">{spotlight.cover_url?<img src={spotlight.cover_url} alt={`Capa de ${spotlight.title}`}/>:<div className="cover-fallback">{spotlight.title}</div>}</div><div className="spotlight-copy"><span className="eyebrow">DESTAQUE</span><h2>{spotlight.title}</h2><p className="spotlight-meta">{spotlight.categories?.name||"Livro"} • {spotlight.author}</p><strong>Sinopse:</strong><p>{excerpt(spotlight.description)}</p><Link className="spotlight-link" href={`/livro/${spotlight.slug}`}>Conferir</Link></div></div></section>}

      {!filteredMode&&mostAccessed.length>0&&<section className="library-section metric-section"><div className="section-heading"><div><span className="eyebrow">EM ALTA</span><h2>Mais acessados</h2><p>Os livros que mais despertaram interesse no acervo.</p></div></div><HorizontalBookSlider>{mostAccessed.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}</HorizontalBookSlider></section>}

      {!filteredMode&&popular.length>0&&<section className="library-section metric-section"><div className="section-heading"><div><span className="eyebrow">PREFERIDOS</span><h2>Mais populares</h2><p>Uma seleção baseada nos favoritos dos leitores.</p></div></div><HorizontalBookSlider>{popular.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}</HorizontalBookSlider></section>}

      {filteredMode?(categoryHubMode&&selectedCategory?<CategoryHub category={selectedCategory} initialBooks={result.books} total={result.total} children={childResults} isAdmin={isAdmin}/>:<div className="catalog-results-layout">
        <aside className="catalog-filter-sidebar">{filters}</aside>
        <section className="catalog-results-main">
          <details className="mobile-filter-drawer"><summary>Filtros e categorias</summary>{filters}</details>
          <div className="search-result-head"><BackToPrevious/><h1>{query?`Resultados para “${query}”`:authorFilter?authorFilter:selectedCategory?.name||"Todos os livros"}</h1><p>{result.total} {result.total===1?"livro encontrado":"livros encontrados"}{selectedCategory?` em ${selectedCategory.name}`:""}{result.total>pageSize?` • página ${currentPage} de ${totalPages}`:""}.</p></div>
          {result.total?<><div className="book-grid shelf-grid search-books-grid">{pagedFiltered.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}</div>{totalPages>1&&<nav className="catalog-pagination" aria-label="Paginação do acervo">{currentPage>1&&<Link className="pagination-arrow" href={urlWith(activeBase,{pagina:String(currentPage-1)})} aria-label="Página anterior">←</Link>}{pageItems.map((item,index)=>typeof item==="number"?<Link key={item} className={`pagination-page ${item===currentPage?"active":""}`} href={urlWith(activeBase,{pagina:String(item)})} aria-current={item===currentPage?"page":undefined}>{item}</Link>:<span className="pagination-ellipsis" key={`ellipsis-${index}`}>…</span>)}{currentPage<totalPages&&<Link className="pagination-arrow" href={urlWith(activeBase,{pagina:String(currentPage+1)})} aria-label="Próxima página">→</Link>}</nav>}</>:<div className="empty-state"><h3>Nenhum livro encontrado</h3><p>Tente outro título, autor ou categoria.</p><Link className="btn ghost" href="/biblioteca">Limpar busca</Link></div>}
        </section>
      </div>):<div className="category-sections">{homeCategories.map(category=>{const books=shelves[category.id]||[];if(!books.length)return null;return <section className="category-block" key={category.id}><div className="category-title"><div><span className="eyebrow">COLEÇÃO</span><h3>{category.name}</h3></div><Link href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>Ver todos <span>→</span></Link></div><HorizontalBookSlider>{books.map(book=><BookCard key={book.id} book={book} isAdmin={isAdmin}/>)}</HorizontalBookSlider></section>;})}</div>}
    </div>
  </main></AppShell>;
}
