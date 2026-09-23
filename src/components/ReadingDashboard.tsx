"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";

type Field="cover"|"author"|"category"|"title"|"description"|"language";
type Stats={total:number;pending:number;processing:number;completed:number;error:number;unavailable:number};
type FieldItem={
  book_id:string;field:Field;status:string;attempts:number;detected_value:string|null;detection_source:string|null;
  changes:Record<string,unknown>|null;error:string|null;started_at:string|null;completed_at:string|null;updated_at:string;
  book:{id:string;title:string;author:string;slug:string;cover_url:string|null;description:string|null;language:string|null;category_id:string|null}|null;
};
type Payload={
  reviewStats:Record<Field,Stats>;
  reviewItems:FieldItem[];
  selectedField:Field;
  updatedAt:string;
};

const fieldConfig:Record<Field,{label:string;icon:string;title:string;description:string;detectedLabel:string}>={
  cover:{label:"Capas",icon:"🖼️",title:"Revisão de capas",description:"Procura a capa dentro do EPUB, usa a primeira página do PDF e, se necessário, tenta uma capa compatível em fontes de metadados.",detectedLabel:"Capa encontrada"},
  author:{label:"Autores",icon:"✍️",title:"Revisão de autores",description:"Confere metadados do arquivo, compara exemplares do próprio acervo e corrige autores ausentes ou suspeitos sem substituir autores confiáveis à toa.",detectedLabel:"Autor identificado"},
  category:{label:"Categorias",icon:"🗂️",title:"Revisão de categorias",description:"Analisa assuntos, título, sinopse e autor para classificar o livro na categoria adequada e aprofundar categorias genéricas quando houver segurança.",detectedLabel:"Categoria identificada"},
  title:{label:"Títulos",icon:"📖",title:"Revisão de títulos",description:"Compara o título atual com os metadados internos e o arquivo para corrigir nomes genéricos, truncados ou com sujeira de nome de arquivo.",detectedLabel:"Título identificado"},
  description:{label:"Sinopses",icon:"📝",title:"Revisão de sinopses",description:"Procura sinopse nos metadados do EPUB e em fontes bibliográficas. Preenche quando estiver faltando ou quando encontrar uma descrição claramente mais completa.",detectedLabel:"Sinopse encontrada"},
  language:{label:"Idioma",icon:"🌎",title:"Revisão de idioma",description:"Lê o idioma interno do EPUB ou o texto real do PDF. Idiomas já preenchidos só são trocados quando a identificação pelo arquivo é confiável.",detectedLabel:"Idioma identificado"}
};

const emptyStats:Stats={total:0,pending:0,processing:0,completed:0,error:0,unavailable:0};

function time(value?:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit",day:"2-digit",month:"2-digit"}).format(new Date(value));
}
function sourceLabel(value?:string|null){
  return ({metadata:"metadados internos",content:"conteúdo do arquivo",lookup:"fonte externa",title:"título",catalog:"catálogo",filename:"nome do arquivo","embedded-file":"capa interna","pdf-page-1":"1ª página do PDF","metadata-fallback":"fonte externa"} as Record<string,string>)[value||""]||value||"—";
}
function changeKeys(changes?:Record<string,unknown>|null){return changes?Object.keys(changes):[];}

export function ReadingDashboard(){
  const [field,setField]=useState<Field>("cover");
  const [data,setData]=useState<Payload|null>(null);
  const [active,setActive]=useState(true);
  const [working,setWorking]=useState(false);
  const [queueing,setQueueing]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const stopped=useRef(false);

  async function refresh(target:Field=field){
    try{
      const response=await fetch(`/api/admin/reading?field=${encodeURIComponent(target)}`,{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"Não foi possível carregar a revisão.");
      setData(json);setError("");
    }catch(err){setError(err instanceof Error?err.message:"Falha ao atualizar.");}
  }

  useEffect(()=>{void refresh(field);},[field]);

  useEffect(()=>{
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh(field);},3000);
    return()=>window.clearInterval(timer);
  },[field]);

  useEffect(()=>{
    stopped.current=false;
    if(!active)return()=>{stopped.current=true;};
    let timer:number|undefined;
    const run=async()=>{
      if(stopped.current||document.visibilityState!=="visible"){timer=window.setTimeout(run,2500);return;}
      setWorking(true);
      try{
        const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"process-field",field,limit:1})});
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||"Falha ao processar.");
        await refresh(field);
        const processed=(json.results||[]).length;
        timer=window.setTimeout(run,processed?900:5000);
      }catch(err){
        setError(err instanceof Error?err.message:"Falha ao processar.");
        timer=window.setTimeout(run,5000);
      }finally{if(!stopped.current)setWorking(false);}
    };
    void run();
    return()=>{stopped.current=true;if(timer)window.clearTimeout(timer);};
  },[active,field]);

  const stats=data?.reviewStats?.[field]||emptyStats;
  const processable=Math.max(0,stats.total-stats.unavailable);
  const remaining=stats.pending+stats.processing;
  const percent=processable?Math.round(stats.completed/processable*100):0;
  const current=useMemo(()=>data?.reviewItems.filter(item=>item.status==="processing").slice(0,8)||[],[data]);
  const recent=useMemo(()=>data?.reviewItems.filter(item=>item.status==="completed"||item.status==="error").slice(0,30)||[],[data]);
  const config=fieldConfig[field];

  async function queueAll(){
    if(!confirm(`Revisar ${config.label.toLowerCase()} de todo o acervo? Essa fila é independente das outras revisões.`))return;
    setQueueing(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"queue-field",field})});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Não foi possível iniciar a revisão.");
      setMessage(`${config.icon} ${Number(json.queued||0).toLocaleString("pt-BR")} livros colocados na fila de ${config.label.toLowerCase()}.`);
      await refresh(field);
    }catch(err){setError(err instanceof Error?err.message:"Falha ao iniciar revisão.");}
    finally{setQueueing(false);}
  }

  async function retryErrors(){
    const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"retry-field-errors",field})});
    const json=await response.json();if(!response.ok){setError(json.error||"Não foi possível reenfileirar.");return;}setMessage("Falhas reenfileiradas.");await refresh(field);
  }

  return <section className="reading-dashboard">
    <div className="reading-hero card panel">
      <div>
        <span className="eyebrow">LEITURA AUTOMÁTICA DO ACERVO</span>
        <h2>Revisão separada por conteúdo</h2>
        <p>Escolha exatamente o que o sistema deve procurar. Cada fila trabalha apenas naquele dado e não mexe nos demais campos do livro.</p>
      </div>
      <div className="reading-controls">
        <span className={`reading-live ${active?"on":""}`}><i/>{working?"Processando agora":"Aceleração ativa"}</span>
        <button type="button" className={active?"btn ghost":"btn"} onClick={()=>setActive(value=>!value)}>{active?"Pausar aceleração":"Acelerar nesta tela"}</button>
      </div>
    </div>

    <div className="tabs">
      {(Object.keys(fieldConfig) as Field[]).map(key=>{
        const cfg=fieldConfig[key];const s=data?.reviewStats?.[key]||emptyStats;const pending=s.pending+s.processing;
        return <button type="button" key={key} className={`tab ${field===key?"active":""}`} onClick={()=>{setField(key);setMessage("");}}>
          {cfg.icon} {cfg.label}{pending>0?` (${pending.toLocaleString("pt-BR")})`:""}
        </button>;
      })}
    </div>

    {error&&<div className="notice">{error}</div>}
    {message&&<div className="notice success">{message}</div>}

    <div className="card panel">
      <div className="panel-title">
        <div><span className="eyebrow">{config.icon} {config.label.toUpperCase()}</span><h2>{config.title}</h2><p>{config.description}</p></div>
        <button type="button" className="btn" onClick={()=>void queueAll()} disabled={queueing}>{queueing?"Preparando fila...":`Revisar ${config.label.toLowerCase()} de todos`}</button>
      </div>
    </div>

    <div className="reading-stats">
      <article className="card"><span>Total nesta revisão</span><strong>{stats.total.toLocaleString("pt-BR")}</strong><small>livros acompanhados</small></article>
      <article className="card"><span>Concluídos</span><strong>{stats.completed.toLocaleString("pt-BR")}</strong><small>{percent}% dos livros com arquivo</small></article>
      <article className="card"><span>Faltam</span><strong>{remaining.toLocaleString("pt-BR")}</strong><small>fila + processamento</small></article>
      <article className="card"><span>Processando</span><strong>{stats.processing.toLocaleString("pt-BR")}</strong><small>neste momento</small></article>
      <article className="card"><span>Falhas</span><strong>{stats.error.toLocaleString("pt-BR")}</strong><small>{stats.error>0?<button type="button" className="link-button" onClick={()=>void retryErrors()}>tentar novamente</button>:"nenhuma falha"}</small></article>
      <article className="card"><span>Sem arquivo</span><strong>{stats.unavailable.toLocaleString("pt-BR")}</strong><small>sem PDF/EPUB para analisar</small></article>
    </div>

    <div className="reading-progress card">
      <div className="reading-progress-head"><strong>Progresso — {config.label}</strong><span>{stats.completed.toLocaleString("pt-BR")} / {processable.toLocaleString("pt-BR")}</span></div>
      <div className="reading-progress-track"><i style={{width:`${Math.min(100,percent)}%`}}/></div>
      <small>O servidor continua essa fila mesmo com a aba fechada. Abrir esta tela acelera especificamente a revisão de {config.label.toLowerCase()}.</small>
    </div>

    <div className="reading-columns">
      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">AGORA</span><h2>{config.label} sendo analisados</h2></div><span className="count-badge">{stats.processing}</span></div>
        <div className="reading-list">{current.length?current.map(item=><article className="reading-row" key={item.book_id}>
          {item.book?.cover_url?<img src={item.book.cover_url} alt=""/>:<span className="mini-cover"/>}
          <div><strong>{item.book?.title||"Livro"}</strong><small>{item.book?.author||"Autor não identificado"} • tentativa {item.attempts} • iniciado {time(item.started_at)}</small></div>
          <span className="reading-spinner" aria-label="Lendo"/>
        </article>):<div className="empty-state"><h3>Aguardando próximo livro</h3><p>Quando houver itens na fila de {config.label.toLowerCase()}, eles aparecerão aqui.</p></div>}</div>
      </section>

      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">RESULTADOS</span><h2>Revisados recentemente</h2></div></div>
        <div className="reading-list">{recent.length?recent.map(item=><article className={`reading-row ${item.status==="error"?"reading-error":""}`} key={item.book_id}>
          {item.book?.cover_url?<img src={item.book.cover_url} alt=""/>:<span className="mini-cover"/>}
          <div>
            <strong>{item.book?.title||"Livro"}</strong>
            {item.status==="completed"?<>
              <small>{changeKeys(item.changes).length?`✓ Atualizado: ${changeKeys(item.changes).join(", ")}`:"✓ Conferido; nenhuma alteração necessária."}</small>
              {item.detected_value&&<small>{config.detectedLabel}: {field==="description"?item.detected_value.slice(0,150)+(item.detected_value.length>150?"…":""):item.detected_value}</small>}
              <small>Fonte: {sourceLabel(item.detection_source)} • {time(item.completed_at)}</small>
            </>:<small>{item.error||"Falha na revisão"}</small>}
          </div>
          {item.book?.slug?<Link className="btn ghost small" href={`/livro/${item.book.slug}`} target="_blank">Abrir ↗</Link>:<span>{item.status==="completed"?"✓":"!"}</span>}
        </article>):<div className="empty-state"><h3>Nenhuma revisão concluída ainda</h3><p>Clique em “Revisar {config.label.toLowerCase()} de todos” para iniciar esta fila.</p></div>}</div>
      </section>
    </div>

    <div className="reading-footnote">Última sincronização: {time(data?.updatedAt)} • cada guia mantém uma fila independente.</div>
  </section>;
}
