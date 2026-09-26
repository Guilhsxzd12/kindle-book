"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateAccountForm({initialCode=""}:{initialCode?:string}){
  const [code,setCode]=useState(initialCode.replace(/\D/g,"").slice(0,6));
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const router=useRouter();

  async function submit(event:React.FormEvent){
    event.preventDefault();
    setMessage("");

    if(!/^\d{6}$/.test(code)){setMessage("Digite exatamente os 6 números do código de acesso.");return;}
    if(!/^[a-z0-9._-]{3,24}$/.test(username)){setMessage("Use de 3 a 24 caracteres no usuário: letras minúsculas, números, ponto, hífen ou underline.");return;}
    if(password.length<8){setMessage("A senha precisa ter pelo menos 8 caracteres.");return;}
    if(password!==confirmPassword){setMessage("As senhas não coincidem.");return;}

    setLoading(true);
    try{
      const response=await fetch("/api/auth/register-code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,username,password})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Não foi possível criar a conta.");
      router.replace("/login?created=1");
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:"Não foi possível criar a conta.");
    }finally{
      setLoading(false);
    }
  }

  return <div className="auth-shell">
    <section className="auth-card auth-card-create">
      <div className="auth-form-panel">
        <a className="auth-brand" href="/" aria-label="LeituraVerso">
          <img src="/leituraverso-footer-final.svg" alt="LEITURAVERSO"/>
        </a>

        <div className="auth-heading">
          <span className="auth-kicker">NOVO ACESSO</span>
          <h1>Crie seu usuário</h1>
          <p>Use o código recebido para ativar sua conta no LeituraVerso. Não é necessário informar e-mail.</p>
        </div>

        <form className="auth-form auth-create-form" onSubmit={submit} noValidate>
          <label className="auth-field">
            <span>Código de acesso</span>
            <div className="auth-input-wrap auth-code-wrap">
              <span className="auth-input-icon" aria-hidden="true">#</span>
              <input type="text" inputMode="numeric" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" autoComplete="one-time-code" maxLength={6}/>
              <small>{code.length}/6</small>
            </div>
            <small className="auth-hint">Digite os 6 números recebidos.</small>
          </label>

          <label className="auth-field">
            <span>Nome de usuário</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">@</span>
              <input type="text" value={username} onChange={event=>setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,"").slice(0,24))} placeholder="ex: guilhsxzd" autoComplete="username"/>
            </div>
            <small className="auth-hint">Letras minúsculas, números, ponto, hífen ou underline.</small>
          </label>

          <label className="auth-field">
            <span>Crie uma senha</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">••</span>
              <input type={showPassword?"text":"password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password"/>
              <button type="button" className="auth-eye" onClick={()=>setShowPassword(value=>!value)}>{showPassword?"Ocultar":"Mostrar"}</button>
            </div>
          </label>

          <label className="auth-field">
            <span>Confirme a senha</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">✓</span>
              <input type={showPassword?"text":"password"} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Repita sua senha" autoComplete="new-password"/>
            </div>
          </label>

          <button className="auth-primary" disabled={loading}>{loading?"Criando conta...":"Criar minha conta"}</button>
        </form>

        {message&&<p className="auth-error">{message}</p>}

        <div className="auth-divider"><span/><b>ou</b><span/></div>
        <a className="auth-secondary" href="/login">Já tenho usuário</a>
        <p className="auth-footnote">LEITURAVERSO · acesso particular</p>
      </div>

      <aside className="auth-visual auth-visual-create" aria-hidden="true">
        <div className="auth-visual-glow auth-glow-a"/>
        <div className="auth-visual-glow auth-glow-b"/>
        <div className="auth-orbit auth-orbit-1"/>
        <div className="auth-orbit auth-orbit-2"/>
        <div className="auth-visual-content">
          <span className="auth-visual-chip">SEU ACESSO COMEÇA AQUI</span>
          <h2>Uma conta. Todo o seu acervo.</h2>
          <p>Crie seu usuário com o código recebido e entre no LeituraVerso usando apenas nome de usuário e senha.</p>
          <div className="auth-feature-list">
            <span>✓ Login simples por usuário</span>
            <span>✓ Acesso ao catálogo digital</span>
            <span>✓ PDF e EPUB em um só lugar</span>
          </div>
        </div>
      </aside>
    </section>
  </div>;
}
