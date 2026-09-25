import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Serviço | LeituraVerso",
  description: "Termos de Serviço da LeituraVerso."
};

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f8fafc", padding: "48px 20px" }}>
      <article style={{ maxWidth: 860, margin: "0 auto", background: "#111827", border: "1px solid #263246", borderRadius: 24, padding: "32px", lineHeight: 1.7 }}>
        <p style={{ color: "#93c5fd", fontWeight: 700, marginTop: 0 }}>LeituraVerso</p>
        <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", lineHeight: 1.1, marginBottom: 12 }}>Termos de Serviço</h1>
        <p style={{ color: "#94a3b8" }}>Última atualização: 2 de setembro de 2026.</p>

        <h2>1. Aceitação</h2>
        <p>Ao acessar ou utilizar a LeituraVerso, o usuário concorda com estes Termos de Serviço e com a Política de Privacidade aplicável.</p>

        <h2>2. Natureza do serviço</h2>
        <p>A LeituraVerso é um serviço privado destinado à organização, catalogação e distribuição de livros digitais por usuários autorizados pelo administrador.</p>

        <h2>3. Contas e acesso</h2>
        <p>O acesso depende de autenticação e liberação pelo administrador. O usuário é responsável por manter seus dados de acesso seguros e por utilizar sua conta apenas de forma autorizada.</p>

        <h2>4. Conteúdo da biblioteca</h2>
        <p>Os livros, capas, descrições e demais informações disponíveis no serviço devem ser utilizados apenas conforme as permissões aplicáveis. O usuário não adquire propriedade sobre qualquer conteúdo ao acessá-lo pela LeituraVerso.</p>

        <h2>5. Google Drive</h2>
        <p>O administrador pode conectar uma conta Google para armazenar e organizar os arquivos da biblioteca no Google Drive. A LeituraVerso utilizará essa autorização somente para as funções necessárias ao gerenciamento e à entrega dos arquivos.</p>

        <h2>6. Uso aceitável</h2>
        <p>Não é permitido tentar burlar controles de acesso, obter dados de outros usuários, explorar vulnerabilidades, utilizar o serviço para fins ilegais ou interferir no funcionamento normal da aplicação.</p>

        <h2>7. Disponibilidade</h2>
        <p>O serviço pode sofrer interrupções temporárias por manutenção, atualizações, falhas de terceiros ou outros fatores técnicos. Não há garantia de disponibilidade ininterrupta.</p>

        <h2>8. Serviços de terceiros</h2>
        <p>A LeituraVerso pode utilizar serviços de terceiros, incluindo hospedagem, autenticação, banco de dados, Google Drive, Google Books, Open Library e Telegram. O funcionamento de determinadas funcionalidades também depende da disponibilidade desses serviços.</p>

        <h2>9. Suspensão ou encerramento</h2>
        <p>O administrador pode restringir ou encerrar o acesso de contas que violem estes termos ou que não devam mais acessar a biblioteca privada.</p>

        <h2>10. Alterações</h2>
        <p>Estes termos podem ser atualizados quando houver mudanças relevantes no serviço. A versão publicada nesta página será considerada a versão vigente.</p>

        <h2>11. Contato</h2>
        <p>Para dúvidas sobre estes termos, utilize o e-mail de suporte informado na tela de consentimento OAuth da LeituraVerso.</p>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #263246", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#93c5fd" }}>Voltar para a Biblioteca</Link>
          <Link href="/politica-de-privacidade" style={{ color: "#93c5fd" }}>Política de Privacidade</Link>
        </div>
      </article>
    </main>
  );
}
