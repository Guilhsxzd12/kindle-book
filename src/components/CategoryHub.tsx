import { BackToPrevious } from "@/components/BackToPrevious";
import { LazyHorizontalBookShelf } from "@/components/LazyHorizontalBookShelf";
import type { Book,Category } from "@/lib/types";

type ChildShelf={category:Category;books:Book[];total:number};

export function CategoryHub({category,initialBooks,total,children,isAdmin=false}:{category:Category;initialBooks:Book[];total:number;children:ChildShelf[];isAdmin?:boolean}){
  const visibleChildren=children.filter(item=>item.total>0);
  const specificChildren=visibleChildren.filter(item=>item.category.name.toLocaleLowerCase("pt-BR")!=="outros");
  const showCompleteShelf=specificChildren.length>0;

  return <section className="category-hub-page">
    <div className="search-result-head category-hub-head"><BackToPrevious/><span className="eyebrow">COLEÇÃO</span><h1>{category.name}</h1><p>{total} {total===1?"livro encontrado":"livros encontrados"}. Deslize as prateleiras para o lado. Livros sem uma subcategoria específica aparecem automaticamente em <strong>Outros</strong>.</p></div>

    {visibleChildren.length>0&&<>
      <nav className="subcategory-filter-strip" aria-label={`Subcategorias de ${category.name}`}>
        {showCompleteShelf&&<a className="subcategory-filter-chip all" href="#todos-da-categoria">Todos</a>}
        {visibleChildren.map(({category:child,total:childTotal})=><a className="subcategory-filter-chip" key={child.id} href={`#subcategoria-${child.slug}`}><strong>{child.name}</strong><span>{childTotal}</span></a>)}
      </nav>

      <div className="category-hub-shelves">
        {visibleChildren.map(({category:child,books,total:childTotal})=><section className="category-hub-shelf" id={`subcategoria-${child.slug}`} key={child.id}>
          <div className="category-title"><div><span className="eyebrow">SUBCATEGORIA</span><h3>{child.name}</h3></div><span className="shelf-total-label">{childTotal} {childTotal===1?"livro":"livros"}</span></div>
          <LazyHorizontalBookShelf initialBooks={books} total={childTotal} categorySlug={child.slug} isAdmin={isAdmin}/>
        </section>)}
      </div>
    </>}

    {showCompleteShelf&&<section className="category-hub-shelf category-hub-all" id="todos-da-categoria">
      <div className="category-title"><div><span className="eyebrow">COLEÇÃO COMPLETA</span><h3>Todos em {category.name}</h3></div><span className="shelf-total-label">{total} {total===1?"livro":"livros"}</span></div>
      <LazyHorizontalBookShelf initialBooks={initialBooks} total={total} categorySlug={category.slug} isAdmin={isAdmin}/>
    </section>}
  </section>;
}
