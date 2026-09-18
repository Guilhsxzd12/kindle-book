import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchDriveFile } from "@/lib/google-drive";
import {
  PUBLIC_SITE_URL,
  TELEGRAM_MAX_OUTGOING_BYTES,
  sendTelegramDocument,
  sendTelegramDocumentByFileId,
  sendTelegramMessage
} from "@/lib/telegram";

export type ChannelRole="official"|"reserve";
export type ChannelChat={id:number;type?:string;title?:string;username?:string};
type TelegramMessage={message_id?:number;document?:{file_id?:string}};

function escapeHtml(value:unknown){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function isPortuguese(value:unknown){const language=normalize(String(value??"").trim());return language==="pt"||language==="pt-br"||language==="pt_br"||language==="portugues"||language.startsWith("pt-");}
function isPublicationChat(type?:string){return !type||type==="channel"||type==="supergroup";}
function telegramFileName(title:string,author:string,extension:"epub"|"pdf"){
  const base=`${title} - ${author}`.replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,180)||"Kindle Books";
  return `${base}.${extension}`;
}
function bookEpub(book:any){
  const mainIsEpub=book?.mime_type==="application/epub+zip"||String(book?.file_name||"").toLowerCase().endsWith(".epub");
  return mainIsEpub?{id:book.drive_file_id}:{id:book.kindle_drive_file_id};
}
function bookPdf(book:any){
  const mainIsPdf=book?.mime_type==="application/pdf"||String(book?.file_name||"").toLowerCase().endsWith(".pdf");
  return mainIsPdf?{id:book.drive_file_id}:{id:book.reading_pdf_drive_file_id};
}

export function telegramChannelWelcomeText(){
  return `📚 <b>Kindle Books conectado!</b>\n\nEste canal foi reconhecido pelo bot e está pronto para receber os novos livros publicados no acervo.\n\n📚 Os canais recebem os livros disponíveis no acervo.\n📱 EPUB para Kindle e aplicativos compatíveis.\n📄 PDF para celular, tablet ou computador.\n\n🌐 <a href="${PUBLIC_SITE_URL}/biblioteca">Acessar o Kindle Books</a>\n\nBoa leitura! 🤍`;
}

async function nextRole(title:string):Promise<ChannelRole|null>{
  const db=createAdminSupabaseClient();
  const preferred:ChannelRole=normalize(title).includes("reserva")||normalize(title).includes("backup")?"reserve":"official";
  const {data:preferredRow}=await db.from("telegram_channels").select("chat_id").eq("role",preferred).maybeSingle();
  if(!preferredRow)return preferred;
  const fallback:ChannelRole=preferred==="official"?"reserve":"official";
  const {data:fallbackRow}=await db.from("telegram_channels").select("chat_id").eq("role",fallback).maybeSingle();
  return fallbackRow?null:fallback;
}

export async function registerTelegramChannel(chat:ChannelChat,forcedRole?:ChannelRole|null,replaceRole=false){
  if(!isPublicationChat(chat.type))throw new Error("Este destino não é um canal ou supergrupo do Telegram.");
  const db=createAdminSupabaseClient();
  const {data:existing}=await db.from("telegram_channels").select("*").eq("chat_id",chat.id).maybeSingle();
  let role:ChannelRole|null=forcedRole||((existing?.role as ChannelRole|undefined)??null);
  if(!role)role=await nextRole(chat.title||"");
  if(!role)throw new Error("Os canais Oficial e Reserva já estão cadastrados.");

  const {data:roleOwner}=await db.from("telegram_channels").select("id,chat_id,title").eq("role",role).maybeSingle();
  if(roleOwner&&Number(roleOwner.chat_id)!==Number(chat.id)){
    if(!replaceRole)throw new Error(`A posição ${role==="official"?"Oficial":"Reserva"} já está ocupada por ${roleOwner.title||roleOwner.chat_id}.`);
    const {error:deleteError}=await db.from("telegram_channels").delete().eq("id",roleOwner.id);if(deleteError)throw new Error(deleteError.message);
  }

  let row:any;
  if(existing){
    const {data,error}=await db.from("telegram_channels").update({title:chat.title||existing.title,role,active:true,updated_at:new Date().toISOString()}).eq("id",existing.id).select("*").single();
    if(error)throw new Error(error.message);row=data;
  }else{
    const {data,error}=await db.from("telegram_channels").insert({chat_id:chat.id,title:chat.title||null,role,active:true}).select("*").single();
    if(error)throw new Error(error.message);row=data;
  }

  let welcomeSent=false;let message:unknown=null;
  if(!row.welcome_sent_at){
    message=await sendTelegramMessage(chat.id,telegramChannelWelcomeText());
    const now=new Date().toISOString();await db.from("telegram_channels").update({welcome_sent_at:now,updated_at:now}).eq("id",row.id);row={...row,welcome_sent_at:now};welcomeSent=true;
  }
  return {...row,welcomeSent,message};
}

async function readDriveBytes(fileId:string){
  const response=await fetchDriveFile(fileId);const declared=Number(response.headers.get("content-length")||0);
  if(declared>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Arquivo maior que o limite de envio do Telegram.");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES)throw new Error("Arquivo maior que o limite de envio do Telegram.");
  return bytes;
}

function extractFileId(message:unknown){return (message as TelegramMessage|undefined)?.document?.file_id||null;}
function extractMessageId(message:unknown){return (message as TelegramMessage|undefined)?.message_id||null;}

export async function publishBookToTelegramChannels(bookId:string,force=false){
  const db=createAdminSupabaseClient();
  const [{data:book,error:bookError},{data:channels,error:channelError}]=await Promise.all([
    db.from("books").select("*").eq("id",bookId).maybeSingle(),
    db.from("telegram_channels").select("*").eq("active",true).order("role",{ascending:true})
  ]);
  if(bookError||!book)throw new Error(bookError?.message||"Livro não encontrado.");
  if(channelError)throw new Error(channelError.message);
  if(!channels?.length)throw new Error("Os canais do Telegram ainda não foram detectados pelo bot.");

  const epub=bookEpub(book);const pdf=bookPdf(book);
  if(!epub.id&&!pdf.id)throw new Error("O livro não possui EPUB ou PDF disponível para o Telegram.");
  const cachedTelegramFileIds:{epub?:string;pdf?:string}={};
  const results:Array<{channel:string;role:string;status:string;error?:string}> = [];
  const author=String(book.author||"Autor não informado").trim()||"Autor não informado";
  const caption=`<b>${escapeHtml(book.title)} - ${escapeHtml(author)}</b>`;
  const epubName=telegramFileName(String(book.title||"Livro"),author,"epub");
  const pdfName=telegramFileName(String(book.title||"Livro"),author,"pdf");

  for(const channel of channels){
    const {data:previous}=await db.from("telegram_channel_publications").select("*").eq("book_id",book.id).eq("channel_id",channel.id).maybeSingle();
    const needEpub=Boolean(epub.id)&&(force||!previous?.epub_message_id);
    const needPdf=Boolean(pdf.id)&&(force||!previous?.pdf_message_id);
    if(!needEpub&&!needPdf&&!force){
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"already-sent"});
      continue;
    }

    const claimTime=new Date().toISOString();
    const pendingIsFresh=previous?.status==="pending"&&previous?.updated_at&&Date.now()-new Date(previous.updated_at).getTime()<10*60*1000;
    if(pendingIsFresh){
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"already-processing"});
      continue;
    }
    if(previous){
      let claim=db.from("telegram_channel_publications")
        .update({status:"pending",last_error:null,updated_at:claimTime})
        .eq("id",previous.id);
      if(previous.updated_at)claim=claim.eq("updated_at",previous.updated_at);
      const {data:claimed,error:claimError}=await claim.select("id").maybeSingle();
      if(claimError)throw new Error(claimError.message);
      if(!claimed){
        results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"already-processing"});
        continue;
      }
    }else{
      const {error:claimError}=await db.from("telegram_channel_publications")
        .insert({book_id:book.id,channel_id:channel.id,status:"pending",last_error:null,updated_at:claimTime});
      if(claimError){
        if(claimError.code==="23505"){
          results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"already-processing"});
          continue;
        }
        throw new Error(claimError.message);
      }
    }
    let textMessageId:number|null=force?null:(previous?.text_message_id||null);
    let epubMessageId:number|null=force?null:(previous?.epub_message_id||null);
    let pdfMessageId:number|null=force?null:(previous?.pdf_message_id||null);
    const errors:string[]=[];
    try{
      if(needEpub&&epub.id){
        try{
          const sent=cachedTelegramFileIds.epub
            ? await sendTelegramDocumentByFileId(channel.chat_id,cachedTelegramFileIds.epub,caption)
            : await sendTelegramDocument(channel.chat_id,epubName,"application/epub+zip",await readDriveBytes(epub.id),caption);
          epubMessageId=extractMessageId(sent);const fileId=extractFileId(sent);if(fileId)cachedTelegramFileIds.epub=fileId;
        }catch(error){errors.push(`EPUB: ${error instanceof Error?error.message:"falha no envio"}`);}
      }
      if(needPdf&&pdf.id){
        try{
          const sent=cachedTelegramFileIds.pdf
            ? await sendTelegramDocumentByFileId(channel.chat_id,cachedTelegramFileIds.pdf,caption)
            : await sendTelegramDocument(channel.chat_id,pdfName,"application/pdf",await readDriveBytes(pdf.id),caption);
          pdfMessageId=extractMessageId(sent);const fileId=extractFileId(sent);if(fileId)cachedTelegramFileIds.pdf=fileId;
        }catch(error){errors.push(`PDF: ${error instanceof Error?error.message:"falha no envio"}`);}
      }
      const expected=(epub.id?1:0)+(pdf.id?1:0);const sent=(epubMessageId?1:0)+(pdfMessageId?1:0);
      if(sent===0&&errors.length>0&&errors.every(error=>error.includes("Arquivo maior que o limite de envio do Telegram."))){
        const bookUrl=`${PUBLIC_SITE_URL}/livro/${encodeURIComponent(book.slug||book.id)}`;
        const fallback=await sendTelegramMessage(channel.chat_id,`${caption}\n\nOs arquivos deste título ultrapassam o limite do Telegram.\n\n🌐 <a href="${bookUrl}">Acessar e baixar pelo site</a>`);
        textMessageId=extractMessageId(fallback);
      }
      const status=textMessageId||(sent===expected&&expected>0)?"sent":sent>0?"partial":"failed";
      await db.from("telegram_channel_publications").upsert({book_id:book.id,channel_id:channel.id,status,text_message_id:textMessageId,epub_message_id:epubMessageId,pdf_message_id:pdfMessageId,last_error:errors.join(" | ")||null,sent_at:textMessageId||sent?new Date().toISOString():previous?.sent_at||null,updated_at:new Date().toISOString()},{onConflict:"book_id,channel_id"});
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status,error:errors.join(" | ")||undefined});
    }catch(error){
      const reason=error instanceof Error?error.message:"Falha ao publicar no canal.";
      await db.from("telegram_channel_publications").upsert({book_id:book.id,channel_id:channel.id,status:"failed",text_message_id:textMessageId,epub_message_id:epubMessageId,pdf_message_id:pdfMessageId,last_error:reason,updated_at:new Date().toISOString()},{onConflict:"book_id,channel_id"});
      results.push({channel:channel.title||String(channel.chat_id),role:channel.role,status:"failed",error:reason});
    }
  }
  return {book:{id:book.id,title:book.title},results};
}

export async function resendWelcomeToTelegramChannels(){
  const db=createAdminSupabaseClient();const {data:channels,error}=await db.from("telegram_channels").select("*").eq("active",true).order("role");
  if(error)throw new Error(error.message);if(!channels?.length)throw new Error("Nenhum canal detectado.");
  const results=[];for(const channel of channels){const message=await sendTelegramMessage(channel.chat_id,telegramChannelWelcomeText());await db.from("telegram_channels").update({welcome_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",channel.id);results.push({id:channel.id,title:channel.title,role:channel.role,messageId:extractMessageId(message)});}return results;
}

