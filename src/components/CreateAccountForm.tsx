"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateAccountForm({initialCode=""}:{initialCode?:string}){
  const [code,setCode]=useState(initialCode);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const router=useRouter();

  async function submit(event:React.FormEvent){
    event.preventDefault();setMessage("");
    if(password!==confirmPassword){setMessage("As senhas não coincidem.");return;}
    setLoading(true);
    try{
      const response=await fetch("/api/auth/register-code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,username,password})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Não foi possível criar a conta.");
      router.replace("/login?created=1");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível criar a conta.");}
    finally{setLoading(false);}
  }

  return <div className="oda-login-shell">
    <div className="oda-login-brand"><img src="/kindle-books-logo-footer.svg" alt="LEITURAVERSO"/></div>
    <section className="oda-login-card">
      <div className="oda-login-intro"><span className="eyebrow">NOVO ACESSO</span><h1>Crie seu usuário</h1><p>Use o código que você recebeu após a confirmação do pagamento. Não é necessário informar e-mail.</p></div>
      <form className="oda-login-form" onSubmit={submit}>
        <label>Código de acesso<input type="text" inputMode="numeric" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="\\d{6}" required/><small>Digite os 6 números recebidos.</small></label>
        <label>Nome de usuário<input type="text" value={username} onChange={event=>setUsername(event.target.value.toLowerCase())} placeholder="ex: leitor.2026" autoComplete="username" minLength={3} maxLength={24} pattern="[a-z0-9._-]{3,24}" required/><small>Use letras minúsculas, números, ponto, hífen ou underline.</small></label>
        <label>Crie uma senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} required/></label>
        <label>Confirme a senha<input type="password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Repita a senha" autoComplete="new-password" minLength={8} required/></label>
        <button className="oda-login-submit" disabled={loading}>{loading?"Criando conta...":"Criar minha conta"}</button>
      </form>
      {message&&<p className="oda-login-error">{message}</p>}
      <div className="oda-login-divider"><span/>ou<span/></div>
      <a className="oda-register-button" href="/login">Já tenho usuário</a>
    </section>
    <p className="oda-login-footer">LEITURAVERSO · acesso particular</p>
  </div>;
}
