"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AccountMenuProps={fullName?:string|null;email?:string|null;username?:string|null};

function UserIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 20c.7-3.5 3.4-5.5 7.5-5.5s6.8 2 7.5 5.5"/></svg>}
function SettingsIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.2-.6a7 7 0 0 0-.7-1.6l1.1-2-2.1-2.1-2 1.1a7 7 0 0 0-1.6-.7L10.5 2h-3l-.6 2.2a7 7 0 0 0-1.6.7l-2-1.1-2.1 2.1 1.1 2a7 7 0 0 0-.7 1.6L0 10.5v3l2.2.6a7 7 0 0 0 .7 1.6l-1.1 2 2.1 2.1 2-1.1a7 7 0 0 0 1.6.7l.6 2.2h3l.6-2.2a7 7 0 0 0 1.6-.7l2 1.1 2.1-2.1-1.1-2a7 7 0 0 0 .7-1.6L19 13.5Z" transform="translate(2 0) scale(.83)"/></svg>}
function LogoutIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M8 12h9"/></svg>}

export function AccountMenu({fullName,email,username}:AccountMenuProps){
  const router=useRouter();
  async function signOut(){
    await createBrowserSupabaseClient().auth.signOut({scope:"local"});
    router.replace("/login");
    router.refresh();
  }
  return <details className="account-menu">
    <summary aria-label="Minha conta" title="Minha conta"><UserIcon/></summary>
    <div className="account-menu-panel">
      <div className="account-menu-identity"><span className="account-avatar"><UserIcon/></span><div><strong>{username?`@${username}`:fullName||"Minha conta"}</strong>{fullName&&fullName!==username&&<small>{fullName}</small>}</div></div>
      <Link className="account-menu-link" href="/minha-conta"><SettingsIcon/><span><strong>Minha conta</strong><small>Alterar usuário e senha</small></span></Link>
      <button type="button" className="account-menu-link account-menu-logout" onClick={signOut}><LogoutIcon/><span><strong>Sair</strong><small>Encerrar sessão neste dispositivo</small></span></button>
    </div>
  </details>;
}
