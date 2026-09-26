import Link from "next/link";

function SearchIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>}
function RequestIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>}
function UserIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/></svg>}
function TelegramIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 9.6 15.1M21 4l-6.2 16-5.2-4.9L5.9 18l1.2-5.4L3 10.9 21 4Z"/></svg>}
function WhatsAppIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L4 20.3l1.1-4A8.4 8.4 0 1 1 20.5 11.8Z"/><path d="M8.7 7.8c.3-.3.7-.2.9.1l1 1.7c.2.3.1.6-.1.8l-.6.6c.7 1.4 1.8 2.5 3.3 3.2l.6-.7c.2-.2.5-.3.8-.1l1.7.9c.3.2.4.6.2.9-.5.8-1.4 1.3-2.3 1.2-3.8-.4-6.8-3.4-7.3-7.2-.1-.6.3-1.1.8-1.4Z"/></svg>}

export function StableSiteShell({children,isAdmin=false}:{children:React.ReactNode;isAdmin?:boolean}){
  return <div className="stable-site-shell">
    <header className="stable-header">
      <div className="stable-header-inner">
        <Link className="stable-brand" href="/biblioteca" aria-label="LeituraVerso — início">
          <img src="/leituraverso-header-final.svg" alt="LEITURAVERSO"/>
        </Link>

        <nav className="stable-nav" aria-label="Navegação principal">
          <Link href="/biblioteca">Início</Link>
          <Link href="/biblioteca?todos=1">Categorias <span>⌄</span></Link>
          <Link href="/biblioteca#novidades">Novidades</Link>
          <Link href="/ajuda">Ajuda</Link>
          {isAdmin&&<Link href="/admin">Admin</Link>}
        </nav>

        <form className="stable-search" action="/biblioteca" method="get">
          <SearchIcon/>
          <input name="q" placeholder="Livro ou autor..."/>
          <button type="submit">Buscar</button>
        </form>

        <Link className="stable-request" href="/pedido"><RequestIcon/><span>Pedir livro</span></Link>
        <div className="stable-user" aria-label="Conta"><UserIcon/></div>
      </div>
    </header>

    <div className="stable-site-content">{children}</div>

    <div className="stable-floating-contact" aria-label="Atendimento">
      <a className="stable-contact telegram" href="/api/telegram/open" target="_blank" rel="noreferrer" aria-label="Telegram"><TelegramIcon/></a>
      <a className="stable-contact whatsapp" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon/></a>
    </div>
  </div>;
}
