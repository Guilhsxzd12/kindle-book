import "server-only";
import JSZip from "jszip";
import { getDocument } from "pdfjs-serverless";
import { lookupBookMetadata } from "@/lib/book-metadata-lookup";

export type EmbeddedBookCover={bytes:Uint8Array;mimeType:string;extension:string};
export type IdentifiedBook={
  title:string;
  author:string;
  description:string|null;
  year:number|null;
  pages:number|null;
  language:string|null;
  isbn:string|null;
  subjects:string[];
  coverUrl:string|null;
  embeddedCover:EmbeddedBookCover|null;
  confidence:"metadata"|"content"|"catalog"|"lookup"|"filename";
};

function decodeXml(value:string){
  return value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}
function stripTags(value?:string|null){if(!value)return null;const decoded=decodeXml(value);return decodeXml(decoded.replace(/<[^>]+>/g," "))||null;}
function compact(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
function yearFrom(value?:string|null){const m=value?.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);return m?Number(m[1]):null;}
function normalizeLanguage(value?:string|null){if(!value)return null;const v=value.trim().toLowerCase().replace(/_/g,"-");if(v.startsWith("pt")||v==="por")return "pt";if(v.startsWith("en")||v==="eng")return "en";if(v.startsWith("es")||v==="spa")return "es";return v.split("-")[0]||null;}
function compactIsbn(value?:string|null){return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();}
function extractIsbn(text:string){const match=text.match(/\bISBN(?:-1[03])?\s*:?\s*[\s-]*((?:97[89][\s-]?)?\d[\d\s-]{8,17}[\dX])\b/i);if(!match)return null;const isbn=compactIsbn(match[1]);return /^(?:\d{9}[\dX]|\d{13})$/.test(isbn)?isbn:null;}
function genericAuthor(value?:string|null){const v=compact(value||"");return !v||v==="autornaoinformado"||v==="autornaoidentificado"||v==="desconhecido"||v==="unknown";}
function usefulTitle(value?:string|null){
  if(!value)return null;const v=value.replace(/\s+/g," ").trim();if(v.length<2||v.length>180)return null;
  if(/^(microsoft word|documento|untitled|sem titulo|unknown|arquivo|ebook|pdf)\b/i.test(v))return null;
  if(/^[A-Z]:\\|^\/|\.pdf$|\.epub$/i.test(v))return null;
  return v;
}
function cleanTitleNoise(value:string){
  return value
    .replace(/\.(pdf|epub)$/i,"")
    .replace(/\b(?:z[-_ ]?lib(?:rary)?|zlibrary|1lib|biblioteca virtual)\b/gi," ")
    .replace(/\b(?:canal\s*)?@[a-z0-9_.-]+\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}

function filenameGuess(fileName:string){
  let stem=cleanTitleNoise(fileName).replace(/[\{\[][^\}\]]*[\}\]]/g," ").replace(/[_]+/g," ").replace(/\s+/g," ").trim();
  let author="Autor não informado";
  const doubleDash=stem.match(/^(.*?)\s+--\s+([^\-]{3,100})(?:\s+--\s+.*)?$/);
  if(doubleDash){stem=doubleDash[1].trim();author=doubleDash[2].trim();}
  if(genericAuthor(author)){const by=stem.match(/^(.*?)\s+by\s+(.+?)(?:\s+--\s+.*)?$/i);if(by){stem=by[1].trim();author=by[2].trim();}}
  if(genericAuthor(author)){const paren=stem.match(/^(.*?)\s*\(([^()]{3,80})\)\s*$/);if(paren&&/[A-Za-zÀ-ÿ]/.test(paren[2])&&!/^\d{4}$/.test(paren[2].trim())){stem=paren[1].trim();author=paren[2].trim();}}
  stem=stem.replace(/\s+--\s+.*$/," ").replace(/\s+/g," ").trim();
  return {title:stem||"Livro enviado pelo Telegram",author};
}

function attr(raw:string,name:string){const m=raw.match(new RegExp("\\b"+name+"=[\\\"\\']([^\\\"\\']+)[\\\"\\']","i"));return m?.[1]||null;}
function resolveZipPath(base:string,relative:string){
  let rel=relative.split("#")[0];try{rel=decodeURIComponent(rel);}catch{}
  const input=(base?base+"/":"")+rel;const parts:string[]=[];
  for(const part of input.split("/")){if(!part||part===".")continue;if(part==="..")parts.pop();else parts.push(part);}
  return parts.join("/");
}
function imageExtension(mime:string,href:string){
  const fromMime:Record<string,string>={"image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"};
  if(fromMime[mime])return fromMime[mime];const ext=href.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1];return ext==="jpeg"?"jpg":ext||"jpg";
}

async function epubCover(zip:JSZip,opf:string,opfPath:string){
  const base=opfPath.includes("/")?opfPath.slice(0,opfPath.lastIndexOf("/")):"";
  const items=[...opf.matchAll(/<item\b([^>]*?)\/?>/gi)].map(match=>{const raw=match[1];return {id:attr(raw,"id"),href:attr(raw,"href"),mime:attr(raw,"media-type"),properties:attr(raw,"properties")};}).filter(item=>item.href);
  const coverId=opf.match(/<meta\b[^>]*name=["\']cover["\'][^>]*content=["\']([^"\']+)["\'][^>]*>/i)?.[1]||opf.match(/<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']cover["\'][^>]*>/i)?.[1]||null;
  let item=items.find(x=>x.properties?.split(/\s+/).includes("cover-image"))||items.find(x=>coverId&&x.id===coverId)||items.find(x=>/cover|capa/i.test(String(x.id||"")+" "+String(x.href||""))&&String(x.mime||"").startsWith("image/"));
  if(!item){
    const guideHref=opf.match(/<reference\b[^>]*type=["\']cover["\'][^>]*href=["\']([^"\']+)["\'][^>]*>/i)?.[1]||null;
    if(guideHref){const pagePath=resolveZipPath(base,guideHref);const page=await zip.file(pagePath)?.async("text");if(page){const imageHref=page.match(/<(?:img|image)\b[^>]*(?:src|href|xlink:href)=["\']([^"\']+)["\']/i)?.[1]||null;if(imageHref){const pageBase=pagePath.includes("/")?pagePath.slice(0,pagePath.lastIndexOf("/")):"";const imagePath=resolveZipPath(pageBase,imageHref);const file=zip.file(imagePath);if(file){const bytes=await file.async("uint8array");const ext=imageExtension("",imagePath);const mime=ext==="png"?"image/png":ext==="webp"?"image/webp":ext==="gif"?"image/gif":"image/jpeg";return {bytes,mimeType:mime,extension:ext} as EmbeddedBookCover;}}}}
  }
  if(!item?.href)return null;
  const coverPath=resolveZipPath(base,item.href);const file=zip.file(coverPath);if(!file)return null;
  const bytes=await file.async("uint8array");const mime=item.mime||"image/jpeg";return {bytes,mimeType:mime,extension:imageExtension(mime,coverPath)} as EmbeddedBookCover;
}

async function epubMetadata(bytes:Uint8Array){
  try{
    const zip=await JSZip.loadAsync(bytes);const container=await zip.file("META-INF/container.xml")?.async("text");
    const opfPath=container?.match(/full-path=["\']([^"\']+)["\']/i)?.[1];if(!opfPath)return null;
    const opf=await zip.file(opfPath)?.async("text");if(!opf)return null;
    const title=opf.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)?.[1];
    const author=opf.match(/<dc:creator(?:\s[^>]*)?>([\s\S]*?)<\/dc:creator>/i)?.[1];
    const language=opf.match(/<dc:language(?:\s[^>]*)?>([\s\S]*?)<\/dc:language>/i)?.[1];
    const description=opf.match(/<dc:description(?:\s[^>]*)?>([\s\S]*?)<\/dc:description>/i)?.[1];
    const date=opf.match(/<dc:date(?:\s[^>]*)?>([\s\S]*?)<\/dc:date>/i)?.[1];
    const identifiers=[...opf.matchAll(/<dc:identifier(?:\s[^>]*)?>([\s\S]*?)<\/dc:identifier>/gi)].map(m=>stripTags(m[1])||"");
    const subjects=[...opf.matchAll(/<dc:subject(?:\s[^>]*)?>([\s\S]*?)<\/dc:subject>/gi)].map(m=>stripTags(m[1])||"").filter(Boolean).slice(0,20);
    const isbn=identifiers.map(compactIsbn).find(v=>/^(?:\d{9}[\dX]|\d{13})$/.test(v))||null;
    const embeddedCover=await epubCover(zip,opf,opfPath);
    if(!title&&!author&&!isbn&&!embeddedCover)return null;
    return {title:usefulTitle(title?decodeXml(stripTags(title)||title):null),author:author?decodeXml(stripTags(author)||author):null,language:normalizeLanguage(language?decodeXml(language):null),description:stripTags(description||null),year:yearFrom(date?decodeXml(date):null),pages:null as number|null,isbn,subjects,embeddedCover};
  }catch{return null;}
}

function contentCandidates(lines:string[]){
  const cleaned=lines.map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);const joined=cleaned.slice(0,350).join("\n");const isbn=extractIsbn(joined);let author:string|null=null;
  for(const line of cleaned.slice(0,140)){const m=line.match(/^(?:por|autor(?:a)?|escrito por)\s*[:\-]?\s*(.{3,100})$/i);if(m){author=m[1].trim();break;}}
  const skip=/^(sum[aá]rio|[ií]ndice|copyright|todos os direitos|isbn|editora|edi[cç][aã]o|www\.|https?:|biblioteca|digitalizado|arquivo|ebook|pdf|cap[ií]tulo\s+\d+)/i;
  const title=cleaned.slice(0,100).find(line=>line.length>=3&&line.length<=110&&/[A-Za-zÀ-ÿ]/.test(line)&&!skip.test(line)&&!/^\d+$/.test(line))||null;
  return {title:usefulTitle(title),author,isbn};
}

async function pdfMetadata(bytes:Uint8Array){
  try{
    const loading=getDocument({data:bytes,useSystemFonts:true});const pdf=await loading.promise;const meta=await pdf.getMetadata() as any;const info=meta?.info||{};
    const rawTitle=typeof info.Title==="string"?info.Title.trim():"";const rawAuthor=typeof info.Author==="string"?info.Author.trim():"";const creation=typeof info.CreationDate==="string"?info.CreationDate:"";const lines:string[]=[];
    const pageCount=Math.min(pdf.numPages||0,8);
    for(let pageNo=1;pageNo<=pageCount;pageNo++){try{const page=await pdf.getPage(pageNo);const text=await page.getTextContent();for(const item of text.items as any[]){const str=typeof item?.str==="string"?item.str.trim():"";if(str)lines.push(str);}}catch{}}
    const content=contentCandidates(lines);const title=usefulTitle(rawTitle)||content.title;const author=!genericAuthor(rawAuthor)?rawAuthor:(content.author||null);
    const result={title,author,description:null as string|null,year:yearFrom(creation),pages:pdf.numPages||null,language:null as string|null,isbn:content.isbn,subjects:[] as string[],embeddedCover:null as EmbeddedBookCover|null,usedContent:!usefulTitle(rawTitle)&&Boolean(content.title)};
    await loading.destroy();return result;
  }catch{return null;}
}

export async function identifyBookFromUpload(fileName:string,mimeType:string,bytes:Uint8Array,hints?:{title?:string|null;author?:string|null}):Promise<IdentifiedBook>{
  const guess=filenameGuess(fileName);const isEpub=mimeType==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");const embedded=isEpub?await epubMetadata(bytes):await pdfMetadata(bytes);
  const hintedTitle=usefulTitle(cleanTitleNoise(String(hints?.title||"")));
  let title=embedded?.title?.trim()||hintedTitle||guess.title;let author=embedded?.author?.trim()||(!genericAuthor(hints?.author)?String(hints?.author).trim():guess.author);
  let description=embedded?.description||null;let year=embedded?.year||null;let pages=embedded?.pages||null;let language=embedded?.language||null;let isbn=embedded?.isbn||null;let subjects=embedded?.subjects||[];
  const usedContent=Boolean(embedded&&"usedContent" in embedded&&embedded.usedContent);let confidence:IdentifiedBook["confidence"]=embedded?.title?(usedContent?"content":"metadata"):(hintedTitle?"catalog":"filename");
  const lookup=await lookupBookMetadata({title:title||guess.title,author,isEpub?author:(hints?.author||author),isbn});
  let coverUrl:string|null=null;
  if(lookup){
    if(!embedded?.title&&lookup.title){title=lookup.title;confidence="lookup";}
    if(genericAuthor(author)&&!genericAuthor(lookup.author))author=lookup.author;
    if(!year&&lookup.year)year=lookup.year;if(!pages&&lookup.pages)pages=lookup.pages;if(!language&&lookup.language)language=lookup.language;if(!isbn&&lookup.isbn)isbn=lookup.isbn;
    subjects=Array.from(new Set([...subjects,...lookup.categories])).slice(0,24);coverUrl=lookup.coverUrl;
  }
  return {title:title||"Livro enviado pelo Telegram",author:author||"Autor não informado",description,year,pages,language,isbn,subjects,coverUrl,embeddedCover:embedded?.embeddedCover||null,confidence};
}