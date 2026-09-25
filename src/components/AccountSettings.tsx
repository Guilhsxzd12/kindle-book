"use client";
import { useState } from "react";

type Profile={email:string|null;full_name:string|null;username?:string|null};
type Draft={fullName:string;username:string;currentPassword:string;password:string;confirmPassword:string};

export function AccountSettings({initialProfile}:{initialProfile:Profile}){
  const [profile,setProfile]=useState(initialProfile);
  const [draft,setDraft]=useState<Draft>({fullName:initialProfile.full_name||"",username:initialProfile.username||"",currentPassword:"",password:"",confirmPassword:""});
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [success,setSuccess]=useState(false);

  async function submit(event:React.FormEvent){
    event.preventDefault();setMessage("");setSuccess(false);
    if(draft.password&&draft.password!==draft.confirmPassword){setMessage("A confirmação da nova senha não confere.");return;}
    if(draft.password&&!draft.currentPassword){setMessage("Digite sua senha atual para confirmar a troca de senha.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/account",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({fullName:draft.fullName,username:draft.username,currentPassword:draft.currentPassword,password:draft.password})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Não foi possível salvar.");
      setProfile(data.profile);setDraft(d=>({...d,fullName:data.profile.full_name||"",username:data.profile.username||"",currentPassword:"",password:"",confirmPassword:""}));
      setSuccess(true);setMessage(data.passwordChanged?"Dados atualizados e nova senha salva com sucesso.":"Dados da conta atualizados com sucesso.");
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível salvar.");setSuccess(false);}finally{setBusy(false);}
  }

  return <div className="account-settings-grid">
    <section className="card panel account-settings-card">
      <span className="eyebrow">DADOS DE ACESSO</span><h2>Minha conta</h2><p className="muted">Altere seu nome, nome de usuário ou senha. Nenhum e-mail é necessário para usar sua conta.</p>
      {message&&<div className={`notice ${success?"success":""}`}>{message}</div>}
      <form className="account-settings-form" onSubmit={submit}>
        <div className="account-form-grid">
          <label>Nome<input value={draft.fullName} onChange={e=>setDraft(d=>({...d,fullName:e.target.value}))} autoComplete="name" required minLength={2}/></label>
          <label>Nome de usuário<input value={draft.username} onChange={e=>setDraft(d=>({...d,username:e.target.value}))} autoComplete="username" minLength={3} required/><small>Use este nome para entrar no LeituraVerso.</small></label>
        </div>
        <div className="account-password-box">
          <div><strong>Segurança</strong><p className="muted">Deixe os campos de nova senha vazios se não quiser alterá-la.</p></div>
          <label>Senha atual<input type="password" value={draft.currentPassword} onChange={e=>setDraft(d=>({...d,currentPassword:e.target.value}))} autoComplete="current-password" placeholder="Obrigatória para trocar a senha"/></label>
          <div className="account-form-grid">
            <label>Nova senha<input type="password" minLength={8} value={draft.password} onChange={e=>setDraft(d=>({...d,password:e.target.value}))} autoComplete="new-password" placeholder="Mínimo 8 caracteres"/></label>
            <label>Confirmar nova senha<input type="password" minLength={8} value={draft.confirmPassword} onChange={e=>setDraft(d=>({...d,confirmPassword:e.target.value}))} autoComplete="new-password" placeholder="Repita a nova senha"/></label>
          </div>
        </div>
        <div className="account-save-row"><button className="btn" type="submit" disabled={busy}>{busy?"Salvando...":"Salvar alterações"}</button></div>
      </form>
    </section>
    <aside className="card panel account-access-card"><span className="eyebrow">COMO FUNCIONA</span><h2>Seus acessos</h2><div className="account-access-item"><strong>🌐 Site</strong><p>Você pode entrar na mesma conta em vários computadores, celulares e tablets. O site não limita a conta a um único dispositivo.</p></div><div className="account-access-item"><strong>✈️ Bot do Telegram</strong><p>Por enquanto, cada assinatura pode ficar vinculada a apenas uma conta do Telegram por vez. Para trocar, use <b>Sair / Trocar conta</b> no bot e faça o login no outro Telegram.</p></div><div className="account-access-item"><strong>🔐 Alterações sensíveis</strong><p>A troca de senha exige a senha atual, além de uma sessão já autenticada no site.</p></div></aside>
  </div>;
}
