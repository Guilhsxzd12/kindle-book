import { timingSafeEqual } from "crypto";
import { NextRequest,NextResponse } from "next/server";
import { getSubscriptionState,type SubscriptionState } from "@/lib/subscription";
import { createAdminSupabaseClient,createBotAuthSupabaseClient } from "@/lib/supabase/admin";
import { fetchDriveFile } from "@/lib/google-drive";
import { SITE_NAME } from "@/lib/site";
import { registerTelegramChannel } from "@/lib/telegram-channels";
import {
  TELEGRAM_MAX_OUTGOING_BYTES,answerTelegramCallback,editTelegramMessage,paymentKeyboard,paymentMessage,receiptUsername,
  sendTelegramDocument,sendTelegramMessage,telegramBackToMenuKeyboard,telegramMainKeyboard,
  setupTelegramWebhook,telegramWebhookSecret,telegramWelcomeKeyboard
} from "@/lib/telegram";

type TgUser={id:number;username?:string;first_name?:string};
type TgChat={id:number;type?:string;title?:string;username?:string};
type TgMessage={chat:TgChat;from?:TgUser;text?:string;document?:unknown;photo?:unknown[];forward_origin?:{type?:string;chat?:TgChat};forward_from_chat?:TgChat};
type TgCallback={id:string;from:TgUser;data?:string;message?:{message_id:number;chat:{id:number}}};
type TgMemberUpdate={chat:TgChat;new_chat_member?:{status?:string;user?:TgUser};old_chat_member?:{status?:string;user?:TgUser}};
type TgUpdate={message?:TgMessage;channel_post?:TgMessage;edited_channel_post?:TgMessage;callback_query?:TgCallback;my_chat_member?:TgMemberUpdate};
type BotMode="idle"|"download"|"request_title"|"request_author"|"request_language";
type BotContext={title?:string;author?:string};
type LinkedState={userId:string;isAdmin:boolean;approved:boolean;mode:BotMode;context:BotContext;subscription:SubscriptionState|null};
type Access={userId:string;isAdmin:boolean;mode:BotMode;context:BotContext;activeUntil:string|null};
type BookFormat="pdf"|"epub";
type LanguageFile={id:string;book_id:string;language:string;format:string;drive_file_id:string;file_name:string;mime_type:string};
const LANGUAGE_NAMES:Record<string,string>={pt:"🇧🇷 Português",en:"🇺🇸 Inglês",es:"🇪🇸 Espanhol",fr:"🇫🇷 Francês",it:"🇮🇹 Italiano",de:"🇩🇪 Alemão"};
function languageLabel(value?:string|null){const key=String(value||"").trim().toLowerCase();return LANGUAGE_NAMES[key]||key.toUpperCase()||"Idioma não informado";}

function validSecret(value:string|null){if(!value)return false;const expected=telegramWebhookSecret();const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function escapeHtml(value:string){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
function normalized(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function formatDate(value?:string|null){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));}
function isPdf(book:any){return book?.mime_type==="application/pdf"||String(book?.file_name||"").toLowerCase().endsWith(".pdf");}
function isEpub(book:any){return book?.mime_type==="application/epub+zip"||String(book?.file_name||"").toLowerCase().endsWith(".epub");}
function isPublicationChat(chat?:TgChat|null){return Boolean(chat&&(chat.type==="channel"||chat.type==="supergroup"));}

async function render(chatId:number,text:string,replyMarkup?:Record<string,unknown>,messageId?:number){
  if(messageId){try{return await editTelegramMessage(chatId,messageId,text,replyMarkup);}catch(error){console.warn("[telegram] edit failed, sending new message",error instanceof Error?error.message:"unknown");}}
  return sendTelegramMessage(chatId,text,replyMarkup);
}

async function getLinkedState(user:TgUser,chatId:number):Promise<LinkedState|null>{
  const admin=createAdminSupabaseClient();const {data:account}=await admin.from("telegram_accounts").select("user_id,bot_mode,bot_context").eq("telegram_user_id",user.id).maybeSingle();if(!account)return null;
  await admin.from("telegram_accounts").update({chat_id:chatId,username:user.username||null,first_name:user.first_name||null,updated_at:new Date().toISOString()}).eq("telegram_user_id",user.id);
  const {data:profile}=await admin.from("profiles").select("approved,role").eq("id",account.user_id).maybeSingle();const isAdmin=profile?.role==="admin";const subscription=isAdmin?null:await getSubscriptionState(account.user_id);
  return {userId:account.user_id,isAdmin,approved:Boolean(profile?.approved),mode:(account.bot_mode||"idle") as BotMode,context:(account.bot_context||{}) as BotContext,subscription};
}

async function requireAccess(user:TgUser,chatId:number):Promise<Access|null>{
  const state=await getLinkedState(user,chatId);if(!state){await showWelcome(chatId);return null;}
  if(state.isAdmin)return {userId:state.userId,isAdmin:true,mode:state.mode,context:state.context,activeUntil:null};
  if(!state.approved||!state.subscription?.isActive){await sendTelegramMessage(chatId,paymentMessage(),paymentKeyboard());return null;}
  return {userId:state.userId,isAdmin:false,mode:state.mode,context:state.context,activeUntil:state.subscription.activeUntil};
}

async function setState(telegramUserId:number,mode:BotMode,context:BotContext={}){await createAdminSupabaseClient().from("telegram_accounts").update({bot_mode:mode,bot_context:context,updated_at:new Date().toISOString()}).eq("telegram_user_id",telegramUserId);}
async function showWelcome(chatId:number,messageId?:number){await render(chatId,`📚 <b>Bem-vindo à ${SITE_NAME}</b>\n\n${paymentMessage().replace(/^📚[^\n]+\n\n/,"")}`,telegramWelcomeKeyboard(),messageId);}

async function beginLogin(user:TgUser,chatId:number,messageId?:number){
  const admin=createAdminSupabaseClient();const now=Date.now();await admin.from("telegram_login_sessions").upsert({telegram_user_id:user.id,chat_id:chatId,username:user.username||null,first_name:user.first_name||null,stage:"email",email:null,attempts:0,locked_until:null,expires_at:new Date(now+15*60_000).toISOString(),updated_at:new Date().toISOString()},{onConflict:"telegram_user_id"});
  await render(chatId,"🔐 <b>Entrar na sua conta</b>\n\nEnvie agora o <b>e-mail de login</b> fornecido pelo administrador.\n\nPor segurança, faça isso somente em uma conversa privada com o bot.",{inline_keyboard:[[{text:"↩️ CANCELAR",callback_data:"cancel_login"}]]},messageId);
}

async function handleLoginText(user:TgUser,chatId:number,raw:string){
  const admin=createAdminSupabaseClient();const {data:session}=await admin.from("telegram_login_sessions").select("*").eq("telegram_user_id",user.id).maybeSingle();if(!session)return false;
  if(new Date(session.expires_at).getTime()<=Date.now()){await admin.from("telegram_login_sessions").delete().eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,"⌛ O tempo para entrar expirou. Toque novamente em <b>Já tenho acesso</b>.",telegramWelcomeKeyboard());return true;}
  if(session.locked_until&&new Date(session.locked_until).getTime()>Date.now()){await sendTelegramMessage(chatId,"🔒 Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.");return true;}
  if(session.stage==="email"){
    const email=raw.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)){await sendTelegramMessage(chatId,"Esse e-mail não parece válido. Digite novamente.");return true;}
    await admin.from("telegram_login_sessions").update({email,stage:"password",updated_at:new Date().toISOString()}).eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,"Agora envie a <b>senha</b> fornecida pelo administrador.\n\n🔐 A senha é usada somente nesta tentativa e não é armazenada pelo bot.");return true;
  }
  const email=String(session.email||"");const auth=createBotAuthSupabaseClient();const {data,error}=await auth.auth.signInWithPassword({email,password:raw});
  if(error||!data.user){const attempts=Number(session.attempts||0)+1;const lockedUntil=attempts>=5?new Date(Date.now()+15*60_000).toISOString():null;await admin.from("telegram_login_sessions").update({attempts,locked_until:lockedUntil,updated_at:new Date().toISOString()}).eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,lockedUntil?"🔒 E-mail ou senha incorretos. O acesso foi pausado por 15 minutos.":`❌ E-mail ou senha incorretos. Tente novamente (${5-attempts} tentativas restantes).`);return true;}
  await auth.auth.signOut();
  const [{data:profile},subscription,{data:existing}]=await Promise.all([admin.from("profiles").select("approved,role").eq("id",data.user.id).maybeSingle(),getSubscriptionState(data.user.id),admin.from("telegram_accounts").select("telegram_user_id").eq("user_id",data.user.id).maybeSingle()]);
  const isAdmin=profile?.role==="admin";if(!profile||(profile.role!=="admin"&&!profile.approved)||(!isAdmin&&!subscription.isActive)){await admin.from("telegram_login_sessions").delete().eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,"⏳ Seus dados estão corretos, mas a assinatura ainda não foi liberada. Envie o comprovante ao atendimento.",telegramWelcomeKeyboard());return true;}
  if(existing&&Number(existing.telegram_user_id)!==user.id){await admin.from("telegram_login_sessions").delete().eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,"🔒 Esta conta já está conectada em outro Telegram. Para usar aqui, primeiro toque em <b>Sair / Trocar conta</b> no chat onde ela está ativa.",telegramWelcomeKeyboard());return true;}
  const {error:linkError}=await admin.from("telegram_accounts").upsert({user_id:data.user.id,telegram_user_id:user.id,chat_id:chatId,username:user.username||null,first_name:user.first_name||null,bot_mode:"idle",bot_context:{},updated_at:new Date().toISOString()},{onConflict:"user_id"});if(linkError){await sendTelegramMessage(chatId,"Não foi possível vincular esta conta. Ela pode estar ativa em outro Telegram.",telegramWelcomeKeyboard());return true;}
  await admin.from("telegram_login_sessions").delete().eq("telegram_user_id",user.id);await sendTelegramMessage(chatId,"✅ <b>Login realizado!</b>\n\nSua conta foi vinculada a este Telegram. Enquanto ela estiver ativa aqui, não poderá ser usada em outro chat do bot.");await showMenu(user,chatId);return true;
}

async function logout(user:TgUser,chatId:number,messageId?:number){const admin=createAdminSupabaseClient();await Promise.all([admin.from("telegram_accounts").delete().eq("telegram_user_id",user.id),admin.from("telegram_login_sessions").delete().eq("telegram_user_id",user.id)]);await render(chatId,"🚪 <b>Você saiu da conta.</b>\n\nO acesso foi liberado para entrar em outro Telegram. Se quiser usar outra conta aqui, toque em <b>Já tenho acesso</b>.",telegramWelcomeKeyboard(),messageId);}

async function showMenu(user:TgUser,chatId:number,messageId?:number){const access=await requireAccess(user,chatId);if(!access)return;await setState(user.id,"idle",{});const name=user.first_name?`, <b>${escapeHtml(user.first_name)}</b>`:"";const status=access.isAdmin?"🛡 Acesso administrativo":`✅ Assinatura ativa até ${formatDate(access.activeUntil)}`;await render(chatId,`📚 <b>${SITE_NAME}</b>\n\nOlá${name}!\n${status}\n\nVocê pode baixar um livro disponível ou enviar um pedido para o acervo.`,telegramMainKeyboard(),messageId);}
async function showSubscription(user:TgUser,chatId:number,messageId?:number){const state=await getLinkedState(user,chatId);if(!state){await showWelcome(chatId,messageId);return;}if(state.isAdmin){await render(chatId,"🛡 Sua conta de administrador possui acesso permanente.",telegramMainKeyboard(),messageId);return;}if(state.approved&&state.subscription?.isActive){await render(chatId,`💳 <b>Assinatura ativa</b>\n\n📅 Início: ${formatDate(state.subscription.activatedAt)}\n⏳ Vencimento: ${formatDate(state.subscription.activeUntil)}`,telegramMainKeyboard(),messageId);return;}await render(chatId,paymentMessage(),paymentKeyboard(),messageId);}

async function promptDownload(user:TgUser,chatId:number,messageId?:number){if(!await requireAccess(user,chatId))return;await setState(user.id,"download",{});await render(chatId,"🔎 <b>Buscar livro</b>\n\nDigite o título ou o nome do autor.",telegramBackToMenuKeyboard(),messageId);}
async function getLanguageFiles(bookId:string){const {data}=await createAdminSupabaseClient().from("book_language_files").select("id,book_id,language,format,drive_file_id,file_name,mime_type").eq("book_id",bookId);return (data||[]) as LanguageFile[];}
async function searchBooks(user:TgUser,chatId:number,raw:string){if(!await requireAccess(user,chatId))return;const term=raw.replace(/[%_]/g," ").replace(/\s+/g," ").trim();if(term.length<2){await sendTelegramMessage(chatId,"Digite pelo menos 2 caracteres.");return;}const pattern=`%${term}%`;const admin=createAdminSupabaseClient();const {data}=await admin.from("books").select("id,title,author,language,file_name,mime_type,reading_pdf_drive_file_id,kindle_drive_file_id").eq("published",true).eq("allow_download",true).or(`title.ilike.${pattern},author.ilike.${pattern}`).limit(10);const results=data||[];if(!results.length){await sendTelegramMessage(chatId,`🔎 Nenhum livro encontrado para “${escapeHtml(term)}”.\n\nVocê também pode pedir esse título pelo menu.`,telegramMainKeyboard());await setState(user.id,"idle",{});return;}const ids=results.map(book=>book.id);const {data:allFiles}=await admin.from("book_language_files").select("book_id,language").in("book_id",ids);const langs=new Map<string,string[]>();for(const file of allFiles||[]){const label=languageLabel(file.language);const list=langs.get(file.book_id)||[];if(!list.includes(label))list.push(label);langs.set(file.book_id,list);}await sendTelegramMessage(chatId,"Escolha o livro:",{inline_keyboard:[...results.map(book=>{const list=langs.get(book.id)||[languageLabel(book.language)];return [{text:`📚 ${book.title} • ${list.join(" / ")}`.slice(0,64),callback_data:`book:${book.id}`}];}),[{text:"↩️ Voltar",callback_data:"show_menu"}]]});}

async function loadBook(id:string){const {data}=await createAdminSupabaseClient().from("books").select("*").eq("id",id).eq("published",true).eq("allow_download",true).maybeSingle();return data;}
async function showFormats(user:TgUser,chatId:number,id:string,messageId?:number){if(!await requireAccess(user,chatId))return;const book=await loadBook(id);if(!book){await render(chatId,"Livro indisponível.",telegramMainKeyboard(),messageId);return;}const files=await getLanguageFiles(id);const languages=[...new Set(files.map(file=>String(file.language||"").toLowerCase()).filter(Boolean))];if(languages.length){await setState(user.id,"idle",{});await render(chatId,`📖 <b>${escapeHtml(book.title)}</b>\n👤 ${escapeHtml(book.author)}\n\nEscolha o idioma:`,{inline_keyboard:[...languages.map(lang=>[{text:languageLabel(lang),callback_data:`lang:${id}:${lang}`}]),[{text:"↩️ Voltar",callback_data:"show_menu"}]]},messageId);return;}await showLegacyFormats(user,chatId,book,messageId);}
async function showLegacyFormats(user:TgUser,chatId:number,book:any,messageId?:number){const pdf=isPdf(book)||Boolean(book.reading_pdf_drive_file_id);const epub=isEpub(book)||Boolean(book.kindle_drive_file_id);const rows:Array<Array<Record<string,string>>> = [];if(pdf)rows.push([{text:"📄 BAIXAR PDF",callback_data:`format:${book.id}:pdf`}]);if(epub)rows.push([{text:"📱 BAIXAR EPUB",callback_data:`format:${book.id}:epub`}]);rows.push([{text:"↩️ Voltar",callback_data:"show_menu"}]);await render(chatId,`📖 <b>${escapeHtml(book.title)}</b>\n👤 ${escapeHtml(book.author)}\n🌎 ${languageLabel(book.language)}\n\nEscolha o formato:`,{inline_keyboard:rows},messageId);}
async function showLanguageFormats(user:TgUser,chatId:number,id:string,language:string,messageId?:number){if(!await requireAccess(user,chatId))return;const book=await loadBook(id);if(!book)return;const files=(await getLanguageFiles(id)).filter(file=>String(file.language||"").toLowerCase()===language.toLowerCase());const formats=[...new Set(files.map(file=>String(file.format||"").toLowerCase()).filter(format=>format==="pdf"||format==="epub"))];await render(chatId,`📖 <b>${escapeHtml(book.title)}</b>\n🌎 ${languageLabel(language)}\n\nEscolha o formato:`,{inline_keyboard:[...formats.map(format=>[{text:format==="pdf"?"📄 BAIXAR PDF":"📱 BAIXAR EPUB",callback_data:`file:${id}:${language}:${format}`}]),[{text:"↩️ Idiomas",callback_data:`book:${id}`}]]},messageId);}
async function sendLanguageBook(user:TgUser,chatId:number,id:string,language:string,format:BookFormat,messageId?:number){const access=await requireAccess(user,chatId);if(!access)return;const book=await loadBook(id);if(!book)return;const files=await getLanguageFiles(id);const file=files.find(item=>String(item.language||"").toLowerCase()===language.toLowerCase()&&String(item.format||"").toLowerCase()===format);if(!file){await render(chatId,"Esse idioma/formato não está disponível.",telegramMainKeyboard(),messageId);return;}await render(chatId,`⏳ Preparando <b>${escapeHtml(book.title)}</b> em ${languageLabel(language)}...`,undefined,messageId);const response=await fetchDriveFile(file.drive_file_id);const declared=Number(response.headers.get("content-length")||0);if(declared>TELEGRAM_MAX_OUTGOING_BYTES){await render(chatId,"O arquivo é grande demais para envio pelo Telegram. Baixe pelo site.",telegramMainKeyboard(),messageId);return;}const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES){await render(chatId,"O arquivo é grande demais para envio pelo Telegram. Baixe pelo site.",telegramMainKeyboard(),messageId);return;}await sendTelegramDocument(chatId,file.file_name,file.mime_type|| (format==="pdf"?"application/pdf":"application/epub+zip"),bytes,`📚 <b>${escapeHtml(book.title)}</b>\n🌎 ${languageLabel(language)}\n${format.toUpperCase()}`);await createAdminSupabaseClient().from("telegram_download_history").insert({user_id:access.userId,source:"catalog",book_id:id,title_snapshot:book.title,format,requested_at:new Date().toISOString()});await render(chatId,"✅ Livro enviado.",telegramMainKeyboard(),messageId);}
async function sendBook(user:TgUser,chatId:number,id:string,format:BookFormat,messageId?:number){const access=await requireAccess(user,chatId);if(!access)return;const book=await loadBook(id);if(!book)return;let fileId:string|undefined;let fileName:string|undefined;let mime:string;if(format==="pdf"){if(isPdf(book)){fileId=book.drive_file_id;fileName=book.file_name;}else{fileId=book.reading_pdf_drive_file_id;fileName=book.reading_pdf_file_name;}mime="application/pdf";}else{if(isEpub(book)){fileId=book.drive_file_id;fileName=book.file_name;}else{fileId=book.kindle_drive_file_id;fileName=book.kindle_file_name;}mime="application/epub+zip";}if(!fileId||!fileName){await render(chatId,"Esse formato não está disponível.",telegramMainKeyboard(),messageId);return;}await render(chatId,`⏳ Preparando <b>${escapeHtml(book.title)}</b>...`,undefined,messageId);const response=await fetchDriveFile(fileId);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>TELEGRAM_MAX_OUTGOING_BYTES){await render(chatId,"O arquivo é grande demais para envio pelo Telegram. Baixe pelo site.",telegramMainKeyboard(),messageId);return;}await sendTelegramDocument(chatId,fileName,mime,bytes,`📚 <b>${escapeHtml(book.title)}</b>\n${format.toUpperCase()}`);await createAdminSupabaseClient().from("telegram_download_history").insert({user_id:access.userId,source:"catalog",book_id:id,title_snapshot:book.title,format,requested_at:new Date().toISOString()});await render(chatId,"✅ Livro enviado.",telegramMainKeyboard(),messageId);}

async function showHistory(user:TgUser,chatId:number,messageId?:number){const access=await requireAccess(user,chatId);if(!access)return;const {data}=await createAdminSupabaseClient().from("telegram_download_history").select("id,book_id,title_snapshot,format").eq("user_id",access.userId).eq("source","catalog").order("requested_at",{ascending:false}).limit(20);const unique=(data||[]).filter((row,index,rows)=>rows.findIndex(item=>item.book_id===row.book_id&&item.format===row.format)===index).slice(0,10);if(!unique.length){await render(chatId,"Seu histórico ainda está vazio.",telegramMainKeyboard(),messageId);return;}await render(chatId,"🕘 <b>Histórico de downloads</b>",{inline_keyboard:[...unique.map(row=>[{text:`${row.format==="pdf"?"📄":"📱"} ${row.title_snapshot}`.slice(0,60),callback_data:`format:${row.book_id}:${row.format}`}]),[{text:"↩️ Voltar",callback_data:"show_menu"}]]},messageId);}

async function beginRequest(user:TgUser,chatId:number,messageId?:number){if(!await requireAccess(user,chatId))return;await setState(user.id,"request_title",{});await render(chatId,"📝 <b>Pedir um livro</b>\n\nQual é o <b>título</b> do livro?",telegramBackToMenuKeyboard(),messageId);}
async function handleRequest(user:TgUser,chatId:number,access:Access,raw:string){const value=raw.trim();if(value.length<2){await sendTelegramMessage(chatId,"Digite pelo menos 2 caracteres.");return;}if(access.mode==="request_title"){await setState(user.id,"request_author",{title:value.slice(0,220)});await sendTelegramMessage(chatId,"Quem é o <b>autor</b> do livro?");return;}if(access.mode==="request_author"){await setState(user.id,"request_language",{...access.context,author:value.slice(0,220)});await sendTelegramMessage(chatId,"Em qual <b>idioma</b> você deseja o livro?\nExemplo: Português, Inglês ou Espanhol.");return;}if(access.mode==="request_language"){const title=access.context.title;const author=access.context.author;if(!title||!author){await setState(user.id,"idle",{});return;}const admin=createAdminSupabaseClient();const {error}=await admin.from("book_requests").insert({user_id:access.userId,title,author,language:value.slice(0,80)});await setState(user.id,"idle",{});if(error){await sendTelegramMessage(chatId,"Não consegui registrar o pedido agora. Tente novamente.",telegramMainKeyboard());return;}await sendTelegramMessage(chatId,`✅ <b>Pedido enviado!</b>\n\n📚 ${escapeHtml(title)}\n👤 ${escapeHtml(author)}\n🌎 ${escapeHtml(value)}\n\nQuando o livro for publicado, você receberá uma notificação automática com o link.`,telegramMainKeyboard());}}

export async function POST(request:NextRequest){
  try{
    if(!validSecret(request.headers.get("x-telegram-bot-api-secret-token")))return NextResponse.json({ok:false},{status:401});
    const update=await request.json() as TgUpdate;
    if(isPublicationChat(update.my_chat_member?.chat)){
      const status=update.my_chat_member?.new_chat_member?.status;
      if(!status||["administrator","member"].includes(status)){const registered=await registerTelegramChannel(update.my_chat_member!.chat);console.info("[telegram-channel] membership detected",{chatId:registered?.chat_id,role:registered?.role});}
      return NextResponse.json({ok:true});
    }
    const channelPost=update.channel_post||update.edited_channel_post;
    if(isPublicationChat(channelPost?.chat)){
      const registered=await registerTelegramChannel(channelPost!.chat);console.info("[telegram-channel] post detected",{chatId:registered?.chat_id,role:registered?.role});
      return NextResponse.json({ok:true});
    }
    if(update.callback_query){
      const query=update.callback_query;const chatId=query.message?.chat.id;const messageId=query.message?.message_id;
      if(!chatId){await answerTelegramCallback(query.id);return NextResponse.json({ok:true});}
      const data=query.data||"";await answerTelegramCallback(query.id);
      if(data==="action_login")await beginLogin(query.from,chatId,messageId);
      else if(data==="cancel_login"){await createAdminSupabaseClient().from("telegram_login_sessions").delete().eq("telegram_user_id",query.from.id);await showWelcome(chatId,messageId);}
      else if(data==="subscription_paid")await render(chatId,`✅ Envie o comprovante para <b>@${receiptUsername()}</b>. Depois da confirmação, você receberá seu e-mail e senha.`,telegramWelcomeKeyboard(),messageId);
      else if(data==="action_logout")await logout(query.from,chatId,messageId);
      else if(data==="show_menu")await showMenu(query.from,chatId,messageId);
      else if(data==="show_subscription")await showSubscription(query.from,chatId,messageId);
      else if(data==="action_download")await promptDownload(query.from,chatId,messageId);
      else if(data==="action_request")await beginRequest(query.from,chatId,messageId);
      else if(data==="show_history")await showHistory(query.from,chatId,messageId);
      else if(data.startsWith("book:"))await showFormats(query.from,chatId,data.split(":")[1],messageId);
      else if(data.startsWith("lang:")){const [,id,language]=data.split(":");await showLanguageFormats(query.from,chatId,id,language,messageId);}
      else if(data.startsWith("file:")){const [,id,language,format]=data.split(":");if(format==="pdf"||format==="epub")await sendLanguageBook(query.from,chatId,id,language,format,messageId);}
      else if(data.startsWith("format:")){const [,id,format]=data.split(":");if(format==="pdf"||format==="epub")await sendBook(query.from,chatId,id,format,messageId);}
      return NextResponse.json({ok:true});
    }
    const message=update.message;const user=message?.from;const chatId=message?.chat.id;if(!message||!user||!chatId)return NextResponse.json({ok:true});if(message.chat.type&&message.chat.type!=="private")return NextResponse.json({ok:true});

    const forwarded=message.forward_origin?.type==="channel"?message.forward_origin.chat:message.forward_from_chat;
    if(isPublicationChat(forwarded)){
      const state=await getLinkedState(user,chatId);
      if(!state?.isAdmin){await sendTelegramMessage(chatId,"Somente o administrador pode cadastrar canais de publicação.");return NextResponse.json({ok:true});}
      try{
        const registered=await registerTelegramChannel(forwarded!);
        await sendTelegramMessage(chatId,`✅ <b>Canal reconhecido!</b>\n\n${escapeHtml(registered.title||String(registered.chat_id))}\nFunção: <b>${registered.role==="official"?"Oficial":"Reserva"}</b>\n\nEle já pode receber livros publicados pelo painel.`,telegramMainKeyboard());
      }catch(error){await sendTelegramMessage(chatId,`⚠️ ${escapeHtml(error instanceof Error?error.message:"Não foi possível registrar o canal.")}`,telegramMainKeyboard());}
      return NextResponse.json({ok:true});
    }

    const raw=(message.text||"").trim();const lower=raw.toLowerCase();if(lower.startsWith("/sair")){await logout(user,chatId);return NextResponse.json({ok:true});}if(await handleLoginText(user,chatId,raw))return NextResponse.json({ok:true});if(lower.startsWith("/start")||lower.startsWith("/menu")){if(lower.startsWith("/start"))try{await setupTelegramWebhook();}catch(error){console.warn("[telegram-webhook] command sync failed",error instanceof Error?error.message:"unknown");}const linked=await getLinkedState(user,chatId);if(linked)await showMenu(user,chatId);else await showWelcome(chatId);return NextResponse.json({ok:true});}if(lower.startsWith("/baixar")){await promptDownload(user,chatId);return NextResponse.json({ok:true});}if(lower.startsWith("/pedir")){await beginRequest(user,chatId);return NextResponse.json({ok:true});}if(lower.startsWith("/historico")){await showHistory(user,chatId);return NextResponse.json({ok:true});}if(lower.startsWith("/assinatura")){await showSubscription(user,chatId);return NextResponse.json({ok:true});}
    const access=await requireAccess(user,chatId);if(!access)return NextResponse.json({ok:true});if(message.document||message.photo){await sendTelegramMessage(chatId,"Este bot não recebe arquivos. Use <b>Baixar livro</b> ou <b>Pedir livro</b>.",telegramMainKeyboard());return NextResponse.json({ok:true});}if(access.mode==="download"&&raw)await searchBooks(user,chatId,raw);else if(["request_title","request_author","request_language"].includes(access.mode)&&raw)await handleRequest(user,chatId,access,raw);else await showMenu(user,chatId);return NextResponse.json({ok:true});
  }catch(error){console.error("[telegram-webhook]",error instanceof Error?error.message:"unknown");return NextResponse.json({ok:true});}
}

export async function GET(){
  try{const result=await setupTelegramWebhook();return NextResponse.json({ok:true,service:"kindle-books-telegram",...result});}
  catch(error){return NextResponse.json({ok:false,service:"kindle-books-telegram",error:error instanceof Error?error.message:"Não foi possível sincronizar o webhook."},{status:500});}
}
