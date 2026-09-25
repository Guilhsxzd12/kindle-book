import {spawn} from "node:child_process";
import {existsSync} from "node:fs";

const baseUrl=(process.env.LEITURAVERSO_WORKER_URL||"http://127.0.0.1:3030").replace(/\/$/,"");
const delay=Math.max(2,Number(process.env.LEITURAVERSO_WORKER_DELAY_SECONDS||5));
let host=null;
let stopping=false;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:"inherit",shell:false});
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(new Error(`${command} saiu com codigo ${code}`)));
  });
}

async function ensureBuild(){
  if(existsSync(".next/BUILD_ID"))return;
  console.log("[worker] Preparando a versao local do LeituraVerso...");
  await run("npm",["run","build"]);
}

function startHost(){
  console.log("[worker] Iniciando servidor privado em 127.0.0.1:3030...");
  host=spawn("npm",["run","start:worker-host"],{stdio:"inherit",shell:false});
  host.on("exit",code=>{
    if(!stopping){
      console.error(`[worker] O servidor local parou (codigo ${code}). Encerrando para o Docker reiniciar o container.`);
      process.exit(code||1);
    }
  });
}

async function waitForHost(){
  for(let i=0;i<60;i++){
    try{
      const response=await fetch(baseUrl+"/api/cron/book-analysis?limit=1",{signal:AbortSignal.timeout(10000)});
      if(response.ok)return;
    }catch{}
    await sleep(2000);
  }
  throw new Error("O servidor local nao ficou pronto a tempo.");
}

async function step(path,label){
  try{
    const response=await fetch(baseUrl+path,{signal:AbortSignal.timeout(30*60*1000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    const count=Number(data?.processed||0);
    if(count>0)console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${label}: ${count} item(ns)`);
    return count;
  }catch(error){
    console.warn(`[${new Date().toLocaleTimeString("pt-BR")}] ${label}: ${error instanceof Error?error.message:String(error)}`);
    return 0;
  }
}

async function shutdown(signal){
  if(stopping)return;
  stopping=true;
  console.log(`[worker] Recebido ${signal}. Encerrando...`);
  if(host&&!host.killed)host.kill("SIGTERM");
  await sleep(500);
  process.exit(0);
}
process.on("SIGTERM",()=>void shutdown("SIGTERM"));
process.on("SIGINT",()=>void shutdown("SIGINT"));

async function main(){
  console.log("");
  console.log("LeituraVerso Worker - Docker");
  console.log("Processamento privado: nenhuma porta publicada.");
  console.log("");
  await ensureBuild();
  startHost();
  await waitForHost();
  console.log("[worker] ONLINE. O Docker reiniciara este container automaticamente.");

  while(!stopping){
    let work=0;
    work+=await step("/api/cron/book-analysis?limit=1","Leitura central");
    work+=await step("/api/cron/book-reading?limit=1","Leitura legada");
    work+=await step("/api/cron/book-field-review?limit=6","Aplicacao das 6 revisoes");
    await sleep(work>0?750:delay*1000);
  }
}

main().catch(error=>{
  console.error("[worker] Falha fatal:",error);
  process.exit(1);
});
