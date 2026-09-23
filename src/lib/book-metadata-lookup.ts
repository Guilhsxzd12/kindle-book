import "server-only";

export type AutomaticBookMetadata={
  title:string;
  author:string;
  coverUrl:string|null;
  description:string|null;
  year:number|null;
  pages:number|null;
  language:string|null;
  isbn:string|null;
  categories:string[];
  source:"google-books"|"open-library";
  score:number;
};

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function compactIsbn(value?:string|null){return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();}
function normalizeLanguage(value?:string|null){if(!value)return null;const v=value.toLowerCase();const map:Record<string,string>={por:"pt",ptbr:"pt",pt_br:"pt",eng:"en",spa:"es",fre:"fr",fra:"fr",ita:"it",ger:"de",deu:"de",jpn:"ja",chi:"zh",zho:"zh",rus:"ru"};return map[v.replace(/-/g,"_")]||v.split(/[-_]/)[0]||null;}
function yearFrom(value?:string|null){const m=value?.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);return m?Number(m[1]):null;}
function inferLanguageFromText(value?:string|null){
  const words=norm(value||"").split(" ").filter(Boolean);if(!words.length)return null;
  const sets:Record<string,Set<string>>={
    pt:new Set(["o","a","os","as","da","do","das","dos","de","e","em","para","com","uma","um","que","como","nao","voce","livro","pessoas","mente","mentes","maneira"]),
    en:new Set(["the","an","of","and","to","in","for","with","from","your","you","how","why","what","language","library","introduction","guide","handbook","psychology","business","science","history","world","life","love","book","digging","mindfulness"]),
    es:new Set(["el","la","los","las","del","y","en","para","con","una","un","que","camino","cuerpo","emociones","relajacion","respiracion","eleccion","claves","despertar"]),
    fr:new Set(["le","la","les","des","du","et","pour","avec","une","un","livre","amour","vie","monde"])
  };
  const scores:Record<string,number>={pt:0,en:0,es:0,fr:0};
  for(const w of words)for(const lang of Object.keys(scores))if(sets[lang].has(w))scores[lang]+=(['the','and','of','del','el','los','las','nao','voce'].includes(w)?4:2);
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  return ranked[0][1]>=4&&ranked[0][1]-ranked[1][1]>=2?ranked[0][0]:null;
}
function genericAuthor(value?:string|null){const v=norm(value||"");return !v||v==="autor nao informado"||v==="autor nao identificado"||v==="desconhecido"||v==="unknown";}

function levenshtein(a:string,b:string){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i);const cur=new Array<number>(b.length+1);
  for(let i=1;i<=a.length;i++){cur[0]=i;for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=cur[j];}
  return prev[b.length];
}
function similarity(a:string,b:string){
  const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;
  const longest=Math.max(x.length,y.length);let score=1-levenshtein(x,y)/longest;
  if(x.startsWith(y+" ")||y.startsWith(x+" "))score=Math.max(score,0.94);
  else if(x.includes(y)||y.includes(x))score=Math.max(score,Math.min(x.length,y.length)/longest+0.16);
  const xWords=new Set(x.split(" ").filter(w=>w.length>2));const yWords=[...new Set(y.split(" ").filter(w=>w.length>2))];
  if(yWords.length){const hits=yWords.filter(w=>xWords.has(w)).length;score=Math.max(score,hits/yWords.length*0.9);}
  return Math.max(0,Math.min(1,score));
}
function cleanTitleHint(value:string){
  return value
    .replace(/\.(pdf|epub)$/i,"")
    .replace(/\b(?:z[-_ ]?lib(?:rary)?|1lib|zlibrary|z library|biblioteca virtual)\b/gi," ")
    .replace(/\b(?:canal\s*)?@[a-z0-9_.-]+\b/gi," ")
    .replace(/\b(?:19|20)\d{2}\b/g," ")
    .replace(/\s+--\s+.+$/," ")
    .replace(/\s+by\s+[A-ZÀ-Ý].+$/i," ")
    .replace(/[_]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function scoreCandidate(item:AutomaticBookMetadata,titleHint:string,authorHint:string,isbn:string|null){
  if(isbn&&compactIsbn(item.isbn)===isbn)return 1000;
  const titleScore=similarity(item.title,titleHint);
  if(titleScore<0.54)return -1;
  let score=titleScore*100;
  if(!genericAuthor(authorHint)&&!genericAuthor(item.author)){const authorScore=similarity(item.author,authorHint);score+=authorScore*32;if(authorScore<0.25&&titleScore<0.82)score-=30;}
  if(item.coverUrl)score+=12;
  if(item.description)score+=4;
  if(!genericAuthor(item.author))score+=10;
  const inferred=inferLanguageFromText(titleHint);if(inferred&&item.language===inferred)score+=7;else if(inferred&&item.language&&item.language!==inferred)score-=5;
  if(item.isbn)score+=2;
  if(item.categories.length)score+=2;
  return score;
}

async function googleBooks(query:string){
  try{
    const url=new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q",query);url.searchParams.set("printType","books");url.searchParams.set("maxResults","40");url.searchParams.set("orderBy","relevance");
    const key=process.env.GOOGLE_BOOKS_API_KEY?.trim();if(key)url.searchParams.set("key",key);
    let response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000)});
    if(!response.ok&&key){url.searchParams.delete("key");response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000)});}
    if(!response.ok)return [] as AutomaticBookMetadata[];
    const payload=await response.json();
    return (payload.items||[]).map((item:any):AutomaticBookMetadata=>{
      const v=item.volumeInfo||{};const isbn=(v.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_13")?.identifier||(v.industryIdentifiers||[]).find((x:any)=>x.type==="ISBN_10")?.identifier||null;
      return {title:String(v.title||"").trim(),author:Array.isArray(v.authors)&&v.authors.length?v.authors.join(", "):"Autor não informado",coverUrl:(v.imageLinks?.extraLarge||v.imageLinks?.large||v.imageLinks?.medium||v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail||null)?.replace("http://","https://")||null,description:typeof v.description==="string"?v.description.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()||null:null,year:yearFrom(v.publishedDate),pages:Number.isFinite(v.pageCount)?Number(v.pageCount):null,language:normalizeLanguage(v.language),isbn:compactIsbn(isbn)||null,categories:Array.isArray(v.categories)?v.categories.slice(0,18):[],source:"google-books",score:0};
    }).filter((item:AutomaticBookMetadata)=>item.title);
  }catch{return [] as AutomaticBookMetadata[];}
}

async function openLibrary(title:string,isbn:string|null){
  try{
    const url=new URL("https://openlibrary.org/search.json");
    if(isbn)url.searchParams.set("isbn",isbn);else url.searchParams.set("title",title);
    url.searchParams.set("limit","30");
    url.searchParams.set("fields","title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,subject,language");
    const response=await fetch(url,{headers:{"User-Agent":"EstanteVirtual/2.0"},cache:"no-store",signal:AbortSignal.timeout(7000)});if(!response.ok)return [] as AutomaticBookMetadata[];
    const payload=await response.json();
    return (payload.docs||[]).map((d:any):AutomaticBookMetadata=>({title:String(d.title||"").trim(),author:Array.isArray(d.author_name)&&d.author_name.length?d.author_name.join(", "):"Autor não informado",coverUrl:d.cover_i?"https://covers.openlibrary.org/b/id/"+d.cover_i+"-L.jpg":null,description:null,year:Number(d.first_publish_year)||null,pages:Number(d.number_of_pages_median)||null,language:(()=>{const langs=Array.isArray(d.language)?d.language.map((x:string)=>normalizeLanguage(x)).filter(Boolean):[];const inferred=inferLanguageFromText(title);return inferred&&langs.includes(inferred)?inferred:(langs[0]||null);})(),isbn:Array.isArray(d.isbn)?(d.isbn.find((x:string)=>compactIsbn(x).length===13)||d.isbn[0]||null):null,categories:Array.isArray(d.subject)?d.subject.slice(0,18):[],source:"open-library",score:0})).filter((item:AutomaticBookMetadata)=>item.title);
  }catch{return [] as AutomaticBookMetadata[];}
}

export async function lookupBookMetadata(input:{title:string;author?:string|null;isbn?:string|null}){
  const titleHint=cleanTitleHint(input.title);if(titleHint.length<2)return null;
  const authorHint=String(input.author||"").trim();const isbn=compactIsbn(input.isbn)||null;
  const queries:string[]=[];
  if(isbn)queries.push("isbn:"+isbn);
  if(!genericAuthor(authorHint))queries.push('intitle:"'+titleHint+'" inauthor:"'+authorHint+'"');
  queries.push('intitle:"'+titleHint+'"',titleHint);
  const unique=[...new Set(queries)].slice(0,4);
  const tasks:Promise<AutomaticBookMetadata[]>[]=[...unique.map(q=>googleBooks(q)),openLibrary(titleHint,isbn)];
  const settled=await Promise.allSettled(tasks);const all:AutomaticBookMetadata[]=[];
  for(const result of settled)if(result.status==="fulfilled")all.push(...result.value);
  let best:AutomaticBookMetadata|null=null;let bestScore=-1;
  for(const item of all){const candidateScore=scoreCandidate(item,titleHint,authorHint,isbn);if(candidateScore>bestScore){bestScore=candidateScore;best={...item,score:candidateScore};}}
  if(!best)return null;
  if(isbn&&compactIsbn(best.isbn)===isbn)return best;
  const minScore=genericAuthor(authorHint)?72:76;
  return bestScore>=minScore?best:null;
}