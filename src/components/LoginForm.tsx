"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:"/biblioteca";}

type ContactMode="access"|"password"|null;

export function LoginForm({next,created=false}:{next?:string;created?:boolean}){
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [contactMode,setContactMode]=useState<ContactMode>(null);
  const [showPassword,setShowPassword]=useState(false);
  const router=useRouter();

  async function submit(formData:FormData){
    setLoading(true);
    setMessage("");
    const identifier=String(formData.get("identifier")||"").trim();
    const password=String(formData.get("password")||"");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier,password})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Não foi possível entrar.");
      router.replace(safeNext(next));
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:"Usuário ou senha incorretos.");
    }finally{
      setLoading(false);
    }
  }

  const contactTitle=contactMode==="password"?"Recuperar acesso":"Comprar acesso";
  const contactText=contactMode==="password"?"Escolha onde prefere falar para recuperar sua senha.":"Escolha onde prefere falar para comprar seu acesso ao LeituraVerso.";

  return <div className="auth-shell">
    <section className="auth-card">
      <div className="auth-form-panel">
        <a className="auth-brand" href="/" aria-label="LeituraVerso">
          <img src="/leituraverso-footer-final.svg" alt="LEITURAVERSO"/>
        </a>

        <div className="auth-heading">
          <span className="auth-kicker">SUA BIBLIOTECA DIGITAL</span>
          <h1>Bem-vindo ao LeituraVerso</h1>
          <p>Entre com seu usuário e senha para acessar sua biblioteca digital.</p>
        </div>

        <form className="auth-form" action={submit}>
          <label className="auth-field">
            <span>Nome de usuário</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">⌁</span>
              <input type="text" name="identifier" placeholder="Seu usuário" autoComplete="username" required/>
            </div>
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">••</span>
              <input type={showPassword?"text":"password"} name="password" placeholder="Sua senha" minLength={6} autoComplete="current-password" required/>
              <button type="button" className="auth-eye" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Ocultar senha":"Mostrar senha"}>{showPassword?"Ocultar":"Mostrar"}</button>
            </div>
          </label>

          <div className="auth-row">
            <label className="auth-remember"><input type="checkbox" name="remember" defaultChecked/><span>Lembre de mim</span></label>
            <button type="button" className="auth-text-button" onClick={()=>setContactMode("password")}>Esqueceu sua senha?</button>
          </div>

          <button className="auth-primary" disabled={loading}>{loading?"Entrando...":"Entrar"}</button>
        </form>

        {created&&<div className="auth-success">Conta criada com sucesso. Entre com seu nome de usuário e senha.</div>}
        {message&&<p className="auth-error">{message}</p>}

        <div className="auth-divider"><span/><b>ou</b><span/></div>
        <a className="auth-secondary" href="/criar-conta">Criar usuário com código</a>

        <p className="auth-help">Ainda não tem acesso? <button type="button" onClick={()=>setContactMode("access")}>Fale com o atendimento</button>.</p>
        <p className="auth-footnote">LEITURAVERSO · sua biblioteca digital</p>
      </div>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual-glow auth-glow-a"/>
        <div className="auth-visual-glow auth-glow-b"/>
        <div className="auth-book-shape auth-book-1"/>
        <div className="auth-book-shape auth-book-2"/>
        <div className="auth-book-shape auth-book-3"/>
        <div className="auth-visual-content">
          <span className="auth-visual-chip">LEITURAVERSO</span>
          <h2>Sua biblioteca, do seu jeito.</h2>
          <p>Acesse seu acervo de e-books em PDF e EPUB com organização, praticidade e uma experiência feita para leitura.</p>
          <div className="auth-visual-stats">
            <div><strong>PDF</strong><span>e-books</span></div>
            <div><strong>EPUB</strong><span>Kindle</span></div>
            <div><strong>24h</strong><span>acesso</span></div>
          </div>
        </div>
      </aside>
    </section>

    {contactMode&&<div className="oda-contact-backdrop" role="presentation" onClick={()=>setContactMode(null)}>
      <div className="oda-contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={e=>e.stopPropagation()}>
        <button type="button" className="oda-contact-close" onClick={()=>setContactMode(null)} aria-label="Fechar">×</button>
        <span className="oda-contact-kicker">ATENDIMENTO</span><h2 id="contact-title">{contactTitle}</h2><p>{contactText}</p>
        <div className="oda-contact-options">
          <a className="oda-contact-option whatsapp" href="https://wa.me/5545999056277" target="_blank" rel="noreferrer"><strong>WhatsApp</strong><span>45 99905-6277</span></a>
          <a className="oda-contact-option telegram" href="https://t.me/kindlebookadm" target="_blank" rel="noreferrer"><strong>Telegram</strong><span>@kindlebookadm</span></a>
        </div>
      </div>
    </div>}
  </div>;
}
