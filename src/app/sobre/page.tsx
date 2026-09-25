import Link from "next/link";

export const metadata = {
  title: "Sobre | LeituraVerso",
  description: "Informações sobre a LeituraVerso e seu uso do Google Drive."
};

export default function AboutPage() {
  return (
    <main style={{maxWidth:900,margin:"0 auto",padding:"48px 24px",fontFamily:"system-ui, sans-serif",lineHeight:1.65}}>
      <h1>LeituraVerso</h1>
      <p>
        A LeituraVerso é uma biblioteca digital privada para organização e distribuição de livros digitais.
        Usuários autorizados podem pesquisar o acervo, salvar favoritos e baixar arquivos nos formatos disponíveis.
      </p>
      <p>
        O Google Drive é utilizado somente para armazenar e recuperar os arquivos de livros enviados pelo administrador.
        O acesso ao Drive é solicitado por OAuth e os arquivos permanecem privados.
      </p>
      <h2>Privacidade e termos</h2>
      <p>
        <Link href="/politica-de-privacidade">Política de Privacidade</Link>
        {" · "}
        <Link href="/termos-de-servico">Termos de Serviço</Link>
      </p>
      <p><Link href="/login">Entrar na LeituraVerso</Link></p>
    </main>
  );
}
