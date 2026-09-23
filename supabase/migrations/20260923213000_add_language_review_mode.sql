alter table public.book_reading_jobs
  add column if not exists mode text not null default 'full'
    check (mode in ('full','language'));

alter table public.book_reading_jobs
  add column if not exists detected_language text;

create or replace function public.queue_book_for_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare has_file boolean;
begin
  has_file := coalesce(new.kindle_drive_file_id, new.reading_pdf_drive_file_id, new.drive_file_id) is not null;
  insert into public.book_reading_jobs(book_id,status,attempts,error,queued_at,started_at,completed_at,updated_at,mode)
  values (new.id,case when has_file then 'pending' else 'unavailable' end,0,null,now(),null,null,now(),'full')
  on conflict (book_id) do update
    set status=case when has_file then 'pending' else 'unavailable' end,
        attempts=0,error=null,queued_at=now(),started_at=null,completed_at=null,updated_at=now(),mode='full';
  return new;
end;
$$;
