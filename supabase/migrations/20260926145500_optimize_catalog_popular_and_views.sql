-- Optimize catalog popularity/view ranking for large catalogs.
-- Avoids one COUNT subquery per book by pre-aggregating event tables once.

create or replace function public.catalog_search(
 p_search text default '', p_category text default '', p_author text default '',
 p_page integer default 1, p_size integer default 20, p_sort text default 'title'
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with recursive category_scope as (
 select id from public.categories where slug = p_category
 union
 select c.id from public.categories c join category_scope s on c.parent_id=s.id
),
favorite_counts as materialized (
 select f.book_id, count(*)::bigint as score
 from public.favorites f
 where p_sort='popular'
 group by f.book_id
),
view_counts as materialized (
 select v.book_id, count(*)::bigint as score
 from public.book_view_events v
 where p_sort='views'
 group by v.book_id
),
matched as materialized (
 select
   b.id,b.title,b.slug,b.author,b.description,b.language,b.category_id,b.year,b.pages,
   b.cover_url,b.published,b.created_at,b.updated_at,
   jsonb_build_object('name',c.name) as categories,
   case
     when p_sort='popular' then coalesce(fc.score,0)
     when p_sort='views' then coalesce(vc.score,0)
     else 0
   end as score
 from public.books b
 left join public.categories c on c.id=b.category_id
 left join favorite_counts fc on fc.book_id=b.id
 left join view_counts vc on vc.book_id=b.id
 where b.published
 and (
   btrim(p_search)=''
   or strpos(lower(public.unaccent(b.title)),lower(public.unaccent(btrim(p_search))))>0
   or strpos(lower(public.unaccent(coalesce(b.author,''))),lower(public.unaccent(btrim(p_search))))>0
 )
 and (
   btrim(p_author)=''
   or lower(public.unaccent(btrim(b.author)))=lower(public.unaccent(btrim(p_author)))
 )
 and (
   p_category=''
   or b.category_id in (select id from category_scope)
   or exists(
     select 1
     from public.book_categories bc
     where bc.book_id=b.id
       and bc.category_id in(select id from category_scope)
   )
 )
),
totals as (
 select count(*) as total from matched
),
bounds as (
 select
   total,
   greatest(
     1,
     least(
       greatest(1,coalesce(p_page,1)),
       ceil(total::numeric/greatest(1,least(coalesce(p_size,20),100)))::integer
     )
   ) as page,
   greatest(1,least(coalesce(p_size,20),100)) as size
 from totals
),
page_rows as (
 select m.*
 from matched m
 order by
   score desc,
   case when p_sort='title' then lower(public.unaccent(title)) end asc,
   created_at desc,
   id
 limit (select size from bounds)
 offset (select (page-1)*size from bounds)
)
select jsonb_build_object(
  'total',total,
  'page',page,
  'books',coalesce((select jsonb_agg(to_jsonb(r)-'score') from page_rows r),'[]'::jsonb)
)
from bounds
$function$;

revoke all on function public.catalog_search(text,text,text,integer,integer,text) from public,anon;
grant execute on function public.catalog_search(text,text,text,integer,integer,text) to authenticated,service_role;
