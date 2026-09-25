import "server-only";
import { createHash } from "crypto";
import { getSiteOrigin } from "@/lib/google-drive";
import { ADMIN_TELEGRAM_USERNAME,SITE_NAME } from "@/lib/site";

export const TELEGRAM_MAX_INCOMING_BYTES=20*1024*1024;
export const TELEGRAM_MAX_OUTGOING_BYTES=50*1024*1024;
export const PUBLIC_SITE_URL="https://estantevirtual.shop";
export function telegramWebhookUrl(){return process.env.TELEGRAM_WEBHOOK_URL?.trim()||"https://biblioteca-virtual-umber.vercel.app/api/telegram/webhook";}

export type TelegramWebhookInfo={
  url:string;
  has_custom_certificate:boolean;
  pending_update_count:number;
  ip_address?:string;
  last_error_date?:number;
  last_error_message?:string;
  last_synchronization_error_date?:number;
  max_connections?:number;
  allowed_updates?:string[];
};

function token(){const value=process.env.TELEGRAM_BOT_TOKEN?.trim();if(!value)throw new Error("TELEGRAM_BOT_TOKEN não configurado.");return value;}
export function telegramWebhookSecret(){return createHash("sha256").update(`${token()}|${getSiteOrigin()}`).digest("hex");}

async function telegramApi<T>(method:string,body:Record<string,unknown>={}){
  const response=await fetch(`https://api.telegram.org/bot${token()}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const data=await response.json() as {ok:boolean;result?:T;description?:string};
  if(!response.ok||!data.ok)throw new Error(data.description||`Telegram ${method} falhou.`);
  return data.result as T;
}

export async function sendTelegramMessage(chatId:number|string,text:string,replyMarkup?:Record<string,unknown>){
  return telegramApi<{message_id:number}>("sendMessage",{chat_id:chatId,text,parse_mode:"HTML",disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});
}

export async function editTelegramMessage(chatId:number|string,messageId:number,text:string,replyMarkup?:Record<string,unknown>){
  try{return await telegramApi("editMessageText",{chat_id:chatId,message_id:messageId,text,parse_mode:"HTML",disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});}
  catch(error){
    if(error instanceof Error&&/message is not modified/i.test(error.message))return null;
    throw error;
  }
}

export async function sendTelegramDocument(chatId:number|string,fileName:string,mimeType:string,bytes:Uint8Array,caption?:string){
  if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Este arquivo ultrapassa o limite de envio do Telegram.");
  const form=new FormData();form.set("chat_id",String(chatId));
  const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  form.set("document",new Blob([arrayBuffer],{type:mimeType||"application/octet-stream"}),fileName||"livro");
  if(caption){form.set("caption",caption);form.set("parse_mode","HTML");}
  const response=await fetch(`https://api.telegram.org/bot${token()}/sendDocument`,{method:"POST",body:form,cache:"no-store"});
  const data=await response.json() as {ok:boolean;result?:{message_id:number;document?:{file_id?:string}};description?:string};
  if(!response.ok||!data.ok)throw new Error(data.description||"Telegram sendDocument falhou.");
  return data.result;
}

export async function sendTelegramDocumentByFileId(chatId:number|string,fileId:string,caption?:string){
  return telegramApi<{message_id:number;document?:{file_id?:string}}>("sendDocument",{chat_id:chatId,document:fileId,...(caption?{caption,parse_mode:"HTML"}:{})});
}

export async function getTelegramChat(chatId:number|string){
  return telegramApi<{id:number;type:string;title?:string;username?:string;invite_link?:string}>("getChat",{chat_id:chatId});
}

export async function getTelegramFile(fileId:string){
  const file=await telegramApi<{file_id:string;file_path?:string;file_size?:number}>("getFile",{file_id:fileId});
  if(!file.file_path)throw new Error("Telegram não retornou o caminho do arquivo.");
  if(file.file_size&&file.file_size>TELEGRAM_MAX_INCOMING_BYTES)throw new Error("O arquivo é maior do que o bot consegue receber pelo Telegram.");
  const response=await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`Não foi possível baixar o arquivo recebido (${response.status}).`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>TELEGRAM_MAX_INCOMING_BYTES)throw new Error("O arquivo é maior do que o bot consegue receber pelo Telegram.");
  return {bytes,filePath:file.file_path,fileSize:file.file_size||bytes.byteLength};
}

export async function answerTelegramCallback(id:string,text?:string){return telegramApi("answerCallbackQuery",{callback_query_id:id,...(text?{text}:{})});}
export async function getTelegramBot(){return telegramApi<{id:number;username?:string;first_name:string}>("getMe");}
export async function getTelegramWebhookInfo(){return telegramApi<TelegramWebhookInfo>("getWebhookInfo");}

export async function setupTelegramWebhook(){
  const url=telegramWebhookUrl();
  await telegramApi("setWebhook",{
    url,
    secret_token:telegramWebhookSecret(),
    allowed_updates:["message","callback_query","channel_post","edited_channel_post","my_chat_member"],
    drop_pending_updates:false,
    max_connections:40
  });
  await telegramApi("setMyCommands",{commands:[
    {command:"start",description:`Abrir a ${SITE_NAME}`},
    {command:"menu",description:"Abrir o menu principal"},
    {command:"baixar",description:"Pesquisar e baixar um livro"},
    {command:"pedir",description:"Pedir um livro ao acervo"},
    {command:"historico",description:"Ver livros baixados pelo bot"},
    {command:"assinatura",description:"Consultar minha assinatura"},
    {command:"sair",description:"Sair ou trocar de conta"}
  ]});
  const [bot,webhookInfo]=await Promise.all([getTelegramBot(),getTelegramWebhookInfo()]);
  const healthy=webhookInfo.url===url&&!webhookInfo.last_error_message;
  return {url,bot,webhookInfo,healthy};
}

export function telegramMainKeyboard(){
  return {inline_keyboard:[
    [{text:"🔎 BAIXAR LIVRO",callback_data:"action_download"},{text:"📝 PEDIR LIVRO",callback_data:"action_request"}],
    [{text:"🕘 HISTÓRICO",callback_data:"show_history"}],
    [{text:"💳 MINHA ASSINATURA",callback_data:"show_subscription"}],
    [{text:"🌐 ABRIR LEITURAVERSO",url:`${PUBLIC_SITE_URL}/biblioteca`}],
    [{text:"🚪 SAIR / TROCAR CONTA",callback_data:"action_logout"}]
  ]};
}

export function telegramWelcomeKeyboard(){
  const rows:Array<Array<Record<string,string>>> = [];
  const url=paymentUrl();if(url)rows.push([{text:"💳 QUERO ASSINAR",url}]);
  rows.push([{text:"🔐 JÁ TENHO ACESSO",callback_data:"action_login"}],[{text:"✅ JÁ PAGUEI",callback_data:"subscription_paid"}]);
  return {inline_keyboard:rows};
}

export function telegramBackToMenuKeyboard(){return {inline_keyboard:[[{text:"↩️ Voltar ao menu",callback_data:"show_menu"}]]};}
export function paymentUrl(){return process.env.SUBSCRIPTION_PAYMENT_URL?.trim()||"";}
export function receiptUsername(){return ADMIN_TELEGRAM_USERNAME;}

export function paymentMessage(){
  const user=receiptUsername();
  const details=process.env.SUBSCRIPTION_PAYMENT_DETAILS?.trim();
  return `📚 <b>${SITE_NAME}</b>\n\nPara acessar o acervo e baixar livros, você precisa de uma assinatura ativa.\n\n💳 <b>Plano mensal: R$ 8,90</b>\n📅 <b>Duração: 30 dias</b>${details?`\n🧾 <b>Pagamento:</b> ${details}`:""}\n\n1️⃣ Faça o pagamento pelo botão abaixo.\n2️⃣ Envie o comprovante para <b>@${user}</b>.\n3️⃣ O administrador criará seu e-mail e senha.\n4️⃣ Volte ao bot, toque em <b>Já tenho acesso</b> e envie esses dados.\n\nCada conta pode ficar conectada a apenas um Telegram por vez.`;
}

export function paymentKeyboard(){
  const rows:Array<Array<Record<string,string>>> = [];
  const url=paymentUrl();if(url)rows.push([{text:"💳 PAGAR ASSINATURA",url}]);
  rows.push([{text:"✅ JÁ PAGUEI",callback_data:"subscription_paid"}]);
  return {inline_keyboard:rows};
}
