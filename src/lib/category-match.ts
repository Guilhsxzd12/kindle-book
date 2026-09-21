import type { Category } from "@/lib/types";

function norm(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function has(hay:string,...terms:string[]){return terms.some(term=>hay.includes(norm(term)));}

export function guessCategoryId(categories:Category[],subjects:string[]=[],title="",description="",author=""){
  const subjectHay=norm(subjects.join(" | "));
  const titleHay=norm(title);
  const descriptionHay=norm(description);
  const authorHay=norm(author);
  const hay=`${subjectHay} | ${titleHay} | ${descriptionHay}`;
  const pick=(slug:string)=>categories.find(c=>c.slug===slug)?.id||null;

  // Marcadores inequívocos.
  if(has(hay,"manga","mangá","shonen","shoujo","shojo","seinen"))return pick("manga");
  if(has(hay,"superhero","super hero","super-heroi","super-herói","marvel","dc comics","batman","superman","homem aranha","spider-man","vingadores","avengers"))return pick("super-herois");
  if(has(hay,"graphic novel","historia em quadrinhos","história em quadrinhos","quadrinhos","comic book","comics","banda desenhada","gibi","classicos disney","clássicos disney","disney especial","almanaque disney","tio patinhas","pato donald","donald duck","mickey","ze carioca","zé carioca"))return pick("graphic-novel");

  // Romance específico.
  if(has(hay,"dark romance","romance dark","mafia romance","bully romance","stalker romance"))return pick("dark-romance");
  if(has(hay,"romantic comedy","rom-com","romcom","comedia romantica","comédia romântica"))return pick("comedia-romantica");
  if(has(hay,"sports romance","sport romance","romance esportivo","hockey romance")||
     (has(subjectHay,"romance","love stories","romantic")&&has(hay,"hockey","basquete","basketball","futebol","soccer","football player","atleta")))return pick("romance-esportivo");
  if(has(hay,"lgbtq","lgbt","queer","sapphic","sáfic","lesbian romance","gay romance","romance gay","romance lesbico","romance lésbico","romance lesbica","romance lésbica"))return pick("romance-lgbtqia");
  if(has(hay,"paranormal romance","romance paranormal","vampire romance","werewolf romance","romance de vampiro","romance de lobisomem"))return pick("romance-paranormal");
  if(has(hay,"new adult"))return pick("new-adult");
  if(has(hay,"regency","regencia","regência","vitoriano","victorian romance","romance de epoca","romance de época"))return pick("romance-de-epoca");
  if(has(hay,"historical romance","romance historico","romance histórico"))return pick("romance-historico");
  if(has(hay,"contemporary romance","romance contemporaneo","romance contemporâneo"))return pick("romance-contemporaneo");

  // Fantasia específica.
  if(has(hay,"romantasy","romantasia","fantasy romance","romantic fantasy"))return pick("romantasia");
  if(has(hay,"dark fantasy","fantasia sombria"))return pick("fantasia-sombria");
  if(has(hay,"mythology","mitologia","mythological","lendas","folklore","folclore"))return pick("mitologia-e-lendas");
  if(has(hay,"fae","faerie","fairy","feeric","feerico","feérico","fadas"))return pick("fae-e-feericos");
  if(has(hay,"dragon","dragao","dragão","dragoes","dragões"))return pick("dragoes");
  if(has(hay,"epic fantasy","fantasia epica","fantasia épica"))return pick("fantasia-epica");
  if(has(hay,"urban fantasy","fantasia urbana"))return pick("fantasia-urbana");
  if(has(hay,"high fantasy","alta fantasia"))return pick("alta-fantasia");
  if(has(hay,"terra-media","terra média","middle earth","beleriand","isengard")||has(authorHay,"j. r. r. tolkien","j r r tolkien","sarah j. maas","sarah j maas"))return pick("fantasia");

  // Terror.
  if(has(subjectHay,"vampire","vampiro")||has(descriptionHay,"vampiro","vampire"))return pick("vampiros");
  if(has(subjectHay,"zombie","zumbi")||has(descriptionHay,"zumbi","zombie"))return pick("zumbis");
  if(has(subjectHay,"gothic horror","gothic fiction","gotico","gótico"))return pick("gotico");
  if(has(subjectHay,"psychological horror","horror psicologico","horror psicológico","terror psicologico","terror psicológico"))return pick("horror-psicologico");
  if(has(subjectHay,"supernatural horror","terror sobrenatural","horror sobrenatural")||has(descriptionHay,"assombracao","assombração","haunted house"))return pick("terror-sobrenatural");

  // Mistério e suspense: não usa a palavra "mistério" do título sozinha.
  if(has(subjectHay,"psychological thriller","thriller psicologico","thriller psicológico")||has(descriptionHay,"psychological thriller","thriller psicologico","thriller psicológico"))return pick("thriller-psicologico");
  if(has(subjectHay,"detective","detetive","police procedural","policial","crime fiction")||has(descriptionHay,"detetive","investigacao criminal","investigação criminal","police procedural")||has(authorHay,"agatha christie"))return pick("policial-e-detetive");
  if(has(subjectHay,"mystery","misterio","mistério"))return pick("misterio");
  if(has(subjectHay,"suspense","thriller")||has(descriptionHay,"suspense","thriller"))return pick("suspense");

  // Ficção científica.
  if(has(subjectHay,"dystopia","dystopian","distopia")||has(descriptionHay,"sociedade distopica","sociedade distópica","mundo distopico","mundo distópico"))return pick("distopia");
  if(has(subjectHay,"space opera"))return pick("space-opera");
  if(has(subjectHay,"cyberpunk"))return pick("cyberpunk");

  // Faixa etária.
  if(has(subjectHay,"young adult"))return pick("young-adult");
  if(has(subjectHay,"juvenile fiction","literatura juvenil","ficcao juvenil","ficção juvenil"))return pick("juvenil");
  if(has(subjectHay,"children's literature","children fiction","literatura infantil"))return pick("infantil");

  // Não ficção.
  if(has(hay,"self-help","self help","autoajuda","desenvolvimento pessoal","habitos","hábitos","produtividade","motivacao","motivação"))return pick("autoajuda-e-desenvolvimento-pessoal");
  if(has(hay,"biograph","biografia","memoir","memorias","memórias","autobiograf"))return pick("biografias-e-memorias");
  if(has(subjectHay,"true crime","crime real"))return pick("crime-real");
  if(has(subjectHay,"business","negocios","negócios","finance","financas","finanças","economia","investimento")||has(titleHay,"empreendedor","investimento","financas","finanças","economia"))return pick("negocios-e-financas");
  if(has(subjectHay,"psychology","psicologia","behavioral")||has(hay,"neurociencia","neurociência","comportamento humano")||has(authorHay,"daniel goleman"))return pick("psicologia-e-comportamento");
  if(has(subjectHay,"health","saude","saúde","wellness","nutricao","nutrição","fitness","medicina"))return pick("saude-e-bem-estar");
  if(has(subjectHay,"science","ciencia","ciência","technology","tecnologia","computer science")||has(hay,"inteligencia artificial","inteligência artificial","computacao quantica","computação quântica","programacao","programação","machine learning"))return pick("ciencia-e-tecnologia");
  if(has(subjectHay,"education","educacao","educação","reference","referencia","referência")||has(titleHay,"dicionario","dicionário","manual de "))return pick("educacao-e-referencia");
  if(has(subjectHay,"art history","arte e cultura","musicologia","cinema","fotografia"))return pick("arte-e-cultura");
  if(has(subjectHay,"cookbook","culinaria","culinária","gastronomia")||has(titleHay,"receitas","cozinha"))return pick("culinaria-e-gastronomia");
  if(has(subjectHay,"philosophy","filosofia"))return pick("filosofia");
  if(has(subjectHay,"politics","politica","política","law","direito","juridico","jurídico"))return pick("politica-e-direito");
  if(has(subjectHay,"sports","esportes","futebol","soccer","basketball","tenis","tênis"))return pick("esportes");
  if(has(subjectHay,"travel","viagem","turismo","travel guide"))return pick("viagem-e-turismo");
  if(has(subjectHay,"history","historia","história","social science","society","sociologia","anthropology","antropologia"))return pick("historia-e-sociedade");

  // Literatura.
  if(has(subjectHay,"poesia brasileira"))return pick("poesia-brasileira");
  if(has(subjectHay,"brazilian short stories","contos brasileiros"))return pick("contos-brasileiros");
  if(has(subjectHay,"brazilian romance","romance brasileiro"))return pick("romance-brasileiro");
  if(has(subjectHay,"brazilian literature","literatura brasileira","brazilian fiction"))return pick("literatura-brasileira");
  if(has(subjectHay,"short stories","contos"))return pick("contos");
  if(has(subjectHay,"cronicas","crônicas"))return pick("cronicas");
  if(has(subjectHay,"contemporary poetry","poesia contemporanea","poesia contemporânea"))return pick("poesia-contemporanea");
  if(has(subjectHay,"classical poetry","poesia classica","poesia clássica"))return pick("poesia-classica");
  if(has(subjectHay,"poetry","poesia","poems","poemas"))return pick("poesia");
  if(has(subjectHay,"classic literature","literary classics","classics","classicos","clássicos"))return pick("classicos");

  // Religião, humor e drama.
  if(has(subjectHay,"christian","cristian","biblical","evangelho")||has(titleHay,"biblia","bíblia","evangelho"))return pick("cristianismo");
  if(has(subjectHay,"theology","teologia"))return pick("teologia");
  if(has(subjectHay,"spirituality","espiritualidade","budismo","hinduismo"))return pick("espiritualidade");
  if(has(subjectHay,"religion","religiao","religião","religious"))return pick("religiao-e-espiritualidade");
  if(has(subjectHay,"satire","satira","sátira"))return pick("satira");
  if(has(subjectHay,"comedy","comedia","comédia","humor"))return pick("comedia");
  if(has(subjectHay,"family drama","drama familiar"))return pick("drama-familiar");
  if(has(subjectHay,"historical drama","drama historico","drama histórico"))return pick("drama-historico");

  // Categorias amplas: só com sinais confiáveis.
  if(has(subjectHay,"science fiction","ficcao cientifica","ficção científica","sci-fi"))return pick("ficcao-cientifica-e-distopia");
  if(has(subjectHay,"horror","terror"))return pick("terror");
  if(has(subjectHay,"fantasy","fantasia")||has(descriptionHay,"feiticeir","mundo magico","mundo mágico","reino magico","reino mágico","poderes magicos","poderes mágicos"))return pick("fantasia");
  if(has(subjectHay,"romance","love stories","romantic fiction")||has(descriptionHay,"se apaixona","se apaixonam","romance entre","relacionamento amoroso"))return pick("romance");
  if(has(subjectHay,"adventure","aventura","action","acao","ação","spy fiction","espionagem","survival"))return pick("acao-e-aventura");
  if(has(subjectHay,"drama"))return pick("drama");
  if(has(subjectHay,"fiction","ficcao","ficção","novel","literature","literatura"))return pick("ficcao");
  return null;
}
