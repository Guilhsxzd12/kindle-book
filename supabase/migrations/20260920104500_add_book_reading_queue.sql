create table if not exists public.book_reading_jobs (
  book_id uuid primary key references public.books(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','error','unavailable')),
  attempts integer not null default 0,
  source_file_id text,
  source_file_name text,
  source_format text,
  detected_title text,
  detected_author text,
  detected_isbn text,
  detected_category_id uuid references public.categories(id) on delete set null,
  detected_category_name text,
  confidence text,
  changes jsonb not null default '{}'::jsonb,
  error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists book_reading_jobs_status_idx on public.book_reading_jobs(status, queued_at);
create index if not exists book_reading_jobs_updated_idx on public.book_reading_jobs(updated_at desc);
alter table public.book_reading_jobs enable row level security;

create or replace function public.queue_book_for_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare has_file boolean;
begin
  has_file := coalesce(new.kindle_drive_file_id, new.reading_pdf_drive_file_id, new.drive_file_id) is not null;
  insert into public.book_reading_jobs(book_id,status,attempts,error,queued_at,started_at,completed_at,updated_at)
  values (new.id,case when has_file then 'pending' else 'unavailable' end,0,null,now(),null,null,now())
  on conflict (book_id) do update
    set status=case when has_file then 'pending' else 'unavailable' end,
        attempts=0,error=null,queued_at=now(),started_at=null,completed_at=null,updated_at=now();
  return new;
end;
$$;

drop trigger if exists books_queue_reading_on_insert on public.books;
create trigger books_queue_reading_on_insert
after insert on public.books for each row execute function public.queue_book_for_reading();

drop trigger if exists books_queue_reading_on_file_change on public.books;
create trigger books_queue_reading_on_file_change
after update of drive_file_id, kindle_drive_file_id, reading_pdf_drive_file_id, file_name, kindle_file_name, reading_pdf_file_name on public.books
for each row
when (
  old.drive_file_id is distinct from new.drive_file_id
  or old.kindle_drive_file_id is distinct from new.kindle_drive_file_id
  or old.reading_pdf_drive_file_id is distinct from new.reading_pdf_drive_file_id
  or old.file_name is distinct from new.file_name
  or old.kindle_file_name is distinct from new.kindle_file_name
  or old.reading_pdf_file_name is distinct from new.reading_pdf_file_name
)
execute function public.queue_book_for_reading();

insert into public.book_reading_jobs(book_id,status,queued_at,updated_at)
select b.id,
       case when coalesce(b.kindle_drive_file_id,b.reading_pdf_drive_file_id,b.drive_file_id) is null then 'unavailable' else 'pending' end,
       now(),now()
from public.books b
on conflict (book_id) do nothing;

create or replace function public.claim_next_book_reading_job()
returns table(book_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare claimed uuid;
begin
  update public.book_reading_jobs j
     set status='pending',started_at=null,updated_at=now(),
         error=coalesce(error,'') || case when error is null or error='' then '' else ' | ' end || 'Reenfileirado após processamento interrompido.'
   where j.status='processing' and j.started_at < now() - interval '20 minutes';

  select j.book_id into claimed
    from public.book_reading_jobs j
   where j.status='pending'
   order by j.attempts asc,j.queued_at asc
   for update skip locked
   limit 1;

  if claimed is null then return; end if;

  update public.book_reading_jobs
     set status='processing',attempts=attempts+1,started_at=now(),completed_at=null,error=null,updated_at=now()
   where public.book_reading_jobs.book_id=claimed;

  return query select claimed;
end;
$$;

revoke all on function public.claim_next_book_reading_job() from public, anon, authenticated;
grant execute on function public.claim_next_book_reading_job() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='book-reading-worker' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'book-reading-worker',
  '* * * * *',
  $cron$
    select net.http_get(
      url := 'https://www.estantevirtual.shop/api/cron/book-reading?limit=3',
      timeout_milliseconds := 300000
    );
  $cron$
);
