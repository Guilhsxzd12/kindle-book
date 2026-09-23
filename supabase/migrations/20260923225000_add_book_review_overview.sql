create or replace function public.get_book_review_overview()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with per_book as (
    select
      b.id,
      count(*) filter (where j.status='completed')::int as completed_fields,
      count(*) filter (where j.status='pending')::int as pending_fields,
      count(*) filter (where j.status='processing')::int as processing_fields,
      count(*) filter (where j.status='error')::int as error_fields,
      count(*) filter (where j.status='unavailable')::int as unavailable_fields,
      max(j.completed_at) filter (where j.status='completed') as reviewed_at
    from public.books b
    left join public.book_field_review_jobs j on j.book_id=b.id
    group by b.id
  )
  select jsonb_build_object(
    'totalBooks', count(*)::int,
    'fullyReviewed', count(*) filter (where completed_fields=6)::int,
    'partiallyReviewed', count(*) filter (where completed_fields between 1 and 5)::int,
    'notReviewed', count(*) filter (where completed_fields=0)::int,
    'inProgress', count(*) filter (where completed_fields<6 and (pending_fields>0 or processing_fields>0))::int,
    'withErrors', count(*) filter (where error_fields>0)::int,
    'withUnavailable', count(*) filter (where unavailable_fields>0)::int
  )
  from per_book;
$$;

create or replace function public.get_recent_fully_reviewed_books(result_limit integer default 20)
returns table(
  id uuid,
  title text,
  author text,
  slug text,
  cover_url text,
  reviewed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with completed as (
    select
      j.book_id,
      max(j.completed_at) as reviewed_at
    from public.book_field_review_jobs j
    group by j.book_id
    having count(*) filter (where j.status='completed')=6
  )
  select b.id,b.title,b.author,b.slug,b.cover_url,c.reviewed_at
    from completed c
    join public.books b on b.id=c.book_id
   order by c.reviewed_at desc nulls last
   limit greatest(1,least(coalesce(result_limit,20),50));
$$;

revoke all on function public.get_book_review_overview() from public, anon, authenticated;
grant execute on function public.get_book_review_overview() to service_role;
revoke all on function public.get_recent_fully_reviewed_books(integer) from public, anon, authenticated;
grant execute on function public.get_recent_fully_reviewed_books(integer) to service_role;
