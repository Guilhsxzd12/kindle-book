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
         case when public.current_book_analysis_source_id(b) is null then 'unavailable' else 'pending' end,
         0,null::text,null::text,'{}'::jsonb,null::text,now(),null::timestamptz,null::timestamptz,now()
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

  insert into public.book_analysis_jobs(
    book_id,status,attempts,source_file_id,error,queued_at,started_at,completed_at,updated_at
  )
  select b.id,'pending',0,public.current_book_analysis_source_id(b),null::text,now(),null::timestamptz,null::timestamptz,now()
    from public.books b
   where public.current_book_analysis_source_id(b) is not null
  on conflict (book_id) do update
    set status=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status in ('completed','processing','pending')
          then public.book_analysis_jobs.status
          else 'pending'
        end,
        attempts=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status in ('completed','processing','pending')
          then public.book_analysis_jobs.attempts
          else 0
        end,
        source_file_id=excluded.source_file_id,
        error=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status in ('completed','processing','pending')
          then public.book_analysis_jobs.error
          else null
        end,
        queued_at=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status in ('completed','processing','pending')
          then public.book_analysis_jobs.queued_at
          else now()
        end,
        started_at=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status in ('completed','processing','pending')
          then public.book_analysis_jobs.started_at
          else null
        end,
        completed_at=case
          when public.book_analysis_jobs.source_file_id=excluded.source_file_id
           and public.book_analysis_jobs.status='completed'
          then public.book_analysis_jobs.completed_at
          else null
        end,
        updated_at=now();

  return queued;
end;
$$;

revoke all on function public.queue_books_for_field_review(text) from public, anon, authenticated;
grant execute on function public.queue_books_for_field_review(text) to service_role;
