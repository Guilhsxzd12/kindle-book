"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:"/biblioteca";}

type ContactMode="access"|"password"|null;

export function LoginForm({next,created=false}:{next?:string;created?:boolean}){
  const [loading,setLoading]=useState(false);const [message,setMessage]=useState("");const [contactMode,setContactMode]=useState<ContactMode>(null);const router=useRouter();
  async function submit(formData:FormData){
    setLoading(true);setMessage("");const identifier=String(formData.get("identifier")||"").trim();const password=String(formData.get("password")||"");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier,password})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Não foi possível entrar.");
      router.replace(safeNext(next));router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Usuário ou senha incorretos.");}finally{setLoading(false);}
  }
  const contactTitle=contactMode==="password"?"Recuperar acesso":"Comprar acesso";
  const contactText=contactMode==="password"?"Escolha onde prefere falar para recuperar sua senha.":"Escolha onde prefere falar para comprar seu acesso ao LeituraVerso.";
  return <div className="oda-login-shell">
    <div className="oda-login-brand"><img src="/leituraverso-logo.svg" alt="LEITURAVERSO"/></div>
    <section className="oda-login-card">
      <div className="oda-login-intro"><h1>Bem-vindo!</h1><p>Recebeu um código de acesso? <a className="oda-inline-link" href="/criar-conta">Crie seu usuário aqui</a>.</p><p>Caso já possua cadastro, faça o login abaixo.</p></div>
      <form className="oda-login-form" action={submit}>
        <label>Nome de usuário<input type="text" name="identifier" placeholder="Seu usuário" autoComplete="username" required/></label>
        <label>Senha<input type="password" name="password" placeholder="Senha" minLength={6} autoComplete="current-password" required/></label>
        <label className="oda-remember"><input type="checkbox" name="remember" defaultChecked/><span>Lembre de mim</span></label>
        <button className="oda-login-submit" disabled={loading}>{loading?"Entrando...":"Entrar"}</button>
      </form>
      {created&&<div className="notice success">Conta criada com sucesso. Entre com seu nome de usuário e senha.</div>}{message&&<p className="oda-login-error">{message}</p>}
      <div className="oda-login-divider"><span/>ou<span/></div>
      <a className="oda-register-button" href="/criar-conta">Criar usuário com código</a>
      <p className="oda-forgot">Ainda não tem acesso? <button type="button" className="oda-inline-link" onClick={()=>setContactMode("access")}>Fale com o atendimento</button>. Esqueceu sua senha? Recupere-a <button type="button" className="oda-inline-link" onClick={()=>setContactMode("password")}>aqui</button>.</p>
    </section>
    <p className="oda-login-footer">LEITURAVERSO · sua biblioteca digital</p>

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
