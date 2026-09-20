import "server-only";
import JSZip from "jszip";
import { getDocument } from "pdfjs-serverless";

export type IdentifiedBook={
  title:string;
  author:string;
  description:string|null;
  year:number|null;
  pages:number|null;
  language:string|null;
  isbn:string|null;
  subjects:string[];
  confidence:"metadata"|"content"|"catalog"|"lookup"|"filename";
};

type LookupBook={title:string;author:string;description:string|null;year:number|null;pages:number|null;language:string|null;isbn:string|null;categories:string[]};

function decodeXml(value:string){
  return value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}
function stripTags(value?:string|null){return value?decodeXml(value.replace(/<[^>]+>/g," "))||null:null;}
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

function levenshtein(a:string,b:string){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i);const cur=new Array<number>(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function titleSimilarity(a:string,b:string){const x=compact(a),y=compact(b);if(!x||!y)return 0;if(x===y)return 1;const longest=Math.max(x.length,y.length);let score=1-levenshtein(x,y)/longest;if(x.includes(y)||y.includes(x))score=Math.max(score,Math.min(x.length,y.length)/longest+.18);return Math.max(0,Math.min(1,score));}

function filenameGuess(fileName:string){
  let stem=fileName.replace(/\.(pdf|epub)$/i,"").replace(/[\[\{][^\]\}]*[\]\}]/g," ").replace(/\((?:[^)]*(?:z-lib|\.org|\.com|ebook|epub|pdf)[^)]*)\)/gi," ");
  stem=stem.replace(/([a-zà-ÿ0-9])([A-ZÁ-Ú])/g,"$1 $2").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  let author="Autor não informado";
  const by=stem.match(/^(.*?)\s+by\s+(.+)$/i);
  if(by){stem=by[1].trim();author=by[2].replace(/\([^)]*\)/g," ").replace(/\s+/g," ").trim()||author;}
  stem=stem.replace(/\b(?:z[- ]?lib(?:\.org)?|biblioteca virtual|ebook)\b/gi," ").replace(/\s+/g," ").trim();
  return {title:stem||"Livro enviado pelo Telegram",author};
}

async function epubMetadata(bytes:Uint8Array){
  try{
    const zip=await JSZip.loadAsync(bytes);const container=await zip.file("META-INF/container.xml")?.async("text");
    const opfPath=container?.match(/full-path=["']([^"']+)["']/i)?.[1];if(!opfPath)return null;
    const opf=await zip.file(opfPath)?.async("text");if(!opf)return null;
    const title=opf.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/i)?.[1];
    const author=opf.match(/<dc:creator(?:\s[^>]*)?>([\s\S]*?)<\/dc:creator>/i)?.[1];
    const language=opf.match(/<dc:language(?:\s[^>]*)?>([\s\S]*?)<\/dc:language>/i)?.[1];
    const description=opf.match(/<dc:description(?:\s[^>]*)?>([\s\S]*?)<\/dc:description>/i)?.[1];
    const date=opf.match(/<dc:date(?:\s[^>]*)?>([\s\S]*?)<\/dc:date>/i)?.[1];
    const identifiers=[...opf.matchAll(/<dc:identifier(?:\s[^>]*)?>([\s\S]*?)<\/dc:identifier>/gi)].map(m=>stripTags(m[1])||"");
    const subjects=[...opf.matchAll(/<dc:subject(?:\s[^>]*)?>([\s\S]*?)<\/dc:subject>/gi)].map(m=>stripTags(m[1])||"").filter(Boolean).slice(0,20);
    const isbn=identifiers.map(compactIsbn).find(v=>/^(?:\d{9}[\dX]|\d{13})$/.test(v))||null;
    if(!title&&!author&&!isbn)return null;
    return {title:usefulTitle(title?decodeXml(stripTags(title)||title):null),author:author?decodeXml(stripTags(author)||author):null,language:normalizeLanguage(language?decodeXml(language):null),description:stripTags(description||null),year:yearFrom(date?decodeXml(date):null),pages:null as number|null,isbn,subjects};
  }catch{return null;}
}

function contentCandidates(lines:string[]){
  const cleaned=lines.map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const joined=cleaned.slice(0,300).join("\n");
  const isbn=extractIsbn(joined);
  let author:string|null=null;
  for(const line of cleaned.slice(0,120)){
    const m=line.match(/^(?:por|autor(?:a)?|escrito por)\s*[:\-]?\s*(.{3,100})$/i);if(m){author=m[1].trim();break;}
  }
  const skip=/^(sum[aá]rio|[ií]ndice|copyright|todos os direitos|isbn|editora|edi[cç][aã]o|www\.|https?:|biblioteca|digitalizado|arquivo|ebook|pdf|cap[ií]tulo\s+\d+)/i;
  const title=cleaned.slice(0,90).find(line=>line.length>=3&&line.length<=110&&/[A-Za-zÀ-ÿ]/.test(line)&&!skip.test(line)&&!/^\d+$/.test(line))||null;
  return {title:usefulTitle(title),author,isbn};
}

async function pdfMetadata(bytes:Uint8Array){
  try{
    const loading=getDocument({data:bytes,useSystemFonts:true});const pdf=await loading.promise;
    const meta=await pdf.getMetadata() as any;const info=meta?.info||{};
    const rawTitle=typeof info.Title==="string"?info.Title.trim():"";const rawAuthor=typeof info.Author==="string"?info.Author.trim():"";
    const creation=typeof info.CreationDate==="string"?info.CreationDate:"";
    const lines:string[]=[];
    const pageCount=Math.min(pdf.numPages||0,6);
    for(let pageNo=1;pageNo<=pageCount;pageNo++){
      try{
        const page=await pdf.getPage(pageNo);const text=await page.getTextContent();
        for(const item of text.items as any[]){const str=typeof item?.str==="string"?item.str.trim():"";if(str)lines.push(str);}
      }catch{}
    }
    const content=contentCandidates(lines);
    const title=usefulTitle(rawTitle)||content.title;
    const author=!genericAuthor(rawAuthor)?rawAuthor:(content.author||null);
    const result={title,author,description:null as string|null,year:yearFrom(creation),pages:pdf.numPages||null,language:null as string|null,isbn:content.isbn,subjects:[] as string[],usedContent:!usefulTitle(rawTitle)&&Boolean(content.title)};
    await loading.destroy();return result;
  }catch{return null;}
}

async function googleBooks(query:string){
  if(query.trim().length<2)return [] as LookupBook[];
  const url=new URL("https://www.googleapis.com/books/v1/volumes");url.searchParams.set("q",query);url.searchParams.set("printType","books");url.searchParams.set("maxResults","40");url.searchParams.set("orderBy","relevance");url.searchParams.set("langRestrict","pt");
  const key=process.env.GOOGLE_BOOKS_API_KEY?.trim();if(key)url.searchParams.set("key",key);
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(8000)});if(!response.ok)return [] as LookupBook[];const data=await response.json();
  return (data.items||[]).map((item:any):LookupBook=>{const v=item.volumeInfo||{};const isbn=(v.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_13")?.identifier||(v.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_10")?.identifier||null;return {title:String(v.title||"").trim(),author:Array.isArray(v.authors)&&v.authors.length?v.authors.join(", "):"Autor não informado",description:stripTags(v.description||null),year:yearFrom(v.publishedDate),pages:Number.isFinite(v.pageCount)?Number(v.pageCount):null,language:normalizeLanguage(v.language),isbn:compactIsbn(isbn)||null,categories:Array.isArray(v.categories)?v.categories.slice(0,16):[]};}).filter((x:LookupBook)=>x.title);
}

async function lookupBest(title:string,rawFileName:string,isbn?:string|null){
  const words=title.split(/\s+/).filter(Boolean);const queries=[...(isbn?[\`isbn:\${isbn}\`]:[]),title];if(words[0]&&words[0].length>=4&&title.length>18)queries.push(words[0]);if(words.length>=2&&words.slice(0,2).join(" ")!==title)queries.push(words.slice(0,2).join(" "));
  const settled=await Promise.allSettled([...new Set(queries)].slice(0,4).map(q=>googleBooks(q)));const candidates:LookupBook[]=[];for(const r of settled)if(r.status==="fulfilled")candidates.push(...r.value);
  if(isbn){const exact=candidates.find(item=>compactIsbn(item.isbn)===compactIsbn(isbn));if(exact)return {item:exact,score:1};}
  const target=filenameGuess(rawFileName).title;let best:LookupBook|null=null;let bestScore=0;
  for(const item of candidates){const score=Math.max(titleSimilarity(item.title,title),titleSimilarity(item.title,target));if(score>bestScore){best=item;bestScore=score;}}
  return bestScore>=.62?{item:best!,score:bestScore}:null;
}

export async function identifyBookFromUpload(fileName:string,mimeType:string,bytes:Uint8Array):Promise<IdentifiedBook>{
  const guess=filenameGuess(fileName);const isEpub=mimeType==="application/epub+zip"||fileName.toLowerCase().endsWith(".epub");const embedded=isEpub?await epubMetadata(bytes):await pdfMetadata(bytes);
  let title=embedded?.title?.trim()||guess.title;let author=embedded?.author?.trim()||guess.author;let description=embedded?.description||null;let year=embedded?.year||null;let pages=embedded?.pages||null;let language=embedded?.language||null;let isbn=embedded?.isbn||null;let subjects=embedded?.subjects||[];
  const usedContent=Boolean(embedded&&"usedContent" in embedded&&embedded.usedContent);\n  let confidence:IdentifiedBook["confidence"]=embedded?.title?(usedContent?"content":"metadata"):"filename";
  const lookup=await lookupBest(title,fileName,isbn);
  if(lookup){const found=lookup.item;if(!embedded?.title||lookup.score>=.82){title=found.title||title;confidence="lookup";}if((!author||genericAuthor(author))&&found.author)author=found.author;if(!description&&found.description)description=found.description;if(!year&&found.year)year=found.year;if(!pages&&found.pages)pages=found.pages;if(!language&&found.language)language=found.language;if(!isbn&&found.isbn)isbn=found.isbn;subjects=Array.from(new Set([...subjects,...found.categories])).slice(0,24);}
  return {title:title||"Livro enviado pelo Telegram",author:author||"Autor não informado",description,year,pages,language,isbn,subjects,confidence};
}
