export const SITE_NAME = "LeituraVerso";
export const SITE_TAGLINE = "Livros em PDF e EPUB para baixar e ler do seu jeito.";
export const INSTAGRAM_USERNAME = "leituraversobr";
export const INSTAGRAM_URL = "https://www.instagram.com/leituraversobr/";
export const ADMIN_TELEGRAM_USERNAME = "leituraversoadm";

export function bookPath(slug: string) {
  return `/livro/${encodeURIComponent(slug)}`;
}
