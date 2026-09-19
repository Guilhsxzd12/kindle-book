"use client";
import { useEffect,useMemo,useState } from "react";

type Row={
  profile:{id:string;email:string|null;full_name:string|null;username:string|null;approved:boolean;role:string};
  subscription:{status:string;plan_type:"monthly"|"lifetime";active_until:string|null;activated_at:string|null;note:string|null}|null;
  telegram:{telegram_user_id:number;username:string|null;first_name:string|null;linked_at:string}|null;
};
type Channel={id:string;chat_id:number;title:string|null;role:"official"|"reserve";active:boolean;welcome_sent_at:string|null;updated_at:string};
type WebhookInfo={url?:string;pending_update_count?:number;last_error_message?:string;last_error_date?:number;allowed_updates?:string[]};
type EditDraft={fullName:string;email:string;username:string;password:string};

function date(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short"}).format(new Date(value));}
function dateTime(value?:number){if(!value)return "";return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value*1000));}
function isLifetime(row:Row){return row.subscription?.plan_type==="lifetime";}
function isActive(row:Row){return row.subscription?.status==="active"&&(isLifetime(row)||!!row.subscription.active_until&&new Date(row.subscription.active_until).getTime()>Date.now());}

export function SubscriptionsAdmin(){
  const [rows,setRows]=useState<Row[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState<string|null>(null);const [search,setSearch]=useState("");const [message,setMessage]=useState("");
  const [bot,setBot]=useState<{username?:string;first_name?:string}|null>(null);const [botBusy,setBotBusy]=useState(false);const [webhook,setWebhook]=useState<WebhookInfo|null>(null);const [botHealthy,setBotHealthy]=useState(false);const [channels,setChannels]=useState<Channel[]>([]);
  const [channelTarget,setChannelTarget]=useState("");const [channelRole,setChannelRole]=useState<"official"|"reserve">("official");const [channelBusy,setChannelBusy]=useState(false);
  const [editing,setEditing]=useState<Row|null>(null);const [editDraft,setEditDraft]=useState<EditDraft>({fullName:"",email:"",username:"",password:""});

  async function load(){setLoading(true);try{const r=await fetch("/api/admin/subscriptions",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erro ao carregar assinaturas.");setRows(d.rows||[]);}catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar.");}finally{setLoading(false);}}
  async function loadTelegram(){
    try{
      const [setupResponse,channelResponse]=await Promise.all([fetch("/api/telegram/setup",{cache:"no-store"}),fetch("/api/admin/telegram/channels",{cache:"no-store"})]);
      const setup=await setupResponse.json();const channelData=await channelResponse.json();
      if(setupResponse.ok){setBot(setup.bot||null);setWebhook(setup.webhookInfo||null);setBotHealthy(Boolean(setup.healthy));}
      if(channelResponse.ok){setChannels(channelData.channels||[]);if(channelData.webhookInfo)setWebhook(channelData.webhookInfo);if(typeof channelData.healthy==="boolean")setBotHealthy(channelData.healthy);}
    }catch{}
  }
  useEffect(()=>{void load();void loadTelegram();},[]);

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase().replace(/^@/,"");if(!q)return rows;return rows.filter(r=>[r.profile.full_name,r.profile.email,r.profile.username,r.telegram?.username,r.telegram?.first_name].some(v=>String(v||"").toLowerCase().includes(q)));},[rows,search]);
  const official=channels.find(channel=>channel.role==="official");const reserve=channels.find(channel=>channel.role==="reserve");

  async function change(userId:string,action:"renew"|"lifetime"|"cancel"){
    setBusy(userId);setMessage("");try{const r=await fetch("/api/admin/subscriptions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,action})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível atualizar.");setMessage(action==="renew"?"Assinatura mensal renovada: +30 dias adicionados ao período atual.":action==="lifetime"?"Acesso vitalício liberado.":"Assinatura cancelada.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Erro ao atualizar.");}finally{setBusy(null);}
  }
  async function setupBot(){setBotBusy(true);setMessage("");try{const r=await fetch("/api/telegram/setup",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao ativar bot.");setBot(d.bot||null);setWebhook(d.webhookInfo||null);setBotHealthy(Boolean(d.healthy));setMessage(`Bot @${d.bot?.username||"Telegram"} conectado ao site por webhook. Ele continua recebendo eventos mesmo com o site fechado.`);await loadTelegram();}catch(e){setMessage(e instanceof Error?e.message:"Erro ao ativar bot.");}finally{setBotBusy(false);}}
  async function registerChannel(){
    if(!channelTarget.trim()){setMessage("Informe o @usuário, link t.me ou ID do canal.");return;}
    setChannelBusy(true);setMessage("");try{
      const r=await fetch("/api/admin/telegram/channels",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"register",target:channelTarget.trim(),role:channelRole})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível registrar o canal.");
      setChannelTarget("");setMessage(`${channelRole==="official"?"Canal Oficial":"Canal Reserva"} reconhecido e testado com sucesso.`);await loadTelegram();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao registrar canal.");}finally{setChannelBusy(false);}
  }
  async function resendWelcome(){setChannelBusy(true);setMessage("");try{const r=await fetch("/api/admin/telegram/channels",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"welcome"})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível testar os canais.");setMessage("Mensagem de teste enviada aos canais cadastrados.");await loadTelegram();}catch(e){setMessage(e instanceof Error?e.message:"Falha ao testar canais.");}finally{setChannelBusy(false);}}

  function openEdit(row:Row){setEditing(row);setEditDraft({fullName:row.profile.full_name||"",email:row.profile.email||"",username:row.profile.username||"",password:""});}
  async function saveUser(){
    if(!editing)return;setBusy(editing.profile.id);setMessage("");try{
      const body={id:editing.profile.id,fullName:editDraft.fullName,email:editDraft.email,username:editDraft.username,...(editDraft.password?{password:editDraft.password}:{})};
      const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível editar o usuário.");
      setEditing(null);setMessage("Dados de login atualizados com sucesso.");await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao editar usuário.");}finally{setBusy(null);}
  }
  async function removeUser(row:Row){
    const label=row.profile.full_name||row.profile.email||"este usuário";if(!window.confirm(`Remover definitivamente ${label}? O login, a assinatura e os vínculos dessa conta serão excluídos.`))return;
    setBusy(row.profile.id);setMessage("");try{const r=await fetch("/api/admin/users",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:row.profile.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível remover o usuário.");setMessage("Usuário removido com sucesso.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Erro ao remover usuário.");}finally{setBusy(null);}
  }

  return <div className="subscriptions-admin">
    <section className="card panel telegram-admin-card">
      <div className="telegram-admin-head">
        <div><span className="eyebrow">CONEXÃO 24 HORAS</span><h2>Bot do Telegram</h2><p className="muted">O bot usa webhook: o Telegram chama o site automaticamente quando chega um evento. Não depende de você manter o painel aberto.</p></div>
        <button className="btn" onClick={setupBot} disabled={botBusy}>{botBusy?"Sincronizando...":"Sincronizar bot"}</button>
      </div>
      <div className="telegram-health-grid">
        <div className={`telegram-health-card ${botHealthy?"ok":"warn"}`}><span className="status-dot"/><div><strong>{botHealthy?"Webhook online":"Webhook precisa de atenção"}</strong><small>{bot?`@${bot.username||bot.first_name}`:"Bot não consultado"}</small></div></div>
        <div className="telegram-health-card"><div><strong>{webhook?.pending_update_count||0}</strong><small>atualizações pendentes</small></div></div>
        <div className="telegram-health-card"><div><strong>{channels.length}/2</strong><small>canais cadastrados</small></div></div>
      </div>
      {webhook?.last_error_message&&<div className="notice"><strong>Último erro do Telegram:</strong> {webhook.last_error_message}{webhook.last_error_date?` • ${dateTime(webhook.last_error_date)}`:""}</div>}

      <div className="channel-status-grid">
        <div className={`channel-status-card ${official?"connected":"missing"}`}><span>OFICIAL</span><strong>{official?.title||"Não cadastrado"}</strong><small>{official?`ID ${official.chat_id} • ${official.welcome_sent_at?"teste enviado":"aguardando teste"}`:"Cadastre abaixo ou encaminhe uma publicação ao bot."}</small></div>
        <div className={`channel-status-card ${reserve?"connected":"missing"}`}><span>RESERVA</span><strong>{reserve?.title||"Não cadastrado"}</strong><small>{reserve?`ID ${reserve.chat_id} • ${reserve.welcome_sent_at?"teste enviado":"aguardando teste"}`:"Cadastre abaixo ou encaminhe uma publicação ao bot."}</small></div>
      </div>

      <div className="channel-register-box">
        <div><strong>Cadastrar ou corrigir canal</strong><p className="muted">Para canal público, cole <b>@usuario</b> ou o link <b>t.me/...</b>. Para canal privado, encaminhe uma publicação desse canal para o bot no seu chat de administrador; ele reconhecerá automaticamente.</p></div>
        <div className="channel-register-form">
          <select value={channelRole} onChange={e=>setChannelRole(e.target.value as "official"|"reserve")} aria-label="Função do canal"><option value="official">Canal Oficial</option><option value="reserve">Canal Reserva</option></select>
          <input value={channelTarget} onChange={e=>setChannelTarget(e.target.value)} placeholder="@canal, t.me/canal ou ID" aria-label="Canal do Telegram"/>
          <button className="btn" onClick={registerChannel} disabled={channelBusy}>{channelBusy?"Verificando...":"Cadastrar e testar"}</button>
        </div>
        {!!channels.length&&<button className="btn ghost telegram-test-btn" onClick={resendWelcome} disabled={channelBusy}>Enviar teste aos canais</button>}
      </div>
    </section>

    {message&&<div className={`notice ${/sucesso|renovada|conectado|reconhecido|enviada/i.test(message)?"success":""}`}>{message}</div>}

    <section className="card panel subscriptions-panel">
      <div className="subscriptions-head"><div><span className="eyebrow">ACESSOS</span><h2>Assinaturas e logins</h2><p className="muted">Libere 30 dias, torne o acesso vitalício, bloqueie uma assinatura ou remova uma conta.</p></div><label className="subscription-search">Buscar usuário<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, e-mail, usuário ou @telegram"/></label></div>
      {loading?<p className="muted">Carregando...</p>:<div className="subscription-list">{filtered.length?filtered.map(row=>{const active=isActive(row);const lifetime=isLifetime(row);const expired=row.subscription?.status==="active"&&!active&&!lifetime;return <article className="subscription-user-card" key={row.profile.id}>
        <div className="subscription-user-info"><strong>{row.profile.full_name||row.profile.email||"Usuário"}</strong><div className="meta">{row.profile.email||"sem e-mail"}{row.profile.username?` • usuário: ${row.profile.username}`:""}</div><div className="meta">{row.telegram?`Telegram: @${row.telegram.username||row.telegram.first_name||row.telegram.telegram_user_id}`:"Telegram não vinculado"}</div><div className={`subscription-state ${active?"active":"inactive"}`}>{active?(lifetime?"♾️ Vitalício":`✅ Mensal • vence ${date(row.subscription?.active_until)}`):expired?`⏰ Mensal expirada • venceu ${date(row.subscription?.active_until)}`:row.subscription?.status==="canceled"?"⛔ Bloqueada":"⚪ Inativa"} • {row.profile.approved?"conta cadastrada":"conta aguardando"}</div></div>
        <div className="subscription-user-actions"><button className="btn" disabled={busy===row.profile.id||(active&&lifetime)} onClick={()=>change(row.profile.id,"renew")}>{active&&!lifetime?"Renovar +30 dias":"Liberar 30 dias"}</button><button className="btn" disabled={busy===row.profile.id||(active&&lifetime)} onClick={()=>change(row.profile.id,"lifetime")}>{active&&lifetime?"Vitalício ativo":"Tornar vitalício"}</button><button className="btn ghost" disabled={busy===row.profile.id} onClick={()=>openEdit(row)}>Editar login</button><button className="btn danger" disabled={busy===row.profile.id||!active} onClick={()=>change(row.profile.id,"cancel")}>Bloquear</button><button className="btn danger ghost-danger" disabled={busy===row.profile.id} onClick={()=>removeUser(row)}>Remover</button></div>
      </article>}):<p className="muted">Nenhum usuário encontrado.</p>}</div>}
    </section>

    {editing&&<div className="admin-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&busy!==editing.profile.id)setEditing(null);}}><section className="admin-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <div className="admin-edit-modal-head"><div><span className="eyebrow">EDITAR ACESSO</span><h2 id="edit-user-title">{editing.profile.full_name||"Usuário"}</h2></div><button type="button" className="icon-close" onClick={()=>setEditing(null)} aria-label="Fechar">×</button></div>
      <div className="edit-user-grid"><label>Nome<input value={editDraft.fullName} onChange={e=>setEditDraft(d=>({...d,fullName:e.target.value}))}/></label><label>E-mail<input type="email" value={editDraft.email} onChange={e=>setEditDraft(d=>({...d,email:e.target.value}))}/></label><label>Nome de usuário<input value={editDraft.username} onChange={e=>setEditDraft(d=>({...d,username:e.target.value}))} placeholder="usuario"/></label><label>Nova senha <small>Deixe vazio para manter a atual.</small><input type="password" minLength={8} value={editDraft.password} onChange={e=>setEditDraft(d=>({...d,password:e.target.value}))} placeholder="Mínimo 8 caracteres"/></label></div>
      <div className="admin-edit-actions"><button className="btn ghost" onClick={()=>setEditing(null)} disabled={busy===editing.profile.id}>Cancelar</button><button className="btn" onClick={saveUser} disabled={busy===editing.profile.id}>{busy===editing.profile.id?"Salvando...":"Salvar alterações"}</button></div>
    </section></div>}
  </div>;
}
