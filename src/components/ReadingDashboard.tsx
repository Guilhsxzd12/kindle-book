"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";

type Field="cover"|"author"|"category"|"title"|"description"|"language";
type View="general"|Field;
type Stats={total:number;pending:number;processing:number;completed:number;error:number;unavailable:number};
type Overview={totalBooks:number;fullyReviewed:number;partiallyReviewed:number;notReviewed:number;inProgress:number;withErrors:number;withUnavailable:number};
type FullyReviewedBook={id:string;title:string;author:string;slug:string;cover_url:string|null;reviewed_at:string|null};
type FieldItem={
  book_id:string;field:Field;status:string;attempts:number;detected_value:string|null;detection_source:string|null;
  changes:Record<string,unknown>|null;error:string|null;started_at:string|null;completed_at:string|null;updated_at:string;
  book:{id:string;title:string;author:string;slug:string;cover_url:string|null;description:string|null;language:string|null;category_id:string|null}|null;
};
type Payload={
  reviewStats:Record<Field,Stats>;
  reviewItems:FieldItem[];
  analysisStats:Stats;
  overview:Overview;
  recentFullyReviewed:FullyReviewedBook[];
  selectedField:Field;
  updatedAt:string;
};

const fields:Field[]=["cover","author","category","title","description","language"];
const fieldConfig:Record<Field,{label:string;icon:string;title:string;description:string;detectedLabel:string}>={
  cover:{label:"Capas",icon:"🖼️",title:"Revisão de capas",description:"Procura a capa dentro do EPUB, usa a primeira página do PDF e, se necessário, tenta uma capa compatível em fontes de metadados.",detectedLabel:"Capa encontrada"},
  author:{label:"Autores",icon:"✍️",title:"Revisão de autores",description:"Confere metadados do arquivo, compara exemplares do próprio acervo e corrige autores ausentes ou suspeitos sem substituir autores confiáveis à toa.",detectedLabel:"Autor identificado"},
  category:{label:"Categorias",icon:"🗂️",title:"Revisão de categorias",description:"Analisa assuntos, título, sinopse e autor para classificar o livro na categoria adequada e aprofundar categorias genéricas quando houver segurança.",detectedLabel:"Categoria identificada"},
  title:{label:"Títulos",icon:"📖",title:"Revisão de títulos",description:"Compara o título atual com os metadados internos e o arquivo para corrigir nomes genéricos, truncados ou com sujeira de nome de arquivo.",detectedLabel:"Título identificado"},
  description:{label:"Sinopses",icon:"📝",title:"Revisão de sinopses",description:"Procura sinopse nos metadados do EPUB e em fontes bibliográficas. Preenche quando estiver faltando ou quando encontrar uma descrição claramente mais completa.",detectedLabel:"Sinopse encontrada"},
  language:{label:"Idioma",icon:"🌎",title:"Revisão de idioma",description:"Lê o idioma interno do EPUB ou o texto real do PDF. Idiomas já preenchidos só são trocados quando a identificação pelo arquivo é confiável.",detectedLabel:"Idioma identificado"}
};

const emptyStats:Stats={total:0,pending:0,processing:0,completed:0,error:0,unavailable:0};
const emptyOverview:Overview={totalBooks:0,fullyReviewed:0,partiallyReviewed:0,notReviewed:0,inProgress:0,withErrors:0,withUnavailable:0};

function time(value?:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit",day:"2-digit",month:"2-digit"}).format(new Date(value));
}
function sourceLabel(value?:string|null){
  return ({metadata:"metadados internos",content:"conteúdo do arquivo",lookup:"fonte externa",title:"título",catalog:"catálogo",filename:"nome do arquivo","embedded-file":"capa interna","pdf-page-1":"1ª página do PDF","metadata-fallback":"fonte externa",existing:"capa existente"} as Record<string,string>)[value||""]||value||"—";
}
function changeKeys(changes?:Record<string,unknown>|null){return changes?Object.keys(changes):[];}
function pct(done:number,total:number){return total?Math.round(done/total*100):0;}

export function ReadingDashboard(){
  const [view,setView]=useState<View>("general");
  const [data,setData]=useState<Payload|null>(null);
  const [active,setActive]=useState(true);
  const [working,setWorking]=useState(false);
  const [queueing,setQueueing]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const stopped=useRef(false);

  const selectedField:Field=view==="general"?"cover":view;

  async function refresh(target:View=view){
    const apiField:Field=target==="general"?"cover":target;
    try{
      const response=await fetch(`/api/admin/reading?field=${encodeURIComponent(apiField)}`,{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"Não foi possível carregar a revisão.");
      setData(json);setError("");
    }catch(err){setError(err instanceof Error?err.message:"Falha ao atualizar.");}
  }

  useEffect(()=>{void refresh(view);},[view]);

  useEffect(()=>{
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh(view);},3000);
    return()=>window.clearInterval(timer);
  },[view]);

  useEffect(()=>{
    stopped.current=false;
    if(!active||view==="general")return()=>{stopped.current=true;};
    let timer:number|undefined;
    const run=async()=>{
      if(stopped.current||document.visibilityState!=="visible"){timer=window.setTimeout(run,2500);return;}
      setWorking(true);
      try{
        const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"process-field",field:view,limit:2})});
        const json=await response.json();
        if(!response.ok)throw new Error(json.error||"Falha ao processar.");
        await refresh(view);
        const processed=(json.results||[]).length;
        timer=window.setTimeout(run,processed?900:5000);
      }catch(err){
        setError(err instanceof Error?err.message:"Falha ao processar.");
        timer=window.setTimeout(run,5000);
      }finally{if(!stopped.current)setWorking(false);}
    };
    void run();
    return()=>{stopped.current=true;if(timer)window.clearTimeout(timer);};
  },[active,view]);

  const stats=data?.reviewStats?.[selectedField]||emptyStats;
  const processable=Math.max(0,stats.total-stats.unavailable);
  const remaining=stats.pending+stats.processing;
  const percent=pct(stats.completed,processable);
  const current=useMemo(()=>data?.reviewItems.filter(item=>item.status==="processing").slice(0,8)||[],[data]);
  const recent=useMemo(()=>data?.reviewItems.filter(item=>item.status==="completed"||item.status==="error").slice(0,30)||[],[data]);
  const overview=data?.overview||emptyOverview;
  const fullPercent=pct(overview.fullyReviewed,overview.totalBooks);

  async function queueAll(field:Field){
    const config=fieldConfig[field];
    if(!confirm(`Revisar ${config.label.toLowerCase()} de todo o acervo? Essa fila é independente das outras revisões.`))return;
    setQueueing(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"queue-field",field})});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Não foi possível iniciar a revisão.");
      setMessage(`${config.icon} ${Number(json.queued||0).toLocaleString("pt-BR")} livros colocados na fila de ${config.label.toLowerCase()}.`);
      await refresh(view);
    }catch(err){setError(err instanceof Error?err.message:"Falha ao iniciar revisão.");}
    finally{setQueueing(false);}
  }

  async function retryErrors(field:Field){
    const response=await fetch("/api/admin/reading",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"retry-field-errors",field})});
    const json=await response.json();if(!response.ok){setError(json.error||"Não foi possível reenfileirar.");return;}setMessage("Falhas reenfileiradas.");await refresh(view);
  }

  return <section className="reading-dashboard">
    <div className="reading-hero card panel">
      <div>
        <span className="eyebrow">LEITURA AUTOMÁTICA DO ACERVO</span>
        <h2>1 leitura do arquivo → 6 verificações</h2>
        <p>O leitor central abre no máximo 4 livros ao mesmo tempo, extrai capa, autor, categoria, título, sinopse e idioma em uma única análise e reaproveita esse resultado nas seis filas.</p>
      </div>
      <div className="reading-controls">
        <span className={`reading-live ${active?"on":""}`}><i/>{working?"Aplicando resultados":"Atualização ao vivo"}</span>
        <button type="button" className={active?"btn ghost":"btn"} onClick={()=>setActive(value=>!value)}>{active?"Pausar aplicação ao vivo":"Aplicar resultados ao vivo"}</button>
      </div>
    </div>

    <div className="tabs">
      <button type="button" className={`tab ${view==="general"?"active":""}`} onClick={()=>{setView("general");setMessage("");}}>📊 Geral</button>
      {fields.map(key=>{
        const cfg=fieldConfig[key];const s=data?.reviewStats?.[key]||emptyStats;const pending=s.pending+s.processing;
        return <button type="button" key={key} className={`tab ${view===key?"active":""}`} onClick={()=>{setView(key);setMessage("");}}>
          {cfg.icon} {cfg.label}{pending>0?` (${pending.toLocaleString("pt-BR")})`:""}
        </button>;
      })}
    </div>

    {error&&<div className="notice">{error}</div>}
    {message&&<div className="notice success">{message}</div>}

    <div className="reading-stats">
      <article className="card"><span>Leitor central</span><strong>{(data?.analysisStats?.processing||0).toLocaleString("pt-BR")} / 4</strong><small>arquivos abertos simultaneamente</small></article>
      <article className="card"><span>Aguardando leitura</span><strong>{(data?.analysisStats?.pending||0).toLocaleString("pt-BR")}</strong><small>uma leitura servirá às 6 abas</small></article>
      <article className="card"><span>Análises prontas</span><strong>{(data?.analysisStats?.completed||0).toLocaleString("pt-BR")}</strong><small>resultados reaproveitáveis</small></article>
      <article className="card"><span>Falhas de leitura</span><strong>{(data?.analysisStats?.error||0).toLocaleString("pt-BR")}</strong><small>arquivos que falharam após tentativas</small></article>
    </div>

    {view==="general"?<>
      <div className="card panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">📊 PAINEL GERAL</span>
            <h2>Livros completamente revisados</h2>
            <p>Um livro só entra como <strong>100% revisado</strong> quando as seis etapas — capa, autor, categoria, título, sinopse e idioma — estiverem concluídas.</p>
          </div>
          <span className="count-badge">{overview.fullyReviewed.toLocaleString("pt-BR")} completos</span>
        </div>
      </div>

      <div className="reading-stats">
        <article className="card"><span>Total do acervo</span><strong>{overview.totalBooks.toLocaleString("pt-BR")}</strong><small>livros cadastrados</small></article>
        <article className="card"><span>✅ Revisados 6/6</span><strong>{overview.fullyReviewed.toLocaleString("pt-BR")}</strong><small>{fullPercent}% do acervo completo</small></article>
        <article className="card"><span>🟡 Revisão parcial</span><strong>{overview.partiallyReviewed.toLocaleString("pt-BR")}</strong><small>já têm de 1 a 5 etapas concluídas</small></article>
        <article className="card"><span>⚙️ Em andamento</span><strong>{overview.inProgress.toLocaleString("pt-BR")}</strong><small>ainda têm etapas na fila</small></article>
        <article className="card"><span>○ Ainda sem revisão concluída</span><strong>{overview.notReviewed.toLocaleString("pt-BR")}</strong><small>nenhuma das 6 concluída ainda</small></article>
        <article className="card"><span>⚠️ Com falha</span><strong>{overview.withErrors.toLocaleString("pt-BR")}</strong><small>possuem pelo menos uma etapa com erro</small></article>
      </div>

      <div className="reading-progress card">
        <div className="reading-progress-head"><strong>Progresso geral — 6/6 concluídas</strong><span>{overview.fullyReviewed.toLocaleString("pt-BR")} / {overview.totalBooks.toLocaleString("pt-BR")}</span></div>
        <div className="reading-progress-track"><i style={{width:`${Math.min(100,fullPercent)}%`}}/></div>
        <small>Esse número só sobe quando o mesmo livro terminou todas as seis verificações.</small>
      </div>

      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">PROGRESSO POR ETAPA</span><h2>Como estão as seis verificações</h2></div></div>
        <div className="reading-stats">
          {fields.map(key=>{
            const cfg=fieldConfig[key];const s=data?.reviewStats?.[key]||emptyStats;const total=Math.max(0,s.total-s.unavailable);const progress=pct(s.completed,total);
            return <article className="card" key={key}>
              <span>{cfg.icon} {cfg.label}</span>
              <strong>{s.completed.toLocaleString("pt-BR")}</strong>
              <small>{progress}% • {Math.max(0,total-s.completed).toLocaleString("pt-BR")} faltando</small>
            </article>;
          })}
        </div>
      </section>

      <section className="card panel">
        <div className="panel-title"><div><span className="eyebrow">✅ 6/6 CONCLUÍDAS</span><h2>Últimos livros totalmente revisados</h2></div></div>
        <div className="reading-list">{data?.recentFullyReviewed?.length?data.recentFullyReviewed.map(book=><article className="reading-row" key={book.id}>
          {book.cover_url?<img src={book.cover_url} alt=""/>:<span className="mini-cover"/>}
          <div><strong>{book.title}</strong><small>{book.author} • todas as 6 características revisadas • {time(book.reviewed_at)}</small></div>
          {book.slug?<Link className="btn ghost small" href={`/livro/${book.slug}`} target="_blank">Abrir ↗</Link>:<span>✓</span>}
        </article>):<div className="empty-state"><h3>Nenhum livro com 6/6 ainda</h3><p>Assim que um livro concluir capa, autor, categoria, título, sinopse e idioma, ele aparecerá aqui.</p></div>}</div>
      </section>
    </>:(()=>{
      const config=fieldConfig[view];
      return <>
        <div className="card panel">
          <div className="panel-title">
            <div><span className="eyebrow">{config.icon} {config.label.toUpperCase()}</span><h2>{config.title}</h2><p>{config.description}</p></div>
            <button type="button" className="btn" onClick={()=>void queueAll(view)} disabled={queueing}>{queueing?"Preparando fila...":`Revisar ${config.label.toLowerCase()} de todos`}</button>
          </div>
        </div>

        <div className="reading-stats">
          <article className="card"><span>Total nesta revisão</span><strong>{stats.total.toLocaleString("pt-BR")}</strong><small>livros acompanhados</small></article>
          <article className="card"><span>Concluídos</span><strong>{stats.completed.toLocaleString("pt-BR")}</strong><small>{percent}% dos livros com arquivo</small></article>
          <article className="card"><span>Faltam</span><strong>{remaining.toLocaleString("pt-BR")}</strong><small>fila + processamento</small></article>
          <article className="card"><span>Processando</span><strong>{stats.processing.toLocaleString("pt-BR")}</strong><small>neste momento</small></article>
          <article className="card"><span>Falhas</span><strong>{stats.error.toLocaleString("pt-BR")}</strong><small>{stats.error>0?<button type="button" className="link-button" onClick={()=>void retryErrors(view)}>tentar novamente</button>:"nenhuma falha"}</small></article>
          <article className="card"><span>Sem arquivo</span><strong>{stats.unavailable.toLocaleString("pt-BR")}</strong><small>sem PDF/EPUB para analisar</small></article>
        </div>

        <div className="reading-progress card">
          <div className="reading-progress-head"><strong>Progresso — {config.label}</strong><span>{stats.completed.toLocaleString("pt-BR")} / {processable.toLocaleString("pt-BR")}</span></div>
          <div className="reading-progress-track"><i style={{width:`${Math.min(100,percent)}%`}}/></div>
          <small>O servidor continua mesmo com a aba fechada. O arquivo é lido uma única vez pelo leitor central e esta aba apenas aplica o resultado de {config.label.toLowerCase()}.</small>
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
                  {item.detected_value&&<small>{config.detectedLabel}: {view==="description"?item.detected_value.slice(0,150)+(item.detected_value.length>150?"…":""):item.detected_value}</small>}
                  <small>Fonte: {sourceLabel(item.detection_source)} • {time(item.completed_at)}</small>
                </>:<small>{item.error||"Falha na revisão"}</small>}
              </div>
              {item.book?.slug?<Link className="btn ghost small" href={`/livro/${item.book.slug}`} target="_blank">Abrir ↗</Link>:<span>{item.status==="completed"?"✓":"!"}</span>}
            </article>):<div className="empty-state"><h3>Nenhuma revisão concluída ainda</h3><p>Clique em “Revisar {config.label.toLowerCase()} de todos” para iniciar esta fila.</p></div>}</div>
          </section>
        </div>
      </>;
    })()}

    <div className="reading-footnote">Última sincronização: {time(data?.updatedAt)} • filas independentes na interface, leitura compartilhada por trás • limite central: 4 arquivos simultâneos.</div>
  </section>;
}
