-- Modo temporário para gravação: oculta do catálogo livros sem capa
-- ou com título sinalizado/obviamente corrompido, sem alterar published nem o contador total.
create table if not exists public.catalog_display_settings (
  key text primary key,
  hide_problem_books boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.catalog_display_settings enable row level security;
revoke all on table public.catalog_display_settings from anon, authenticated;
grant select on table public.catalog_display_settings to anon, authenticated;
grant all on table public.catalog_display_settings to service_role;

drop policy if exists catalog_display_settings_read on public.catalog_display_settings;
create policy catalog_display_settings_read
on public.catalog_display_settings for select
to anon, authenticated
using (true);

insert into public.catalog_display_settings(key,hide_problem_books,updated_at)
values ('recording_mode',true,now())
on conflict (key) do update
set hide_problem_books=excluded.hide_problem_books,updated_at=excluded.updated_at;

create or replace function public.catalog_recording_mode_enabled()
returns boolean
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    (select s.hide_problem_books from public.catalog_display_settings s where s.key='recording_mode'),
    false
  );
$function$;

create or replace function public.catalog_book_displayable(
  p_cover_url text,
  p_title text,
  p_needs_correction boolean
)
returns boolean
language sql
stable
set search_path to ''
as $function$
  select case
    when not public.catalog_recording_mode_enabled() then true
    else
      nullif(btrim(coalesce(p_cover_url,'')),'') is not null
      and not coalesce(p_needs_correction,false)
      and nullif(btrim(coalesce(p_title,'')),'') is not null
      and lower(btrim(coalesce(p_title,''))) !~ '^(sem titulo|sem título|livro enviado|livro sem titulo|livro sem título|unknown|arquivo|ebook|pdf)(\b|$)'
      and coalesce(p_title,'') !~* '(z[-_ ]?lib|1lib|canal\s*@|@[^ ]+|\.(pdf|epub)\s*$|^[\[\{\(]|^\d{1,3}[ _-]+\d{1,3}[ _-]+)'
  end;
$function$;

grant execute on function public.catalog_recording_mode_enabled() to anon,authenticated,service_role;
grant execute on function public.catalog_book_displayable(text,text,boolean) to anon,authenticated,service_role;

create or replace function public.catalog_search(
  p_search text default ''::text,p_category text default ''::text,p_author text default ''::text,
  p_page integer default 1,p_size integer default 20,p_sort text default 'title'::text
)
returns jsonb language sql stable set search_path to '' as $function$
with recursive selected_category as (
  select id,parent_id,name,slug from public.categories where slug=p_category
),
normal_scope as (
  select id from selected_category
  union
  select c.id from public.categories c join normal_scope s on c.parent_id=s.id
),
other_parent_scope as (
  select parent_id as id from selected_category where parent_id is not null and lower(name)='outros'
  union
  select c.id from public.categories c join other_parent_scope s on c.parent_id=s.id
),
real_child_roots as (
  select c.id from public.categories c join selected_category s on c.parent_id=s.parent_id
  where s.parent_id is not null and lower(s.name)='outros' and c.id<>s.id and lower(c.name)<>'outros'
),
real_child_scope as (
  select id from real_child_roots
  union
  select c.id from public.categories c join real_child_scope s on c.parent_id=s.id
),
params as (
  select lower(public.catalog_immutable_unaccent(btrim(coalesce(p_search,'')))) as q,
         lower(public.catalog_immutable_unaccent(btrim(coalesce(p_author,'')))) as author_q
),
matched as materialized (
  select b.id,b.title,b.slug,b.author,b.description,b.language,b.category_id,b.year,b.pages,
         b.cover_url,b.published,b.created_at,b.updated_at,
         jsonb_build_object('name',c.name) as categories,
         case
           when p_sort='popular' then (select count(*) from public.favorites f where f.book_id=b.id)
           when p_sort='views' then (select count(*) from public.book_view_events v where v.book_id=b.id)
           else 0
         end as score
  from public.books b
  left join public.categories c on c.id=b.category_id
  cross join params p
  where b.published
    and public.catalog_book_displayable(b.cover_url,b.title,b.needs_correction)
    and (p.q='' or lower(public.catalog_immutable_unaccent(b.title)) like '%'||p.q||'%'
      or lower(public.catalog_immutable_unaccent(coalesce(b.author,''))) like '%'||p.q||'%')
    and (p.author_q='' or lower(public.catalog_immutable_unaccent(btrim(b.author)))=p.author_q)
    and (
      btrim(coalesce(p_category,''))=''
      or (
        exists (select 1 from selected_category s where not (s.parent_id is not null and lower(s.name)='outros'))
        and (
          b.category_id in (select id from normal_scope)
          or exists (select 1 from public.book_categories bc where bc.book_id=b.id and bc.category_id in (select id from normal_scope))
        )
      )
      or (
        exists (select 1 from selected_category s where s.parent_id is not null and lower(s.name)='outros')
        and (
          b.category_id in (select id from other_parent_scope)
          or exists (select 1 from public.book_categories bc where bc.book_id=b.id and bc.category_id in (select id from other_parent_scope))
        )
        and not (
          b.category_id in (select id from real_child_scope)
          or exists (select 1 from public.book_categories bc where bc.book_id=b.id and bc.category_id in (select id from real_child_scope))
        )
      )
    )
),
totals as (select count(*) as total from matched),
bounds as (
  select total,
         greatest(1,least(greatest(1,coalesce(p_page,1)),ceil(total::numeric/greatest(1,least(coalesce(p_size,20),100)))::integer)) as page,
         greatest(1,least(coalesce(p_size,20),100)) as size
  from totals
),
page_rows as (
  select m.* from matched m
  order by score desc,
           case when p_sort='title' then lower(public.catalog_immutable_unaccent(title)) end asc,
           created_at desc,id
  limit (select size from bounds)
  offset (select (page-1)*size from bounds)
)
select jsonb_build_object(
  'total',total,'page',page,
  'books',coalesce((select jsonb_agg(to_jsonb(r)-'score') from page_rows r),'[]'::jsonb)
) from bounds;
$function$;

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
  select s.shelf_id,b.id as book_id
  from public.books b join category_scope s on s.category_id=b.category_id
  where b.published and public.catalog_book_displayable(b.cover_url,b.title,b.needs_correction)
  union
  select s.shelf_id,bc.book_id
  from public.book_categories bc
  join category_scope s on s.category_id=bc.category_id
  join public.books b on b.id=bc.book_id
   and b.published and public.catalog_book_displayable(b.cover_url,b.title,b.needs_correction)
), ranked as (
  select m.shelf_id,b.id,b.title,b.slug,b.author,b.description,b.language,b.category_id,b.year,b.pages,
         b.cover_url,b.published,b.created_at,b.updated_at,
         jsonb_build_object('name',pc.name) as categories,
         row_number() over(partition by m.shelf_id
           order by (b.cover_url is null),b.created_at desc,lower(public.catalog_immutable_unaccent(b.title)),b.id) as rn
  from membership m join public.books b on b.id=m.book_id
  left join public.categories pc on pc.id=b.category_id
), grouped as (
  select shelf_id,jsonb_agg(to_jsonb(r)-'shelf_id'-'rn' order by rn) as books
  from ranked r where rn<=greatest(1,least(coalesce(p_size,12),30)) group by shelf_id
)
select coalesce(jsonb_object_agg(shelf_id::text,books),'{}'::jsonb) from grouped;
$function$;

create or replace function public.catalog_authors()
returns jsonb language sql stable set search_path to '' as $function$
  with authors as (
    select btrim(author) as author,count(*)::int as books
    from public.books
    where published
      and public.catalog_book_displayable(cover_url,title,needs_correction)
      and public.catalog_author_is_valid(author)
    group by btrim(author)
  )
  select coalesce(jsonb_agg(author order by books desc,lower(public.catalog_immutable_unaccent(author))),'[]'::jsonb)
  from authors;
$function$;
