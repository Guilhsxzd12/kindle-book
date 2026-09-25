export const SITE_NAME = "LeituraVerso";
export const SITE_TAGLINE = "Livros em PDF e EPUB para baixar e ler do seu jeito.";

export function bookPath(slug: string) {
  return `/livro/${encodeURIComponent(slug)}`;
}
