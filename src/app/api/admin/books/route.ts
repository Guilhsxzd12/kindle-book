import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import { completeBookRequest } from "@/lib/book-requests";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { driveLetter,slugifyTitle } from "@/lib/slugify";

async function admin(){const viewer=await getApiViewer();return viewer.user&&viewer.profile?.role==="admin"?viewer:null;}
function isPdf(name:string,mime:string){return mime==="application/pdf"||name.toLowerCase().endsWith(".pdf");}
function isEpub(name:string,mime:string){return mime==="application/epub+zip"||name.toLowerCase().endsWith(".epub");}

async function uniqueSlug(title:string,excludeId?:string){
  const db=createAdminSupabaseClient();const base=slugifyTitle(title).toLowerCase()||"livro";
  for(let suffix=0;suffix<100;suffix++){
    const candidate=suffix===0?base:`${base}-${suffix+1}`;
    let query=db.from("books").select("id").eq("slug",candidate);
    if(excludeId)query=query.neq("id",excludeId);
    const {data}=await query.maybeSingle();if(!data)return candidate;
  }
  return `${base}-${Date.now()}`;
}

function text(value:unknown){return String(value||"").trim();}
function genericAuthor(value:string){const v=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");return !v||["autornaoinformado","autornaoidentificado","desconhecido","unknown"].includes(v)||/^\d+[ao]?serie$/i.test(v);}
function genericTitle(value:string){const v=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();return !v||/^(sem titulo|livro enviado|livro sem titulo|unknown|arquivo|ebook|pdf)\b/.test(v);}
function optionalNumber(value:unknown){if(value===""||value===null||value===undefined)return null;const number=Number(value);return Number.isFinite(number)?number:null;}

function filePatch(body:any){
  const driveFileId=text(body.driveFileId);const fileName=text(body.fileName);const mimeType=text(body.mimeType).toLowerCase();
  const patch:Record<string,unknown>={};
  if(driveFileId||fileName||mimeType){if(!driveFileId||!fileName||(!isPdf(fileName,mimeType)&&!isEpub(fileName,mimeType)))throw new Error("O arquivo principal precisa ser PDF ou EPUB.");patch.drive_file_id=driveFileId;patch.file_name=fileName;patch.mime_type=isPdf(fileName,mimeType)?"application/pdf":"application/epub+zip";}
  if("readingPdfDriveFileId" in body){const id=text(body.readingPdfDriveFileId);const name=text(body.readingPdfFileName);patch.reading_pdf_drive_file_id=id||null;patch.reading_pdf_file_name=name||null;patch.reading_pdf_generated_at=id?new Date().toISOString():null;}
  if("epubDriveFileId" in body){const id=text(body.epubDriveFileId);const name=text(body.epubFileName);patch.kindle_drive_file_id=id||null;patch.kindle_file_name=name||null;patch.kindle_generated_at=id?new Date().toISOString():null;}
  return patch;
}

export async function POST(request:NextRequest){
  const viewer=await admin();if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const title=text(body.title);const author=text(body.author);const description=text(body.description);
    if(title.length<2||author.length<2)return NextResponse.json({error:"Título e autor são obrigatórios."},{status:400});
    const files=filePatch(body);
    const mainName=text(body.fileName);const mainMime=text(body.mimeType).toLowerCase();
    const pdfId=text(body.readingPdfDriveFileId);const pdfName=text(body.readingPdfFileName);
    if(!("drive_file_id" in files)||!isEpub(mainName,mainMime)||!pdfId||!isPdf(pdfName,"application/pdf"))return NextResponse.json({error:"Para cadastrar um novo livro, envie obrigatoriamente os dois arquivos: EPUB e PDF."},{status:400});
    const coverUrl=text(body.coverUrl)||null;
    const year=optionalNumber(body.year);const pages=optionalNumber(body.pages);const now=new Date().toISOString();
    const payload={title,slug:await uniqueSlug(title),author,description:description||null,language:text(body.language).toLowerCase()||null,category_id:text(body.categoryId)||null,year,pages,cover_url:coverUrl,drive_folder_letter:driveLetter(title),allow_download:true,published:body.published!==false,updated_at:now,metadata_reviewed:body.metadataReviewed!==false,...files};
    const db=createAdminSupabaseClient();const {data,error}=await db.from("books").insert(payload).select("*").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    const requestId=text(body.requestId);const notification=requestId&&data.published?await completeBookRequest(requestId,data):null;
    return NextResponse.json({book:data,notification});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao salvar livro."},{status:400});}
}

export async function PATCH(request:NextRequest){
  const viewer=await admin();if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  try{
    const body=await request.json();const id=text(body.id);if(!id)return NextResponse.json({error:"Livro obrigatório."},{status:400});
    const db=createAdminSupabaseClient();const {data:before}=await db.from("books").select("*").eq("id",id).maybeSingle();if(!before)return NextResponse.json({error:"Livro não encontrado."},{status:404});
    const title="title" in body?(text(body.title)||before.title):before.title;
    const author="author" in body?(text(body.author)||before.author):before.author;
    const patch:Record<string,unknown>={
      title,
      author,
      description:"description" in body?(text(body.description)||null):before.description,
      language:"language" in body?(text(body.language).toLowerCase()||null):before.language,
      category_id:"categoryId" in body?(text(body.categoryId)||null):before.category_id,
      year:"year" in body?optionalNumber(body.year):before.year,
      pages:"pages" in body?optionalNumber(body.pages):before.pages,
      cover_url:"coverUrl" in body?(text(body.coverUrl)||null):before.cover_url,
      published:"published" in body?body.published!==false:before.published,
      allow_download:true,
      drive_folder_letter:driveLetter(title),
      metadata_reviewed:"metadataReviewed" in body?body.metadataReviewed===true:before.metadata_reviewed,
      updated_at:new Date().toISOString(),
      ...filePatch(body)
    };
    if(title!==before.title)patch.slug=await uniqueSlug(title,id);
    const resolveCorrection=body.resolveCorrection===true||(before.needs_correction===true&&("title" in body||"author" in body));
    if(resolveCorrection){
      if(genericTitle(title))return NextResponse.json({error:"Informe um título válido para liberar o livro."},{status:400});
      if(genericAuthor(author))return NextResponse.json({error:"Informe um autor válido para liberar o livro."},{status:400});
      patch.needs_correction=false;
      patch.correction_reason=null;
      patch.metadata_reviewed=true;
      if(body.resolveCorrection===true)patch.published=true;
    }
    const {data,error}=await db.from("books").update(patch).eq("id",id).select("*").single();if(error)return NextResponse.json({error:error.message},{status:400});
    const requestId=text(body.requestId);const notification=requestId&&data.published?await completeBookRequest(requestId,data):null;
    return NextResponse.json({book:data,notification});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao atualizar livro."},{status:400});}
}

export async function DELETE(request:NextRequest){
  const viewer=await admin();if(!viewer)return NextResponse.json({error:"Acesso negado."},{status:403});
  const id=request.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({error:"ID obrigatório."},{status:400});
  const db=createAdminSupabaseClient();const {error}=await db.from("books").delete().eq("id",id);
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
}
