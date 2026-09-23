create table if not exists public.book_analysis_jobs (
  book_id uuid primary key references public.books(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','error','unavailable')),
  attempts integer not null default 0,
  source_file_id text,
  source_file_name text,
  source_format text,
  detected_title text,
  detected_author text,
  detected_description text,
  detected_language text,
  detected_language_source text,
  detected_isbn text,
  detected_category_id uuid references public.categories(id) on delete set null,
  detected_category_name text,
  detected_cover_url text,
  detected_cover_source text,
  confidence text,
  subjects jsonb not null default '[]'::jsonb,
  error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists book_analysis_jobs_status_idx on public.book_analysis_jobs(status,queued_at);
create index if not exists book_analysis_jobs_updated_idx on public.book_analysis_jobs(updated_at desc);
alter table public.book_analysis_jobs enable row level security;

create or replace function public.current_book_analysis_source_id(b public.books)
returns text
language sql
immutable
as $$
  select coalesce(
    b.kindle_drive_file_id,
    case when b.mime_type='application/epub+zip' or lower(coalesce(b.file_name,'')) like '%.epub' then b.drive_file_id else null end,
    b.reading_pdf_drive_file_id,
    b.drive_file_id
  );
$$;

create or replace function public.queue_books_for_field_review(review_field text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare queued integer := 0;
begin
  if review_field not in ('cover','author','category','title','description','language') then
    raise exception 'Campo de revisão inválido: %', review_field;
  end if;

  insert into public.book_field_review_jobs(book_id,field,status,attempts,detected_value,detection_source,changes,error,queued_at,started_at,completed_at,updated_at)
  select b.id,review_field,
         case when public.current_book_analysis_source_id(b) is null then 'unavailable' else 'pending' end,
         0,null::text,null::text,'{}'::jsonb,null::text,now(),null::timestamptz,null::timestamptz,now()
    from public.books b
  on conflict (book_id,field) do update
    set status=excluded.status,attempts=0,detected_value=null,detection_source=null,changes='{}'::jsonb,error=null,
        queued_at=now(),started_at=null,completed_at=null,updated_at=now();

  get diagnostics queued = row_count;

  insert into public.book_analysis_jobs(book_id,status,attempts,source_file_id,error,queued_at,started_at,completed_at,updated_at)
  select b.id,'pending',0,public.current_book_analysis_source_id(b),null::text,now(),null::timestamptz,null::timestamptz,now()
    from public.books b
   where public.current_book_analysis_source_id(b) is not null
  on conflict (book_id) do update
    set status=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then 'completed' else 'pending' end,
        attempts=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.attempts else 0 end,
        source_file_id=excluded.source_file_id,
        error=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.error else null end,
        queued_at=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.queued_at else now() end,
        started_at=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.started_at else null end,
        completed_at=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.completed_at else null end,
        updated_at=now();

  return queued;
end;
$$;

create or replace function public.claim_next_book_analysis_job()
returns table(book_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare claimed uuid;
begin
  update public.book_analysis_jobs j
     set status='pending',started_at=null,updated_at=now(),
         error=coalesce(error,'') || case when error is null or error='' then '' else ' | ' end || 'Reenfileirado após análise interrompida.'
   where j.status='processing' and j.started_at < now() - interval '20 minutes';

  select j.book_id into claimed
    from public.book_analysis_jobs j
   where j.status='pending'
   order by j.attempts asc,j.queued_at asc
   for update skip locked
   limit 1;

  if claimed is null then return; end if;

  update public.book_analysis_jobs
     set status='processing',attempts=attempts+1,started_at=now(),completed_at=null,error=null,updated_at=now()
   where public.book_analysis_jobs.book_id=claimed;

  return query select claimed;
end;
$$;

create or replace function public.claim_next_book_field_review_job(requested_field text default null)
returns table(book_id uuid, field text)
language plpgsql
security definer
set search_path = public
as $$
declare claimed_book uuid;
declare claimed_field text;
begin
  update public.book_field_review_jobs j
     set status='pending',started_at=null,updated_at=now(),
         error=coalesce(error,'') || case when error is null or error='' then '' else ' | ' end || 'Reenfileirado após aplicação interrompida.'
   where j.status='processing' and j.started_at < now() - interval '20 minutes'
     and (requested_field is null or j.field=requested_field);

  select j.book_id,j.field into claimed_book,claimed_field
    from public.book_field_review_jobs j
    join public.book_analysis_jobs a on a.book_id=j.book_id and a.status='completed'
   where j.status='pending'
     and (requested_field is null or j.field=requested_field)
   order by j.attempts asc,j.queued_at asc
   for update of j skip locked
   limit 1;

  if claimed_book is null then return; end if;

  update public.book_field_review_jobs
     set status='processing',attempts=attempts+1,started_at=now(),completed_at=null,error=null,updated_at=now()
   where public.book_field_review_jobs.book_id=claimed_book
     and public.book_field_review_jobs.field=claimed_field;

  return query select claimed_book,claimed_field;
end;
$$;

revoke all on function public.claim_next_book_analysis_job() from public, anon, authenticated;
grant execute on function public.claim_next_book_analysis_job() to service_role;
revoke all on function public.queue_books_for_field_review(text) from public, anon, authenticated;
grant execute on function public.queue_books_for_field_review(text) to service_role;
revoke all on function public.claim_next_book_field_review_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_book_field_review_job(text) to service_role;

insert into public.book_analysis_jobs(book_id,status,attempts,source_file_id,error,queued_at,started_at,completed_at,updated_at)
select distinct b.id,'pending',0,public.current_book_analysis_source_id(b),null::text,now(),null::timestamptz,null::timestamptz,now()
  from public.books b
  join public.book_field_review_jobs j on j.book_id=b.id
 where j.status in ('pending','processing')
   and public.current_book_analysis_source_id(b) is not null
on conflict (book_id) do update
  set status=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then 'completed' else 'pending' end,
      source_file_id=excluded.source_file_id,
      attempts=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.attempts else 0 end,
      error=null,
      started_at=null,
      completed_at=case when public.book_analysis_jobs.status='completed' and public.book_analysis_jobs.source_file_id=excluded.source_file_id then public.book_analysis_jobs.completed_at else null end,
      updated_at=now();

update public.book_field_review_jobs set status='pending',started_at=null,updated_at=now() where status='processing';

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='book-analysis-worker' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'book-analysis-worker',
  '* * * * *',
  $cron$
    select net.http_get(url := 'https://www.estantevirtual.shop/api/cron/book-analysis?limit=4',timeout_milliseconds := 300000);
  $cron$
);

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='book-field-review-worker' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'book-field-review-worker',
  '* * * * *',
  $cron$
    select net.http_get(url := 'https://www.estantevirtual.shop/api/cron/book-field-review?limit=12',timeout_milliseconds := 300000);
  $cron$
);
