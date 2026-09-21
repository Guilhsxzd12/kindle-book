import type { Category } from "@/lib/types";

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function has(hay:string,...terms:string[]){return terms.some(term=>hay.includes(norm(term)));}

export function guessCategoryId(categories:Category[],subjects:string[]=[],title="",description=""){
  const subjectHay=norm(subjects.join(" | "));
  const titleHay=norm(title);
  const descriptionHay=norm(description);
  const hay=`${subjectHay} | ${titleHay} | ${descriptionHay}`;
  const find=(slug:string)=>categories.find(c=>c.slug===slug)?.id||null;
  const pick=(slug:string)=>find(slug);

  if(has(hay,"manga","mangá","shonen","shoujo","shojo","seinen"))return pick("manga");
  if(has(hay,"superhero","super hero","super-heroi","super-herói","marvel","dc comics","batman","superman","homem aranha","spider-man","vingadores","avengers"))return pick("super-herois");
  if(has(hay,"graphic novel","historia em quadrinhos","história em quadrinhos","quadrinhos","comic book","comics","banda desenhada","gibi","classicos disney","clássicos disney","almanaque disney","tio patinhas","pato donald","donald duck","mickey","ze carioca","zé carioca"))return pick("graphic-novel");

  if(has(hay,"dark romance","romance dark","mafia romance","bully romance","stalker romance"))return pick("dark-romance");
  if(has(hay,"romantic comedy","rom-com","romcom","comedia romantica","comédia romântica"))return pick("comedia-romantica");
  if(has(hay,"sports romance","sport romance","romance esportivo","hockey romance"))return pick("romance-esportivo");
  if(has(hay,"hockey","basquete","basketball","jogador de futebol","jogadora de futebol","football player","atleta")&&has(descriptionHay,"namoro","casal","paixao","paixão","romantic","love story","se apaixon","relationship"))return pick("romance-esportivo");
  if(has(hay,"lgbtq","lgbt","queer","sapphic","sáfic","lesbian romance","gay romance","romance gay","romance lesbico","romance lésbico","romance lesbica","romance lésbica"))return pick("romance-lgbtqia");
  if(has(hay,"paranormal romance","romance paranormal","vampire romance","werewolf romance","romance de vampiro","romance de lobisomem"))return pick("romance-paranormal");
  if(has(hay,"new adult"))return pick("new-adult");
  if(has(hay,"regency","regencia","regência","vitoriano","victorian romance","romance de epoca","romance de época"))return pick("romance-de-epoca");
  if(has(hay,"historical romance","romance historico","romance histórico"))return pick("romance-historico");
  if(has(hay,"contemporary romance","romance contemporaneo","romance contemporâneo"))return pick("romance-contemporaneo");

  if(has(hay,"romantasy","romantasia","fantasy romance","romantic fantasy"))return pick("romantasia");
  if(has(hay,"dark fantasy","fantasia sombria"))return pick("fantasia-sombria");
  if(has(hay,"mythology","mitologia","mythological","lendas","folklore","folclore"))return pick("mitologia-e-lendas");
  if(has(hay,"fae","faerie","fairy","feeric","feerico","feérico","fadas"))return pick("fae-e-feericos");
  if(has(hay,"dragon","dragao","dragão","dragoes","dragões"))return pick("dragoes");
  if(has(hay,"epic fantasy","fantasia epica","fantasia épica"))return pick("fantasia-epica");
  if(has(hay,"urban fantasy","fantasia urbana"))return pick("fantasia-urbana");
  if(has(hay,"high fantasy","alta fantasia"))return pick("alta-fantasia");
  if(has(hay,"terra-media","terra média","middle earth","tolkien","beleriand","isengard"))return pick("fantasia");

  if(has(hay,"vampire","vampiro","vampiros"))return pick("vampiros");
  if(has(hay,"zombie","zumbi","zumbis"))return pick("zumbis");
  if(has(hay,"gothic horror","gothic fiction","gotico","gótico","gotica","gótica"))return pick("gotico");
  if(has(hay,"psychological horror","horror psicologico","horror psicológico","terror psicologico","terror psicológico"))return pick("horror-psicologico");
  if(has(hay,"supernatural horror","terror sobrenatural","horror sobrenatural","assombracao","assombração","haunted house"))return pick("terror-sobrenatural");

  if(has(hay,"psychological thriller","thriller psicologico","thriller psicológico"))return pick("thriller-psicologico");
  if(has(hay,"detective","detetive","police procedural","policial","investigacao criminal","investigação criminal","crime fiction"))return pick("policial-e-detetive");
  if(has(hay,"mystery","misterio","mistério"))return pick("misterio");
  if(has(hay,"suspense","thriller"))return pick("suspense");

  if(has(hay,"dystopia","dystopian","distopia","distopico","distópico"))return pick("distopia");
  if(has(hay,"space opera"))return pick("space-opera");
  if(has(hay,"cyberpunk"))return pick("cyberpunk");

  if(has(hay,"young adult","literatura ya","ficcao ya","ficção ya"))return pick("young-adult");
  if(has(hay,"juvenile fiction","literatura juvenil","ficcao juvenil","ficção juvenil","adolescente"))return pick("juvenil");
  if(has(hay,"children's literature","children fiction","literatura infantil","livro infantil","conto infantil"))return pick("infantil");

  const directRules:[string,string[]][]=[
    ["autoajuda-e-desenvolvimento-pessoal",["self-help","autoajuda","desenvolvimento pessoal","habitos","hábitos","produtividade","motivacao","motivação"]],
    ["biografias-e-memorias",["biograph","biografia","memoir","memorias","memórias","autobiograf"]],
    ["crime-real",["true crime","crime real"]],
    ["negocios-e-financas",["business","negocios","negócios","empreendedor","financas","finanças","finance","economia","investimento"]],
    ["psicologia-e-comportamento",["psychology","psicologia","comportamento humano","behavioral"]],
    ["saude-e-bem-estar",["health","saude","saúde","bem-estar","wellness","nutricao","nutrição","fitness","medicina"]],
    ["ciencia-e-tecnologia",["science","ciencia","ciência","technology","tecnologia","computacao","computação","computer science","inteligencia artificial","inteligência artificial"]],
    ["educacao-e-referencia",["education","educacao","educação","didatico","didático","didatica","didática","reference","referencia","referência","manual","dicionario","dicionário"]],
    ["arte-e-cultura",["art history","historia da arte","história da arte","arte e cultura","musicologia","cinema","fotografia"]],
    ["culinaria-e-gastronomia",["cookbook","culinaria","culinária","gastronomia","receitas","cozinha"]],
    ["filosofia",["philosophy","filosofia","filosofico","filosófico"]],
    ["politica-e-direito",["politics","politica","política","direito","law","juridico","jurídico","juridica","jurídica"]],
    ["esportes",["sports","esportes","futebol","soccer","basquete","basketball","tenis","tênis","olimpiada","olimpíada"]],
    ["viagem-e-turismo",["travel","viagem","turismo","travel guide","guia de viagem"]]
  ];
  for(const [slug,terms] of directRules)if(has(hay,...terms)){const id=pick(slug);if(id)return id;}
  if(has(subjectHay,"history","historia","história","social science","society","sociologia","anthropology","antropologia")||has(hay,"historia do brasil","história do brasil","historia mundial","história mundial","world history","historia politica","história política","historia social","história social"))return pick("historia-e-sociedade");

  const literaryRules:[string,string[]][]=[
    ["poesia-brasileira",["poesia brasileira","poesia do brasil"]],
    ["contos-brasileiros",["brazilian short stories","contos brasileiros"]],
    ["romance-brasileiro",["brazilian romance","romance brasileiro"]],
    ["literatura-brasileira",["brazilian literature","literatura brasileira","brazilian fiction"]],
    ["contos",["short stories","contos","conto literario","conto literário"]],
    ["cronicas",["cronicas","crônicas","cronica literaria","crônica literária"]],
    ["poesia-contemporanea",["contemporary poetry","poesia contemporanea","poesia contemporânea"]],
    ["poesia-classica",["classical poetry","poesia classica","poesia clássica"]],
    ["poesia",["poetry","poesia","poems","poemas"]]
  ];
  for(const [slug,terms] of literaryRules)if(has(hay,...terms)){const id=pick(slug);if(id)return id;}
  if(has(subjectHay,"classic literature","literary classics","classics","classicos","clássicos")||has(descriptionHay,"classic literature","classico da literatura","clássico da literatura"))return pick("classicos");

  if(has(hay,"christian","cristian","biblia","bíblia","biblical","evangelho"))return pick("cristianismo");
  if(has(hay,"theology","teologia"))return pick("teologia");
  if(has(hay,"spirituality","espiritualidade","meditacao","meditação","budismo","hinduismo"))return pick("espiritualidade");
  if(has(hay,"religion","religiao","religião","religious"))return pick("religiao-e-espiritualidade");
  if(has(hay,"satire","satira","sátira"))return pick("satira");
  if(has(hay,"comedy","comedia","comédia","humor"))return pick("comedia");
  if(has(hay,"family drama","drama familiar"))return pick("drama-familiar");
  if(has(hay,"historical drama","drama historico","drama histórico"))return pick("drama-historico");

  if(has(hay,"science fiction","ficcao cientifica","ficção científica","sci-fi"))return pick("ficcao-cientifica-e-distopia");
  if(has(hay,"horror","terror"))return pick("terror");
  if(has(hay,"fantasy","fantasia","magic","magia","wizard","feiticeir"))return pick("fantasia");
  if(has(hay,"romance","love stories","romantic","historia de amor","história de amor"))return pick("romance");
  if(has(hay,"adventure","aventura","action","acao","ação","spy fiction","espionagem","survival"))return pick("acao-e-aventura");
  if(has(hay,"drama"))return pick("drama");
  if(has(subjectHay,"fiction","ficcao","ficção","novel","literature","literatura"))return pick("ficcao");
  return null;
}
