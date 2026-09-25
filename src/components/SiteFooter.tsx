import Link from "next/link";
import type { Category } from "@/lib/types";

export function SiteFooter({categories}:{categories:Category[]}){
  const year=new Date().getFullYear();
  return <footer className="site-footer">
    <div className="shell-width footer-main">
      <div className="footer-brand"><img src="/leituraverso-logo-dark-v2.svg" alt="LEITURAVERSO"/><p>Seu acervo de eBooks em PDF e EPUB para baixar e ler no app que preferir.</p></div>
      <div><h3>Navegação</h3><Link href="/biblioteca">Início</Link><Link href="/favoritos">Favoritos</Link><Link href="/pedido">Pedir livro</Link><Link href="/ajuda">Ajuda e FAQ</Link></div>
      <div><h3>Categorias</h3>{categories.slice(0,6).map(category=><Link key={category.id} href={`/biblioteca?categoria=${encodeURIComponent(category.slug)}`}>{category.name}</Link>)}<Link href="/biblioteca">Ver todo o acervo</Link></div>
      <div><h3>Atendimento</h3><a href="https://wa.me/5545999056277" target="_blank" rel="noreferrer">WhatsApp</a><a href="/api/telegram/open" target="_blank" rel="noreferrer">Bot do Telegram</a><Link href="/politica-de-privacidade">Política de privacidade</Link></div>
    </div>
    <div className="footer-bottom"><div className="shell-width"><span>© {year} LEITURAVERSO.</span><span>LeituraVerso é um acervo digital independente.</span></div></div>
  </footer>;
}
