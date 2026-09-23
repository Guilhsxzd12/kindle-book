create table if not exists public.book_field_review_jobs (
  book_id uuid not null references public.books(id) on delete cascade,
  field text not null check (field in ('cover','author','category','title','description','language')),
  status text not null default 'pending' check (status in ('pending','processing','completed','error','unavailable')),
  attempts integer not null default 0,
  detected_value text,
  detection_source text,
  changes jsonb not null default '{}'::jsonb,
  error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (book_id, field)
);

create index if not exists book_field_review_jobs_field_status_idx
  on public.book_field_review_jobs(field,status,queued_at);
create index if not exists book_field_review_jobs_updated_idx
  on public.book_field_review_jobs(updated_at desc);

alter table public.book_field_review_jobs enable row level security;

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

  insert into public.book_field_review_jobs(
    book_id,field,status,attempts,detected_value,detection_source,changes,error,
    queued_at,started_at,completed_at,updated_at
  )
  select b.id,review_field,
         case when coalesce(b.kindle_drive_file_id,b.reading_pdf_drive_file_id,b.drive_file_id) is null then 'unavailable' else 'pending' end,
         0,null,null,'{}'::jsonb,null,now(),null,null,now()
    from public.books b
  on conflict (book_id,field) do update
    set status=excluded.status,
        attempts=0,
        detected_value=null,
        detection_source=null,
        changes='{}'::jsonb,
        error=null,
        queued_at=now(),
        started_at=null,
        completed_at=null,
        updated_at=now();

  get diagnostics queued = row_count;
  return queued;
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
         error=coalesce(error,'') || case when error is null or error='' then '' else ' | ' end || 'Reenfileirado após processamento interrompido.'
   where j.status='processing'
     and j.started_at < now() - interval '20 minutes'
     and (requested_field is null or j.field=requested_field);

  select j.book_id,j.field into claimed_book,claimed_field
    from public.book_field_review_jobs j
   where j.status='pending'
     and (requested_field is null or j.field=requested_field)
   order by j.attempts asc,j.queued_at asc
   for update skip locked
   limit 1;

  if claimed_book is null then return; end if;

  update public.book_field_review_jobs
     set status='processing',attempts=attempts+1,started_at=now(),completed_at=null,error=null,updated_at=now()
   where public.book_field_review_jobs.book_id=claimed_book
     and public.book_field_review_jobs.field=claimed_field;

  return query select claimed_book,claimed_field;
end;
$$;

revoke all on function public.queue_books_for_field_review(text) from public, anon, authenticated;
grant execute on function public.queue_books_for_field_review(text) to service_role;
revoke all on function public.claim_next_book_field_review_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_book_field_review_job(text) to service_role;

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
    select net.http_get(
      url := 'https://www.estantevirtual.shop/api/cron/book-field-review?limit=3',
      timeout_milliseconds := 300000
    );
  $cron$
);
