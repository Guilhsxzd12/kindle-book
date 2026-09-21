-- Classificador V2: reduz falsos positivos usando assuntos/descrição para gêneros ambíguos.
create or replace function private.classify_book_category_slug_v2(
  p_title text,p_description text,p_subjects text[],p_author text default ''
)
returns text language plpgsql stable set search_path='' as $$
declare
  title_hay text := lower(public.catalog_immutable_unaccent(coalesce(p_title,'')));
  description_hay text := lower(public.catalog_immutable_unaccent(coalesce(p_description,'')));
  subject_hay text := lower(public.catalog_immutable_unaccent(coalesce(array_to_string(p_subjects,' '),'')));
  author_hay text := lower(public.catalog_immutable_unaccent(coalesce(p_author,'')));
  hay text := title_hay || ' ' || description_hay || ' ' || subject_hay;
begin
  if hay ~ '(^|[^a-z])(manga|mangas|shonen|shoujo|shojo|seinen)([^a-z]|$)' then return 'manga'; end if;
  if hay ~ '(super[- ]?heroi|superhero|marvel|dc comics|batman|superman|homem aranha|spider[- ]?man|vingadores|avengers)' then return 'super-herois'; end if;
  if hay ~ '(graphic novel|historia em quadrinhos|quadrinhos|comic book|comics|banda desenhada|gibi|classicos disney|disney especial|almanaque disney|tio patinhas|pato donald|donald duck|mickey|ze carioca)' then return 'graphic-novel'; end if;
  if hay ~ '(dark romance|romance dark|mafia romance|bully romance|stalker romance)' then return 'dark-romance'; end if;
  if hay ~ '(romantic comedy|rom[- ]?com|comedia romantica)' then return 'comedia-romantica'; end if;
  if hay ~ '(sports romance|sport romance|romance esportivo|hockey romance)' or (subject_hay ~ '(romance|love stories|romantic)' and hay ~ '(hockey|basquete|basketball|futebol|soccer|football player|atleta)') then return 'romance-esportivo'; end if;
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
  if hay ~ '(terra[- ]?media|middle earth|beleriand|isengard)' or author_hay ~ '(j[ .]*r[ .]*r[ .]*tolkien|sarah j[ .]*maas)' then return 'fantasia'; end if;
  if subject_hay ~ '(vampire|vampiro)' or description_hay ~ '(vampiro|vampire)' then return 'vampiros'; end if;
  if subject_hay ~ '(zombie|zumbi)' or description_hay ~ '(zumbi|zombie)' then return 'zumbis'; end if;
  if subject_hay ~ '(gothic horror|gothic fiction|gotico)' then return 'gotico'; end if;
  if subject_hay ~ '(psychological horror|horror psicologico|terror psicologico)' then return 'horror-psicologico'; end if;
  if subject_hay ~ '(supernatural horror|terror sobrenatural|horror sobrenatural)' or description_hay ~ '(assombracao|haunted house)' then return 'terror-sobrenatural'; end if;
  if subject_hay ~ '(psychological thriller|thriller psicologico)' or description_hay ~ '(psychological thriller|thriller psicologico)' then return 'thriller-psicologico'; end if;
  if subject_hay ~ '(detective|detetive|police procedural|policial|crime fiction)' or description_hay ~ '(detetive|investigacao criminal|police procedural)' or author_hay ~ '(agatha christie)' then return 'policial-e-detetive'; end if;
  if subject_hay ~ '(^|[^a-z])(mystery|misterio)([^a-z]|$)' then return 'misterio'; end if;
  if subject_hay ~ '(suspense|thriller)' or description_hay ~ '(suspense|thriller)' then return 'suspense'; end if;
  if subject_hay ~ '(dystopia|dystopian|distopia)' or description_hay ~ '(sociedade distopica|mundo distopico)' then return 'distopia'; end if;
  if subject_hay ~ '(space opera)' then return 'space-opera'; end if;
  if subject_hay ~ '(cyberpunk)' then return 'cyberpunk'; end if;
  if subject_hay ~ '(young adult)' then return 'young-adult'; end if;
  if subject_hay ~ '(juvenile fiction|literatura juvenil|ficcao juvenil)' then return 'juvenil'; end if;
  if subject_hay ~ '(children''s literature|children fiction|literatura infantil)' then return 'infantil'; end if;
  if hay ~ '(self[- ]?help|autoajuda|desenvolvimento pessoal|habitos|produtividade|motivacao)' then return 'autoajuda-e-desenvolvimento-pessoal'; end if;
  if hay ~ '(biograph|biografia|memoir|memorias|autobiograf)' then return 'biografias-e-memorias'; end if;
  if subject_hay ~ '(true crime|crime real)' then return 'crime-real'; end if;
  if subject_hay ~ '(business|negocios|finance|financas|economia|investimento)' or title_hay ~ '(empreendedor|investimento|financas|economia)' then return 'negocios-e-financas'; end if;
  if subject_hay ~ '(psychology|psicologia|behavioral)' or hay ~ '(neurociencia|comportamento humano)' or author_hay ~ '(daniel goleman)' then return 'psicologia-e-comportamento'; end if;
  if subject_hay ~ '(health|saude|wellness|nutricao|fitness|medicina)' then return 'saude-e-bem-estar'; end if;
  if subject_hay ~ '(science|ciencia|technology|tecnologia|computer science)' or hay ~ '(inteligencia artificial|computacao quantica|programacao|machine learning)' then return 'ciencia-e-tecnologia'; end if;
  if subject_hay ~ '(education|educacao|reference|referencia)' or title_hay ~ '(dicionario|manual de )' then return 'educacao-e-referencia'; end if;
  if subject_hay ~ '(art history|arte e cultura|musicologia|cinema|fotografia)' then return 'arte-e-cultura'; end if;
  if subject_hay ~ '(cookbook|culinaria|gastronomia)' or title_hay ~ '(receitas|cozinha)' then return 'culinaria-e-gastronomia'; end if;
  if subject_hay ~ '(philosophy|filosofia)' then return 'filosofia'; end if;
  if subject_hay ~ '(politics|politica|law|direito|juridico)' then return 'politica-e-direito'; end if;
  if subject_hay ~ '(sports|esportes|futebol|soccer|basketball|tenis)' then return 'esportes'; end if;
  if subject_hay ~ '(travel|viagem|turismo|travel guide)' then return 'viagem-e-turismo'; end if;
  if subject_hay ~ '(^|[^a-z])(history|historia|social science|society|sociologia|anthropology|antropologia)([^a-z]|$)' then return 'historia-e-sociedade'; end if;
  if subject_hay ~ '(poesia brasileira)' then return 'poesia-brasileira'; end if;
  if subject_hay ~ '(brazilian short stories|contos brasileiros)' then return 'contos-brasileiros'; end if;
  if subject_hay ~ '(brazilian romance|romance brasileiro)' then return 'romance-brasileiro'; end if;
  if subject_hay ~ '(brazilian literature|literatura brasileira|brazilian fiction)' then return 'literatura-brasileira'; end if;
  if subject_hay ~ '(short stories|contos)' then return 'contos'; end if;
  if subject_hay ~ '(cronicas)' then return 'cronicas'; end if;
  if subject_hay ~ '(contemporary poetry|poesia contemporanea)' then return 'poesia-contemporanea'; end if;
  if subject_hay ~ '(classical poetry|poesia classica)' then return 'poesia-classica'; end if;
  if subject_hay ~ '(^|[^a-z])(poetry|poesia|poems|poemas)([^a-z]|$)' then return 'poesia'; end if;
  if subject_hay ~ '(classic literature|literary classics|classics|classicos)' then return 'classicos'; end if;
  if subject_hay ~ '(christian|cristian|biblical|evangelho)' or title_hay ~ '(biblia|evangelho)' then return 'cristianismo'; end if;
  if subject_hay ~ '(theology|teologia)' then return 'teologia'; end if;
  if subject_hay ~ '(spirituality|espiritualidade|budismo|hinduismo)' then return 'espiritualidade'; end if;
  if subject_hay ~ '(religion|religiao|religious)' then return 'religiao-e-espiritualidade'; end if;
  if subject_hay ~ '(satire|satira)' then return 'satira'; end if;
  if subject_hay ~ '(comedy|comedia|humor)' then return 'comedia'; end if;
  if subject_hay ~ '(family drama|drama familiar)' then return 'drama-familiar'; end if;
  if subject_hay ~ '(historical drama|drama historico)' then return 'drama-historico'; end if;
  if subject_hay ~ '(science fiction|ficcao cientifica|sci[- ]?fi)' then return 'ficcao-cientifica-e-distopia'; end if;
  if subject_hay ~ '(horror|terror)' then return 'terror'; end if;
  if subject_hay ~ '(fantasy|fantasia)' or description_hay ~ '(feiticeir|mundo magico|reino magico|poderes magicos)' then return 'fantasia'; end if;
  if subject_hay ~ '(romance|love stories|romantic fiction)' or description_hay ~ '(se apaixona|se apaixonam|romance entre|relacionamento amoroso)' then return 'romance'; end if;
  if subject_hay ~ '(adventure|aventura|action|acao|spy fiction|espionagem|survival)' then return 'acao-e-aventura'; end if;
  if subject_hay ~ '(^|[^a-z])(drama)([^a-z]|$)' then return 'drama'; end if;
  if subject_hay ~ '(^|[^a-z])(fiction|ficcao|novel|literature|literatura)([^a-z]|$)' then return 'ficcao'; end if;
  return null;
end;
$$;

revoke all on function private.classify_book_category_slug_v2(text,text,text[],text) from public,anon,authenticated;
grant execute on function private.classify_book_category_slug_v2(text,text,text[],text) to service_role;

-- Se a V1 fez uma classificação que a V2 já não considera segura, volta à categoria anterior.
with latest_audit as (
  select distinct on (a.book_id) a.book_id,a.old_category_id,a.new_category_id,a.reason,a.reviewed_at
  from private.catalog_category_review_audit a
  where a.reason in ('automatic-safe-fill','automatic-specific-refinement')
  order by a.book_id,a.reviewed_at desc
), recalc as (
  select a.*,b.category_id as current_category_id,
         private.classify_book_category_slug_v2(b.title,coalesce(nullif(b.description,''),k.description,''),k.subjects,b.author) as target_slug
  from latest_audit a
  join public.books b on b.id=a.book_id
  left join public.book_knowledge k on k.id=b.knowledge_id
  where b.category_id=a.new_category_id
), resolved as (
  select r.*,t.id as target_id,t.parent_id as target_parent
  from recalc r left join public.categories t on t.slug=r.target_slug
), desired as (
  select *,case
    when target_id is null then old_category_id
    when old_category_id is null then target_id
    when target_parent=old_category_id then target_id
    else old_category_id end as desired_category_id
  from resolved
), changes as (
  select * from desired where desired_category_id is distinct from current_category_id
)
update public.books b set category_id=c.desired_category_id,updated_at=now()
from changes c where b.id=c.book_id and b.category_id=c.current_category_id;
