create or replace function public.queue_all_books_for_language_review()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare queued integer := 0;
begin
  update public.book_reading_jobs j
     set status='pending',
         mode='language',
         attempts=0,
         error=null,
         queued_at=now(),
         started_at=null,
         completed_at=null,
         updated_at=now()
   where j.status in ('completed','error')
     and exists (
       select 1 from public.books b
        where b.id=j.book_id
          and coalesce(b.kindle_drive_file_id,b.reading_pdf_drive_file_id,b.drive_file_id) is not null
     );
  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.queue_all_books_for_language_review() from public, anon, authenticated;
grant execute on function public.queue_all_books_for_language_review() to service_role;
