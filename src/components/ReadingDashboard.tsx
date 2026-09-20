"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";

type Stats={total:number;pending:number;processing:number;completed:number;error:number;unavailable:number};
type ReadingItem={
  book_id:string;status:string;attempts:number;source_format:string|null;detected_title:string|null;detected_author:string|null;
  detected_category_name:string|null;confidence:string|null;changes:Record<string,unknown>|null;error:string|null;
  started_at:string|null;completed_at:string|null;updated_at:string;
  book:{id:string;title:string;author:string;slug:string;cover_url:string|null}|null;
};
type Payload={stats:Stats;items:ReadingItem[];updatedAt:string};

function time(value?:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit",day:"2-digit",month:"2-digit"}).format(new Date(value));
}
function confidenceLabel(value?:string|null){
  return ({metadata:"metadados internos",content:"conteúdo do arquivo",lookup:"fonte externa",filename:"nome do arquivo",catalog:"catálogo"} as Record<string,string>)[value||""]||value||"—";
}

export function ReadingDashboard(){
  const [data,setData]=useState<Payload|null>(null);
  const [active,setActive]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const stopped=useRef(false);

  async function refresh(){
    try{
      const response=await fetch("/api/admin/reading",{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"Não foi possível carregar a leitura.");
      setData(json);setError("");
    }catch(err){setError(err instanceof Error?err.message:"Falha ao atualizar.");}
  }

  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},3000);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    stopped.current=false;
    if(!active)return()=>{stopped.current=true;};
    let timer:number|undefined;
    const run=async()=>{
      if(stopped.current||document.visibilityState!=="visible"){timer=window.setTimeout(run,2500);return;}
      setWorking(true);
      try{
        const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({limit:1})});
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||"Falha ao processar.");
        await refresh();
        const processed=(json.results||[]).length;
        timer=window.setTimeout(run,processed?900:5000);
      }catch(err){
        setError(err instanceof Error?err.message:"Falha ao processar.");
        timer=window.setTimeout(run,5000);
      }finally{if(!stopped.current)setWorking(false);}
    };
    void run();
    return()=>{stopped.current=true;if(timer)window.clearTimeout(timer);};
  },[active]);

  const stats=data?.stats||{total:0,pending:0,processing:0,completed:0,error:0,unavailable:0};
  const processable=Math.max(0,stats.total-stats.unavailable);
  const remaining=stats.pending+stats.processing+stats.error;
  const percent=processable?Math.round(stats.completed/processable*100):0;
  const current=useMemo(()=>data?.items.filter(item=>item.status==="processing").slice(0,8)||[],[data]);
  const recent=useMemo(()=>data?.items.filter(item=>item.status==="completed"||item.status==="error").slice(0,24)||[],[data]);

  async function retryErrors(){
    const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"retry-errors"})});
    const json=await response.json();if(!response.ok){setError(json.error||"Não foi possível reenfileirar.");return;}await refresh();
  }

  return <section className="reading-dashboard">
    <div className="reading-hero card panel">
      <div>
        <span className="eyebrow">LEITURA AUTOMÁTICA DO ACERVO</span>
        <h2>Identificação por PDF e EPUB</h2>
        <p>O sistema abre os arquivos, lê metadados e as primeiras páginas quando necessário, identifica título, autor e ISBN, consulta fontes externas e tenta classificar o livro automaticamente.</p>
      </div>
      <div className="reading-controls">
        <span className={`reading-live ${active?"on":""}`}><i/>{working?"Lendo agora":"Monitoramento ativo"}</span>
        <button type="button" className={active?"btn ghost":"btn"} onClick={()=>setActive(value=>!value)}>{active?"Pausar nesta tela":"Continuar leitura"}</button>
      </div>
    </div>

    {error&&<div className="notice">{error}</div>}

    <div className="reading-stats">
      <article className="card"><span>Total no acervo</span><strong>{stats.total.toLocaleString("pt-BR")}</strong><small>livros acompanhados</small></article>
      <article className="card"><span>Concluídos</span><strong>{stats.completed.toLocaleString("pt-BR")}</strong><small>{percent}% dos livros com arquivo</small></article>
      <article className="card"><span>Faltam</span><strong>{remaining.toLocaleString("pt-BR")}</strong><small>fila + leitura + falhas</small></article>
      <article className="card"><span>Lendo agora</span><strong>{stats.processing.toLocaleString("pt-BR")}</strong><small>arquivos em processamento</small></article>
      <article className="card"><span>Sem arquivo</span><strong>{stats.unavailable.toLocaleString("pt-BR")}</strong><small>não há PDF/EPUB para abrir</small></article>
    </div>

    <div className="reading-progress card">
      <div className="reading-progress-head"><strong>Progresso da leitura</strong><span>{stats.completed.toLocaleString("pt-BR")} / {processable.toLocaleString("pt-BR")}</span></div>
      <div className="reading-progress-track"><i style={{width:`${Math.min(100,percent)}%`}}/></div>
      <small>O servidor continua processando a fila automaticamente a cada 2 minutos, mesmo com esta aba fechada. Com a aba LEITURA aberta, o processamento é acelerado.</small>
    </div>

    <div className="reading-columns">
      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">AGORA</span><h2>Livros sendo lidos</h2></div><span className="count-badge">{stats.processing}</span></div>
        <div className="reading-list">{current.length?current.map(item=><article className="reading-row" key={item.book_id}>
          {item.book?.cover_url?<img src={item.book.cover_url} alt=""/>:<span className="mini-cover"/>}
          <div><strong>{item.book?.title||item.detected_title||"Livro"}</strong><small>{item.source_format?.toUpperCase()||"ARQUIVO"} • tentativa {item.attempts} • iniciado {time(item.started_at)}</small></div>
          <span className="reading-spinner" aria-label="Lendo"/>
        </article>):<div className="empty-state"><h3>Aguardando próximo livro</h3><p>A fila será retomada automaticamente.</p></div>}</div>
      </section>

      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">HISTÓRICO</span><h2>Concluídos recentemente</h2></div><div className="row wrap">{stats.error>0&&<button type="button" className="btn ghost small" onClick={()=>void retryErrors()}>Tentar falhas novamente ({stats.error})</button>}</div></div>
        <div className="reading-list">{recent.length?recent.map(item=><article className={`reading-row ${item.status==="error"?"reading-error":""}`} key={item.book_id}>
          {item.book?.cover_url?<img src={item.book.cover_url} alt=""/>:<span className="mini-cover"/>}
          <div>
            <strong>{item.detected_title||item.book?.title||"Livro"}</strong>
            <small>{item.status==="completed"?`${item.detected_author||item.book?.author||"Autor não identificado"} • ${item.detected_category_name||"categoria não identificada"} • ${confidenceLabel(item.confidence)}`:(item.error||"Falha na leitura")}</small>
            {item.status==="completed"&&item.changes&&Object.keys(item.changes).length>0&&<small>Atualizado: {Object.keys(item.changes).join(", ")}.</small>}
          </div>
          {item.book?.slug?<Link className="btn ghost small" href={`/livro/${item.book.slug}`} target="_blank">Abrir ↗</Link>:<span>{item.status==="completed"?"✓":"!"}</span>}
        </article>):<div className="empty-state"><h3>Nenhuma leitura concluída ainda</h3><p>Os resultados vão aparecer aqui em tempo real.</p></div>}</div>
      </section>
    </div>

    <div className="reading-footnote">Última sincronização: {time(data?.updatedAt)} • a fila também recebe automaticamente os novos livros adicionados ao catálogo.</div>
  </section>;
}
