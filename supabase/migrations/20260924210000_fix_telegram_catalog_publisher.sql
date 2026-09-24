-- Corrige o publicador automático do catálogo do Telegram.
-- Em vez de varrer apenas os 1.000 livros mais antigos, retorna diretamente
-- os livros que ainda possuem algum canal/arquivo pendente.

create or replace function public.telegram_catalog_pending_books(p_limit integer default 5)
returns table(id uuid, title text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with active_channels as (
    select tc.id
    from public.telegram_channels tc
    where tc.active = true
  ),
  candidates as (
    select
      b.id,
      b.title,
      b.created_at,
      case
        when b.mime_type = 'application/epub+zip'
          or lower(coalesce(b.file_name,'')) like '%.epub'
          then b.drive_file_id
        else b.kindle_drive_file_id
      end as epub_id,
      case
        when b.mime_type = 'application/pdf'
          or lower(coalesce(b.file_name,'')) like '%.pdf'
          then b.drive_file_id
        else b.reading_pdf_drive_file_id
      end as pdf_id
    from public.books b
    where b.published = true
      and b.allow_download = true
  )
  select c.id, c.title, c.created_at
  from candidates c
  where (c.epub_id is not null or c.pdf_id is not null)
    and exists (
      select 1
      from active_channels ch
      left join public.telegram_channel_publications p
        on p.book_id = c.id
       and p.channel_id = ch.id
      where p.id is null
         or p.status <> 'sent'
         or (
           p.text_message_id is null
           and (
             (c.epub_id is not null and p.epub_message_id is null)
             or
             (c.pdf_id is not null and p.pdf_message_id is null)
           )
         )
    )
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.telegram_catalog_pending_books(integer) from public, anon, authenticated;
grant execute on function public.telegram_catalog_pending_books(integer) to service_role;

select cron.schedule(
  'kindle-telegram-catalog-publisher',
  '* * * * *',
  $cron$
    select net.http_get(
      url := 'https://www.estantevirtual.shop/api/cron/telegram-catalog?limit=5',
      timeout_milliseconds := 300000
    );
  $cron$
);
