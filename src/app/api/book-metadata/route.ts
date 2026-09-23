import { NextRequest,NextResponse } from "next/server";
import { getApiViewer } from "@/lib/auth";
import type { BookMetadataResult } from "@/lib/types";

function yearFrom(v?:string){
  const m=v?.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m?Number(m[1]):null;
}

function cleanText(v?:string|null){
  if(!v)return null;
  return v
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&aacute;/gi,"á").replace(/&atilde;/gi,"ã").replace(/&acirc;/gi,"â")
    .replace(/&eacute;/gi,"é").replace(/&ecirc;/gi,"ê").replace(/&iacute;/gi,"í")
    .replace(/&oacute;/gi,"ó").replace(/&otilde;/gi,"õ").replace(/&ocirc;/gi,"ô")
    .replace(/&uacute;/gi,"ú").replace(/&ccedil;/gi,"ç")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/\s+/g," ")
    .trim()||null;
}

function norm(v:string){
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function normalizeLanguage(v?:string|null){
  if(!v)return null;
  const x=v.toLowerCase();
  const map:Record<string,string>={por:"pt",ptbr:"pt",pt_br:"pt",eng:"en",spa:"es",fre:"fr",fra:"fr",ita:"it",ger:"de",deu:"de",jpn:"ja",chi:"zh",zho:"zh",rus:"ru"};
  return map[x.replace(/[-]/g,"_")]||x.split(/[-_]/)[0]||null;
}

function compactIsbn(value?:string|null){return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();}
function isIsbn(value:string){return /^(?:\d{9}[\dX]|\d{13})$/i.test(compactIsbn(value));}
function externalFetch(input:string|URL,init:RequestInit={}){return fetch(input,{...init,signal:AbortSignal.timeout(8000)});}

function titleCoverage(itemTitle:string,query:string){
  const t=norm(itemTitle),q=norm(query);if(!q)return 0;if(t===q)return 1;
  const words=q.split(" ").filter(word=>word.length>2);if(!words.length)return t.includes(q)?1:0;
  const hits=words.filter(word=>t.includes(word)).length;return hits/words.length;
}

function score(item:BookMetadataResult,query:string,isbn:string|null){
  const q=norm(query),t=norm(item.title),a=norm(item.author||"");
  let s=0;
  if(isbn&&compactIsbn(item.isbn)===isbn)s+=300;
  if(t===q)s+=150;
  else if(t.startsWith(q))s+=95;
  else if(t.includes(q))s+=70;
  else s+=Math.round(titleCoverage(item.title,query)*45);
  if(a&&a!=="autor nao informado")s+=8;
  if(item.description)s+=16;
  if(item.coverUrl)s+=5;
  if(item.year)s+=2;
  if(item.pages)s+=2;
  if(item.categories?.length)s+=3;
  if(item.isEbook)s+=2;
  if(item.language==="pt")s+=28;
  else if(item.language==="es")s+=5;
  if(item.source==="publisher")s+=22;
  return s;
}

function dedupe(items:BookMetadataResult[],query:string,isbn:string|null){
  const relevant=isbn?items.filter(item=>compactIsbn(item.isbn)===isbn):items.filter(item=>titleCoverage(item.title,query)>=0.58);
  const merged=new Map<string,BookMetadataResult>();
  for(const item of relevant.sort((a,b)=>score(b,query,isbn)-score(a,query,isbn))){
    const key=item.isbn?`isbn:${compactIsbn(item.isbn)}`:`${norm(item.title)}|${norm(item.author)}|${item.language||""}|${item.year||""}`;
    const current=merged.get(key);if(!current){merged.set(key,item);continue;}
    const publisher=item.source==="publisher"?item:current.source==="publisher"?current:null;
    const richerDescription=[current.description,item.description].filter(Boolean).sort((a,b)=>(b?.length||0)-(a?.length||0))[0]||null;
    merged.set(key,{...current,
      source:publisher?.source||current.source,
      title:publisher?.title||current.title,
      author:publisher?.author||current.author,
      language:publisher?.language||current.language||item.language,
      year:publisher?.year||current.year||item.year,
      pages:publisher?.pages||current.pages||item.pages,
      description:publisher?.description||richerDescription,
      coverUrl:publisher?.coverUrl||current.coverUrl||item.coverUrl,
      categories:Array.from(new Set([...(current.categories||[]),...(item.categories||[])])).slice(0,18),
      isEbook:Boolean(current.isEbook||item.isEbook)
    });
  }
  return Array.from(merged.values()).sort((a,b)=>score(b,query,isbn)-score(a,query,isbn)).slice(0,30);
}

async function googleBooks(query:string,{ebooks=false,lang}:{ebooks?:boolean;lang?:string}={}){
  const url=new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q",query);
  url.searchParams.set("printType","books");
  url.searchParams.set("maxResults","40");
  url.searchParams.set("orderBy","relevance");
  if(ebooks)url.searchParams.set("filter","ebooks");
  if(lang)url.searchParams.set("langRestrict",lang);
  const key=process.env.GOOGLE_BOOKS_API_KEY?.trim();if(key)url.searchParams.set("key",key);
  let r=await externalFetch(url,{cache:"no-store"});
  if(!r.ok&&key){url.searchParams.delete("key");r=await externalFetch(url,{cache:"no-store"});}
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();
  return (p.items||[]).map((item:any):BookMetadataResult=>{
    const i=item.volumeInfo||{};
    const isbn=(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_13")?.identifier||(i.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_10")?.identifier||(i.industryIdentifiers||[])[0]?.identifier||null;
    const isEbook=Boolean(ebooks||item.saleInfo?.isEbook||item.accessInfo?.epub?.isAvailable||item.accessInfo?.pdf?.isAvailable);
    return {
      id:`g:${item.id}:${ebooks?"e":"b"}:${lang||"all"}`,
      source:"google-books",
      title:i.title||"Título não informado",
      author:(i.authors||[]).join(", ")||"Autor não informado",
      language:normalizeLanguage(i.language),
      year:yearFrom(i.publishedDate),
      pages:Number.isFinite(i.pageCount)?i.pageCount:null,
      description:cleanText(i.description),
      coverUrl:(i.imageLinks?.extraLarge||i.imageLinks?.large||i.imageLinks?.medium||i.imageLinks?.thumbnail||i.imageLinks?.smallThumbnail||null)?.replace("http://","https://"),
      isbn,
      isEbook,
      categories:Array.isArray(i.categories)?i.categories.slice(0,10):[]
    };
  });
}

async function openLibraryDescription(workKey?:string){
  if(!workKey||!workKey.startsWith("/works/"))return null;
  try{
    const r=await externalFetch(`https://openlibrary.org${workKey}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.7"},cache:"no-store"});if(!r.ok)return null;
    const p=await r.json();const raw=typeof p.description==="string"?p.description:p.description?.value;
    return cleanText(raw);
  }catch{return null;}
}

async function openLibrarySearch(title:string,isbn:string|null,exactTitle=false){
  const url=new URL("https://openlibrary.org/search.json");
  if(isbn)url.searchParams.set("isbn",isbn);
  else if(exactTitle)url.searchParams.set("title",title);
  else url.searchParams.set("q",title);
  url.searchParams.set("limit","35");
  url.searchParams.set("fields","key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,ebook_access,public_scan_b,subject,language");
  const r=await externalFetch(url,{headers:{"User-Agent":"BibliotecaVirtual/1.7"},cache:"no-store"});
  if(!r.ok)return [] as BookMetadataResult[];
  const p=await r.json();const docs=(p.docs||[]) as any[];
  const descriptions=new Map<string,string|null>();
  await Promise.all(docs.slice(0,8).map(async d=>{descriptions.set(d.key,await openLibraryDescription(d.key));}));
  return docs.map((d:any):BookMetadataResult=>({
    id:`o:${d.key}:${d.language?.[0]||""}:${exactTitle?"title":"q"}`,
    source:"open-library",
    title:d.title||title,
    author:(d.author_name||[]).join(", ")||"Autor não informado",
    language:normalizeLanguage(d.language?.includes("por")?"por":d.language?.[0]),
    year:d.first_publish_year||null,
    pages:d.number_of_pages_median||null,
    description:descriptions.get(d.key)||null,
    coverUrl:d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`:null,
    isbn:d.isbn?.find((x:string)=>compactIsbn(x).length===13)||d.isbn?.[0]||null,
    isEbook:Boolean(d.public_scan_b||d.ebook_access&&d.ebook_access!=="no_ebook"),
    categories:Array.isArray(d.subject)?d.subject.slice(0,14):[]
  }));
}

async function openLibraryByIsbn(isbn:string){
  try{
    const editionResponse=await externalFetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.7"},cache:"no-store"});
    if(!editionResponse.ok)return [] as BookMetadataResult[];
    const edition=await editionResponse.json();
    const authors=await Promise.all((edition.authors||[]).slice(0,6).map(async (author:any)=>{
      try{const r=await externalFetch(`https://openlibrary.org${author.key}.json`,{headers:{"User-Agent":"BibliotecaVirtual/1.7"},cache:"no-store"});if(!r.ok)return null;const p=await r.json();return p.name||null;}catch{return null;}
    }));
    const workKey=edition.works?.[0]?.key;const description=await openLibraryDescription(workKey);
    const coverId=edition.covers?.[0];
    const pages=Number(edition.number_of_pages)||null;
    return [{
      id:`oi:${edition.key||isbn}`,
      source:"open-library",
      title:edition.title||"Título não informado",
      author:authors.filter(Boolean).join(", ")||"Autor não informado",
      language:normalizeLanguage(edition.languages?.[0]?.key?.split("/").pop()),
      year:yearFrom(edition.publish_date),
      pages:Number.isFinite(pages)?pages:null,
      description,
      coverUrl:coverId?`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`:null,
      isbn,
      isEbook:false,
      categories:Array.isArray(edition.subjects)?edition.subjects.slice(0,14):[]
    } satisfies BookMetadataResult];
  }catch{return [] as BookMetadataResult[];}
}

async function crossrefBooks(query:string,isbn:string|null){
  try{
    const url=new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic",isbn||query);url.searchParams.set("filter","type:book");url.searchParams.set("rows",isbn?"20":"30");
    const response=await externalFetch(url,{headers:{"User-Agent":"EstanteVirtual/1.0 (mailto:luxstreambr@gmail.com)"},cache:"no-store"});if(!response.ok)return [] as BookMetadataResult[];
    const payload=await response.json();
    return (payload.message?.items||[]).map((item:any,index:number):BookMetadataResult=>{
      const identifiers=(item.ISBN||[]) as string[];const foundIsbn=identifiers.find(value=>compactIsbn(value).length===13)||identifiers[0]||null;
      const authors=(item.author||[]).map((author:any)=>[author.given,author.family].filter(Boolean).join(" ")).filter(Boolean);
      const dateParts=item.published?.["date-parts"]?.[0]||item.issued?.["date-parts"]?.[0]||[];
      return {id:`c:${item.DOI||index}`,source:"crossref",title:cleanText(item.title?.[0])||query,author:authors.join(", ")||"Autor não informado",language:normalizeLanguage(item.language),year:Number(dateParts[0])||null,pages:null,description:cleanText(item.abstract),coverUrl:null,isbn:foundIsbn,isEbook:false,categories:Array.isArray(item.subject)?item.subject.slice(0,12):[]};
    });
  }catch{return [] as BookMetadataResult[];}
}

function htmlMeta(html:string,key:string){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,"i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,"i")
  ];
  for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return cleanText(match[1]);}
  return null;
}

function encodingPenalty(value:string){
  const replacement=(value.match(/�/g)||[]).length;
  const mojibake=(value.match(/(?:Ã.|Â.|â€|â€™|â€œ|â€�|ðŸ)/g)||[]).length;
  return replacement*100+mojibake*20;
}

async function responseHtml(response:Response){
  const bytes=new Uint8Array(await response.arrayBuffer());
  const declared=response.headers.get("content-type")?.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g,"");
  const encodings=Array.from(new Set([declared,"utf-8","windows-1252","iso-8859-1"].filter(Boolean) as string[]));
  const decoded=encodings.map(encoding=>{try{return new TextDecoder(encoding,{fatal:false}).decode(bytes);}catch{return "";}}).filter(Boolean);
  return decoded.sort((a,b)=>encodingPenalty(a)-encodingPenalty(b))[0]||new TextDecoder("utf-8").decode(bytes);
}

function usefulPublisherDescription(value?:string|null){
  const text=cleanText(value);if(!text||text.length<80)return null;
  const generic=/40 anos de respeito|conhe[cç]a o nosso cat[aá]logo|grupo companhia das letras|livros para todos os leitores/i;
  return generic.test(text)?null:text;
}

function publisherAboutText(plain:string){
  const match=plain.match(/SOBRE O LIVRO\s+([\s\S]{80,5000}?)\s+Ficha T[eé]cnica/i);
  return usefulPublisherDescription(match?.[1]);
}

async function companhiaByIsbn(isbn:string){
  try{
    const response=await externalFetch(`https://www.companhiadasletras.com.br/livro/${encodeURIComponent(isbn)}/`,{headers:{"User-Agent":"Mozilla/5.0 EstanteVirtual/1.0","Accept":"text/html,application/xhtml+xml"},cache:"no-store",redirect:"follow"});
    if(!response.ok)return [] as BookMetadataResult[];
    const html=await responseHtml(response);const plain=cleanText(html)||"";
    const formatted=isbn.replace(/(\d{3})(\d{2})(\d{3})(\d{4})(\d)/,"$1-$2-$3-$4-$5");
    if(!plain.includes(isbn)&&!plain.includes(formatted))return [] as BookMetadataResult[];

    const rawDocumentTitle=cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])||"";
    const ogTitle=htmlMeta(html,"og:title")||"";
    const h1=cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])||"";
    const titleCandidates=[rawDocumentTitle.split(" - ")[0],ogTitle.split(" - ")[0],h1]
      .map(item=>cleanText(item)||"")
      .filter(item=>item.length>1)
      .sort((a,b)=>encodingPenalty(a)-encodingPenalty(b));
    const title=titleCandidates[0]||"";

    const titleParts=rawDocumentTitle.split(" - ").map(part=>cleanText(part)||"").filter(Boolean);
    let author=titleParts.length>=3?titleParts.slice(1,-1).join(" - "):"Autor não informado";
    author=author.replace(/\s+\|\s+Grupo Companhia das Letras.*$/i,"").trim()||"Autor não informado";

    const pagesMatch=plain.match(/P[aá]ginas\s*:?\s*(\d{1,5})/i);
    const launchMatch=plain.match(/Lan[cç]amento\s*:?\s*\d{1,2}\/\d{1,2}\/(\d{4})/i)||plain.match(/Ano(?: de edi[cç][aã]o)?\s*:?\s*(20\d{2}|19\d{2})/i);
    const description=publisherAboutText(plain)||usefulPublisherDescription(htmlMeta(html,"og:description"))||usefulPublisherDescription(htmlMeta(html,"description"));
    const coverUrl=htmlMeta(html,"og:image");
    if(!title||encodingPenalty(title)>=100)return [] as BookMetadataResult[];
    return [{id:`publisher:companhia:${isbn}`,source:"publisher",title,author,language:"pt",year:launchMatch?Number(launchMatch[1]):null,pages:pagesMatch?Number(pagesMatch[1]):null,description,coverUrl,isbn,isEbook:true,categories:[]} satisfies BookMetadataResult];
  }catch{return [] as BookMetadataResult[];}
}

export async function GET(request:NextRequest){
  const viewer=await getApiViewer();
  if(!viewer.user||!viewer.profile||(viewer.profile.role!=="admin"&&!viewer.profile.approved))return NextResponse.json({error:"Acesso negado."},{status:403});

  const title=request.nextUrl.searchParams.get("title")?.trim();
  if(!title||title.length<2)return NextResponse.json({results:[]});

  const compact=compactIsbn(title);
  const isbn=isIsbn(compact)?compact:null;
  const accentless=norm(title).replace(/\s+/g," ");
  const exactQuery=isbn?`isbn:${isbn}`:`intitle:"${title}"`;
  const broadQuery=isbn?`isbn:${isbn}`:title;
  const quotedQuery=isbn?`isbn:${isbn}`:`"${title}"`;
  const accentlessQuery=!isbn&&accentless&&accentless!==norm(title)?`intitle:"${accentless}"`:null;

  const tasks:Promise<BookMetadataResult[]>[]=isbn?[
    googleBooks(exactQuery,{lang:"pt"}),googleBooks(exactQuery),openLibrarySearch(title,isbn,true),openLibraryByIsbn(isbn),companhiaByIsbn(isbn),crossrefBooks(title,isbn)
  ]:[
    googleBooks(exactQuery,{lang:"pt"}),googleBooks(broadQuery,{lang:"pt"}),googleBooks(quotedQuery,{lang:"pt"}),googleBooks(broadQuery,{ebooks:true,lang:"pt"}),googleBooks(exactQuery),googleBooks(broadQuery),openLibrarySearch(title,null,true),openLibrarySearch(title,null,false),crossrefBooks(title,null)
  ];
  if(accentlessQuery)tasks.push(googleBooks(accentlessQuery,{lang:"pt"}),googleBooks(accentlessQuery));

  const settled=await Promise.allSettled(tasks);
  const all:BookMetadataResult[]=[];
  for(const item of settled)if(item.status==="fulfilled")all.push(...item.value);
  return NextResponse.json({results:dedupe(all,title,isbn)});
}
