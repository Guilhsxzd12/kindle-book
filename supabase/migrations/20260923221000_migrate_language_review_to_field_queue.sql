insert into public.book_field_review_jobs(
  book_id,field,status,attempts,detected_value,detection_source,changes,error,
  queued_at,started_at,completed_at,updated_at
)
select j.book_id,'language',
       case when j.status='processing' then 'pending' else j.status end,
       j.attempts,
       j.detected_language,
       j.confidence,
       coalesce(j.changes,'{}'::jsonb),
       j.error,
       j.queued_at,
       case when j.status='processing' then null else j.started_at end,
       j.completed_at,
       j.updated_at
  from public.book_reading_jobs j
 where j.mode='language'
on conflict (book_id,field) do update
  set status=excluded.status,
      attempts=excluded.attempts,
      detected_value=excluded.detected_value,
      detection_source=excluded.detection_source,
      changes=excluded.changes,
      error=excluded.error,
      queued_at=excluded.queued_at,
      started_at=excluded.started_at,
      completed_at=excluded.completed_at,
      updated_at=excluded.updated_at;

update public.book_reading_jobs
   set status='completed',
       started_at=null,
       completed_at=coalesce(completed_at,now()),
       updated_at=now()
 where mode='language'
   and status in ('pending','processing','error');
