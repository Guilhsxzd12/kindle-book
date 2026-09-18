import Link from "next/link";
import { catalogAuthors } from "@/lib/catalog";
import { redirect } from "next/navigation";
import { getViewer,requireApproved } from "@/lib/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { NavigationProgress } from "@/components/HorizontalBookSlider";
import { SiteFooter } from "@/components/SiteFooter";
import type { Category,Profile } from "@/lib/types";

function Icon({name}:{name:"search"|"request"|"chevron"|"menu"}){
  const common={width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
  if(name==="request")return <svg {...common}><path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/></svg>;
  if(name==="chevron")return <svg {...common}><path d="m8 10 4 4 4-4"/></svg>;
  if(name==="menu")return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

function WhatsAppIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L4 20.3l1.1-4A8.4 8.4 0 1 1 20.5 11.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.7 7.8c.3-.3.7-.2.9.1l1 1.7c.2.3.1.6-.1.8l-.6.6c.7 1.4 1.8 2.5 3.3 3.2l.6-.7c.2-.2.5-.3.8-.1l1.7.9c.3.2.4.6.2.9-.5.8-1.4 1.3-2.3 1.2-3.8-.4-6.8-3.4-7.3-7.2-.1-.6.3-1.1.8-1.4Z" fill="currentColor"/></svg>}
function TelegramIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 9.6 15.1M21 4l-6.2 16-5.2-4.9L5.9 18l1.2-5.4L3 10.9 21 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}

export async function AppShell({children,allowInactive=false}:{children:React.ReactNode;allowInactive?:boolean}){
  const viewer=allowInactive?await getViewer():await requireApproved();
  if(!viewer.user)redirect("/login");
  if(!viewer.profile)redirect("/aguardando-aprovacao");
  const profile=viewer.profile as Profile;const supabase=viewer.supabase;const admin=profile.role==="admin";
  const [{data:categoryData},authorData]=await Promise.all([
    supabase.from("categories").select("id,name,slug,parent_id,sort_order").order("sort_order").order("name"),
    catalogAuthors(supabase)
  ]);
  const allCategories=(categoryData||[]) as Category[];
  const categories=allCategories.filter(category=>!category.parent_id);
  const authors=authorData.slice(0,18);

  const categoryLinks=categories.map(category=><Link key={category.id} href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>{category.name}</Link>);
  const authorLinks=authors.map(author=><Link key={author} href={`/biblioteca?autor=${encodeURIComponent(author)}`}>{author}</Link>);

  return <div className="app-shell">
    <NavigationProgress/>
    <header className="app-header store-header capsule-store-header">
      <div className="header-capsule shell-width">
        <Link className="brand brand-logo capsule-brand" href="/biblioteca" aria-label="Kindle Books — início"><img src="/kindle-books-logo-light.svg" alt="KINDLE BOOKS"/></Link>

        <nav className="header-nav capsule-nav" aria-label="Navegação do catálogo">
          <Link href="/biblioteca">Início</Link>
          <div className="nav-dropdown capsule-dropdown">
            <button className="capsule-dropdown-trigger" type="button" aria-haspopup="true">Categorias <Icon name="chevron"/></button>
            <div className="nav-dropdown-menu capsule-dropdown-menu categories-menu"><span className="dropdown-kicker">Explore por categoria</span><div className="dropdown-link-grid">{categoryLinks}</div><Link className="dropdown-see-all" href="/biblioteca">Ver todo o acervo →</Link></div>
          </div>
          <div className="nav-dropdown capsule-dropdown">
            <button className="capsule-dropdown-trigger" type="button" aria-haspopup="true">Autores <Icon name="chevron"/></button>
            <div className="nav-dropdown-menu capsule-dropdown-menu authors-menu"><span className="dropdown-kicker">Autores do acervo</span><div className="dropdown-link-grid">{authorLinks}</div><Link className="dropdown-see-all" href="/biblioteca">Ver todos os livros →</Link></div>
          </div>
          <Link href="/biblioteca#novidades">Novidades</Link>
          <Link href="/favoritos">Favoritos</Link>
          <Link href="/ajuda">Ajuda</Link>
          {admin&&<Link href="/admin">Admin</Link>}
        </nav>

        <form className="header-search store-search capsule-search" action="/biblioteca" method="get"><Icon name="search"/><input name="q" placeholder="Livro ou autor..." aria-label="Pesquisar livros"/><button type="submit">Buscar</button></form>
        <Link className="header-request-btn capsule-request" href="/pedido"><Icon name="request"/>Pedir livro</Link>
        <AccountMenu fullName={profile.full_name} email={profile.email} username={profile.username}/>
        <Link className="mobile-header-request" href="/pedido" aria-label="Pedir livro"><Icon name="request"/><span>PEDIR LIVRO</span></Link>

        <details className="capsule-mobile-menu">
          <summary aria-label="Abrir menu"><Icon name="menu"/></summary>
          <div className="capsule-mobile-panel">
            <form className="mobile-capsule-search" action="/biblioteca" method="get"><Icon name="search"/><input name="q" placeholder="Pesquisar livro ou autor..." aria-label="Pesquisar livros"/><button type="submit">Buscar</button></form>
            <nav aria-label="Menu móvel">
              <Link href="/biblioteca">Início</Link>
              <details className="mobile-menu-group"><summary>Categorias <Icon name="chevron"/></summary><div>{categoryLinks}</div></details>
              <details className="mobile-menu-group"><summary>Autores <Icon name="chevron"/></summary><div>{authorLinks}</div></details>
              <Link href="/biblioteca#novidades">Novidades</Link>
              <Link href="/favoritos">Favoritos</Link>
              <Link href="/ajuda">Ajuda</Link>
              {admin&&<Link href="/admin">Admin</Link>}
              <Link className="mobile-request-link" href="/pedido"><Icon name="request"/>Pedir livro</Link>
            </nav>
          </div>
        </details>
      </div>
    </header>

    {children}

    <SiteFooter categories={categories}/>

    <div className="floating-contact" aria-label="Atendimento">
      <a className="contact-bubble telegram" href="/api/telegram/open" target="_blank" rel="noreferrer" aria-label="Abrir bot do Telegram" title="Telegram"><TelegramIcon/></a>
      <a className="contact-bubble whatsapp" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp" title="WhatsApp"><WhatsAppIcon/></a>
    </div>
  </div>;
}
