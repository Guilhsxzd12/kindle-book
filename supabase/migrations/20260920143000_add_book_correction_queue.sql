alter table public.books add column if not exists needs_correction boolean not null default false;
alter table public.books add column if not exists correction_reason text;
create index if not exists books_needs_correction_idx on public.books(needs_correction,updated_at desc);

update public.books b
set needs_correction=true,
    correction_reason=trim(both '; ' from concat_ws('; ',
      case when lower(coalesce(b.author,'')) in ('','unknown','autor não informado','autor não identificado','desconhecido') then 'Autor não identificado' end,
      case when b.title is null or btrim(b.title)='' or lower(b.title) ~ '^(sem titulo|livro enviado|livro sem titulo|unknown|arquivo|ebook|pdf)' then 'Título não identificado' end
    )),
    published=false,
    metadata_reviewed=false,
    updated_at=now()
from public.book_reading_jobs j
where j.book_id=b.id
  and j.status in ('completed','error','unavailable')
  and (
    lower(coalesce(b.author,'')) in ('','unknown','autor não informado','autor não identificado','desconhecido')
    or b.title is null or btrim(b.title)='' or lower(b.title) ~ '^(sem titulo|livro enviado|livro sem titulo|unknown|arquivo|ebook|pdf)'
  );