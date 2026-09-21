-- Classificação segura do catálogo e melhor ordenação da tela inicial.
-- A função abaixo é mantida no banco para auditorias/reclassificações em lote.
create or replace function private.classify_book_category_slug(p_title text,p_description text,p_subjects text[])
returns text language plpgsql stable set search_path='' as $$
declare
  title_hay text := lower(public.catalog_immutable_unaccent(coalesce(p_title,'')));
  description_hay text := lower(public.catalog_immutable_unaccent(coalesce(p_description,'')));
  subject_hay text := lower(public.catalog_immutable_unaccent(coalesce(array_to_string(p_subjects,' '),'')));
  hay text := title_hay || ' ' || description_hay || ' ' || subject_hay;
begin
  if hay ~ '(^|[^a-z])(manga|mangas|shonen|shoujo|shojo|seinen)([^a-z]|$)' then return 'manga'; end if;
  if hay ~ '(super[- ]?heroi|superhero|marvel|dc comics|batman|superman|homem aranha|spider[- ]?man|vingadores|avengers)' then return 'super-herois'; end if;
  if hay ~ '(graphic novel|historia em quadrinhos|quadrinhos|comic book|comics|banda desenhada|gibi|classicos disney|almanaque disney|tio patinhas|pato donald|donald duck|mickey|ze carioca)' then return 'graphic-novel'; end if;
  if hay ~ '(dark romance|romance dark|mafia romance|bully romance|stalker romance)' then return 'dark-romance'; end if;
  if hay ~ '(romantic comedy|rom[- ]?com|comedia romantica)' then return 'comedia-romantica'; end if;
  if hay ~ '(sports romance|sport romance|romance esportivo|hockey romance)' then return 'romance-esportivo'; end if;
  if hay ~ '(lgbtq|lgbt|queer|sapphic|safic|lesbian romance|gay romance|romance gay|romance lesbico|romance lesbica)' then return 'romance-lgbtqia'; end if;
  if hay ~ '(paranormal romance|romance paranormal|vampire romance|werewolf romance)' then return 'romance-paranormal'; end if;
  if hay ~ '(new adult)' then return 'new-adult'; end if;
  if hay ~ '(regency|regencia|vitoriano|victorian romance|romance de epoca)' then return 'romance-de-epoca'; end if;
  if hay ~ '(historical romance|romance historico)' then return 'romance-historico'; end if;
  if hay ~ '(contemporary romance|romance contemporaneo)' then return 'romance-contemporaneo'; end if;
  if hay ~ '(romantasy|romantasia|fantasy romance|romantic fantasy)' then return 'romantasia'; end if;
  if hay ~ '(dark fantasy|fantasia sombria)' then return 'fantasia-sombria'; end if;
  if hay ~ '(mythology|mitologia|mythological|lendas|folklore|folclore)' then return 'mitologia-e-lendas'; end if;
  if hay ~ '(^|[^a-z])(fae|faerie|fairy|feeric|feerico|fadas)([^a-z]|$)' then return 'fae-e-feericos'; end if;
  if hay ~ '(dragon|dragao|dragoes)' then return 'dragoes'; end if;
  if hay ~ '(epic fantasy|fantasia epica)' then return 'fantasia-epica'; end if;
  if hay ~ '(urban fantasy|fantasia urbana)' then return 'fantasia-urbana'; end if;
  if hay ~ '(high fantasy|alta fantasia)' then return 'alta-fantasia'; end if;
  if hay ~ '(terra[- ]?media|middle earth|tolkien|beleriand|isengard)' then return 'fantasia'; end if;
  if hay ~ '(vampire|vampiro|vampiros)' then return 'vampiros'; end if;
  if hay ~ '(zombie|zumbi|zumbis)' then return 'zumbis'; end if;
  if hay ~ '(gothic horror|gothic fiction|gotico|gotica)' then return 'gotico'; end if;
  if hay ~ '(psychological horror|horror psicologico|terror psicologico)' then return 'horror-psicologico'; end if;
  if hay ~ '(supernatural horror|terror sobrenatural|horror sobrenatural|assombracao|haunted house)' then return 'terror-sobrenatural'; end if;
  if hay ~ '(psychological thriller|thriller psicologico)' then return 'thriller-psicologico'; end if;
  if hay ~ '(detective|detetive|police procedural|policial|investigacao criminal|crime fiction)' then return 'policial-e-detetive'; end if;
  if hay ~ '(^|[^a-z])(mystery|misterio)([^a-z]|$)' then return 'misterio'; end if;
  if hay ~ '(suspense|thriller)' then return 'suspense'; end if;
  if hay ~ '(dystopia|dystopian|distopia|distopico)' then return 'distopia'; end if;
  if hay ~ '(space opera)' then return 'space-opera'; end if;
  if hay ~ '(cyberpunk)' then return 'cyberpunk'; end if;
  if hay ~ '(young adult|literatura ya|ficcao ya)' then return 'young-adult'; end if;
  if hay ~ '(juvenile fiction|literatura juvenil|ficcao juvenil|adolescente)' then return 'juvenil'; end if;
  if hay ~ '(children''s literature|children fiction|literatura infantil|livro infantil|conto infantil)' then return 'infantil'; end if;
  if hay ~ '(self[- ]?help|autoajuda|desenvolvimento pessoal|habitos|produtividade|motivacao)' then return 'autoajuda-e-desenvolvimento-pessoal'; end if;
  if hay ~ '(biograph|biografia|memoir|memorias|autobiograf)' then return 'biografias-e-memorias'; end if;
  if hay ~ '(true crime|crime real)' then return 'crime-real'; end if;
  if hay ~ '(business|negocios|empreendedor|financas|finance|economia|investimento)' then return 'negocios-e-financas'; end if;
  if hay ~ '(psychology|psicologia|comportamento humano|behavioral)' then return 'psicologia-e-comportamento'; end if;
  if hay ~ '(health|saude|bem[- ]?estar|wellness|nutricao|fitness|medicina)' then return 'saude-e-bem-estar'; end if;
  if hay ~ '(science|ciencia|technology|tecnologia|computacao|computer science|inteligencia artificial)' then return 'ciencia-e-tecnologia'; end if;
  if hay ~ '(education|educacao|didatico|didatica|reference|referencia|manual|dicionario)' then return 'educacao-e-referencia'; end if;
  if hay ~ '(art history|historia da arte|arte e cultura|musicologia|cinema|fotografia)' then return 'arte-e-cultura'; end if;
  if hay ~ '(cookbook|culinaria|gastronomia|receitas|cozinha)' then return 'culinaria-e-gastronomia'; end if;
  if hay ~ '(philosophy|filosofia|filosofico)' then return 'filosofia'; end if;
  if hay ~ '(politics|politica|direito|law|juridico|juridica)' then return 'politica-e-direito'; end if;
  if hay ~ '(sports|esportes|futebol|soccer|basquete|basketball|tenis|olimpiada)' then return 'esportes'; end if;
  if hay ~ '(travel|viagem|turismo|travel guide|guia de viagem)' then return 'viagem-e-turismo'; end if;
  if subject_hay ~ '(^|[^a-z])(history|historia|social science|society|sociologia|anthropology|antropologia)([^a-z]|$)' or hay ~ '(historia do brasil|historia mundial|world history|historia politica|historia social)' then return 'historia-e-sociedade'; end if;
  if hay ~ '(poesia brasileira|poesia do brasil)' then return 'poesia-brasileira'; end if;
  if hay ~ '(brazilian short stories|contos brasileiros)' then return 'contos-brasileiros'; end if;
  if hay ~ '(brazilian romance|romance brasileiro)' then return 'romance-brasileiro'; end if;
  if hay ~ '(brazilian literature|literatura brasileira|brazilian fiction)' then return 'literatura-brasileira'; end if;
  if hay ~ '(short stories|contos|conto literario)' then return 'contos'; end if;
  if hay ~ '(cronicas|cronica literaria)' then return 'cronicas'; end if;
  if hay ~ '(contemporary poetry|poesia contemporanea)' then return 'poesia-contemporanea'; end if;
  if hay ~ '(classical poetry|poesia classica)' then return 'poesia-classica'; end if;
  if hay ~ '(^|[^a-z])(poetry|poesia|poems|poemas)([^a-z]|$)' then return 'poesia'; end if;
  if subject_hay ~ '(classic literature|literary classics|classics|classicos)' or description_hay ~ '(classic literature|classico da literatura)' then return 'classicos'; end if;
  if hay ~ '(christian|cristian|biblia|biblical|evangelho)' then return 'cristianismo'; end if;
  if hay ~ '(theology|teologia)' then return 'teologia'; end if;
  if hay ~ '(spirituality|espiritualidade|meditacao|budismo|hinduismo)' then return 'espiritualidade'; end if;
  if hay ~ '(religion|religiao|religious)' then return 'religiao-e-espiritualidade'; end if;
  if hay ~ '(satire|satira)' then return 'satira'; end if;
  if hay ~ '(comedy|comedia|humor)' then return 'comedia'; end if;
  if hay ~ '(family drama|drama familiar)' then return 'drama-familiar'; end if;
  if hay ~ '(historical drama|drama historico)' then return 'drama-historico'; end if;
  if hay ~ '(science fiction|ficcao cientifica|sci[- ]?fi)' then return 'ficcao-cientifica-e-distopia'; end if;
  if hay ~ '(horror|terror)' then return 'terror'; end if;
  if hay ~ '(fantasy|fantasia|magic|magia|wizard|feiticeir)' then return 'fantasia'; end if;
  if hay ~ '(romance|love stories|romantic|historia de amor)' then return 'romance'; end if;
  if hay ~ '(adventure|aventura|action|acao|spy fiction|espionagem|survival)' then return 'acao-e-aventura'; end if;
  if hay ~ '(drama)' then return 'drama'; end if;
  if subject_hay ~ '(^|[^a-z])(fiction|ficcao|novel|literature|literatura)([^a-z]|$)' then return 'ficcao'; end if;
  return null;
end;
$$;

revoke all on function private.classify_book_category_slug(text,text,text[]) from public,anon,authenticated;
grant execute on function private.classify_book_category_slug(text,text,text[]) to service_role;

with classified as (
  select b.id,b.category_id as old_category_id,c.parent_id as current_parent,
         private.classify_book_category_slug(b.title,coalesce(nullif(b.description,''),k.description,''),k.subjects) as target_slug
  from public.books b
  left join public.book_knowledge k on k.id=b.knowledge_id
  left join public.categories c on c.id=b.category_id
  where b.published
), eligible as (
  select x.id,x.old_category_id,t.id as new_category_id,
         case when x.old_category_id is null then 'automatic-safe-fill' else 'automatic-specific-refinement' end as reason
  from classified x
  join public.categories t on t.slug=x.target_slug
  where x.old_category_id is null
     or (x.old_category_id is not null and x.current_parent is null and t.parent_id=x.old_category_id and t.id<>x.old_category_id)
), audited as (
  insert into private.catalog_category_review_audit(book_id,old_category_id,new_category_id,reason)
  select id,old_category_id,new_category_id,reason from eligible
  returning book_id
)
update public.books b set category_id=e.new_category_id,updated_at=now()
from eligible e where b.id=e.id;

create or replace function public.catalog_shelves(p_parent_slug text default ''::text,p_size integer default 12)
returns jsonb language sql stable set search_path to '' as $function$
with recursive shelf_roots as (
  select c.id as shelf_id,c.id as category_id from public.categories c
  where (btrim(coalesce(p_parent_slug,''))='' and c.parent_id is null)
     or (btrim(coalesce(p_parent_slug,''))<>'' and c.parent_id=(select p.id from public.categories p where p.slug=p_parent_slug))
), category_scope as (
  select shelf_id,category_id from shelf_roots
  union all
  select s.shelf_id,c.id from category_scope s join public.categories c on c.parent_id=s.category_id
), membership as (
  select s.shelf_id,b.id as book_id from public.books b join category_scope s on s.category_id=b.category_id where b.published
  union
  select s.shelf_id,bc.book_id from public.book_categories bc join category_scope s on s.category_id=bc.category_id join public.books b on b.id=bc.book_id and b.published
), ranked as (
  select m.shelf_id,b.id,b.title,b.slug,b.author,b.description,b.language,b.category_id,b.year,b.pages,b.cover_url,b.published,b.created_at,b.updated_at,
         jsonb_build_object('name',pc.name) as categories,
         row_number() over(partition by m.shelf_id order by (b.cover_url is null),b.created_at desc,lower(public.catalog_immutable_unaccent(b.title)),b.id) as rn
  from membership m join public.books b on b.id=m.book_id left join public.categories pc on pc.id=b.category_id
), grouped as (
  select shelf_id,jsonb_agg(to_jsonb(r)-'shelf_id'-'rn' order by rn) as books
  from ranked r where rn<=greatest(1,least(coalesce(p_size,12),30)) group by shelf_id
)
select coalesce(jsonb_object_agg(shelf_id::text,books),'{}'::jsonb) from grouped;
$function$;
