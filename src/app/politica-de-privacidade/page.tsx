import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade | LeituraVerso",
  description: "Política de Privacidade da LeituraVerso."
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f8fafc", padding: "48px 20px" }}>
      <article style={{ maxWidth: 860, margin: "0 auto", background: "#111827", border: "1px solid #263246", borderRadius: 24, padding: "32px", lineHeight: 1.7 }}>
        <p style={{ color: "#93c5fd", fontWeight: 700, marginTop: 0 }}>LeituraVerso</p>
        <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.2rem)", lineHeight: 1.1, marginBottom: 12 }}>Política de Privacidade</h1>
        <p style={{ color: "#94a3b8" }}>Última atualização: 2 de setembro de 2026.</p>

        <h2>1. Sobre esta política</h2>
        <p>A LeituraVerso é um serviço privado de organização e distribuição de livros digitais. Esta política explica quais dados podem ser tratados pelo aplicativo e como eles são utilizados.</p>

        <h2>2. Dados tratados</h2>
        <p>O aplicativo pode tratar dados necessários para autenticação e funcionamento da biblioteca, como nome, endereço de e-mail, identificador da conta, favoritos, progresso de leitura e preferências relacionadas aos livros.</p>

        <h2>3. Google Drive</h2>
        <p>A conta Google conectada pelo administrador pode ser utilizada para localizar a pasta “BIBLIOTECA VIRTUAL”, criar subpastas de organização, enviar arquivos de livros e acessar esses arquivos quando necessário para disponibilizá-los aos usuários autorizados.</p>
        <p>O acesso ao Google Drive é usado somente para as funcionalidades da LeituraVerso. Os dados obtidos pelas APIs do Google não são vendidos nem utilizados para publicidade.</p>

        <h2>4. Outras fontes de dados</h2>
        <p>Informações bibliográficas, como título, autor, capa, ano de publicação, número de páginas e sinopse, podem ser consultadas em serviços públicos como Google Books e Open Library para facilitar o cadastro dos livros.</p>

        <h2>5. Compartilhamento</h2>
        <p>Os dados não são vendidos. Eles podem ser processados pelos provedores técnicos necessários para operar o serviço, como hospedagem, autenticação, banco de dados e armazenamento em nuvem.</p>

        <h2>6. Segurança e acesso</h2>
        <p>A biblioteca utiliza autenticação e controles de acesso. Livros e informações privadas são destinados apenas a usuários autorizados. O acesso administrativo ao Google Drive fica restrito às funções necessárias para administrar os arquivos da biblioteca.</p>

        <h2>7. Retenção e exclusão</h2>
        <p>Os dados são mantidos enquanto forem necessários para prestar o serviço. Usuários podem solicitar a remoção de dados associados à sua conta ao administrador da LeituraVerso.</p>

        <h2>8. Revogação do acesso ao Google</h2>
        <p>O administrador pode revogar o acesso da LeituraVerso à conta Google a qualquer momento nas configurações de segurança da própria Conta Google. A revogação impede novos acessos ao Drive até que a conta seja conectada novamente.</p>

        <h2>9. Contato</h2>
        <p>Para dúvidas, solicitações de privacidade ou exclusão de dados, utilize o e-mail de suporte informado na tela de consentimento OAuth da LeituraVerso.</p>

        <h2>10. Alterações</h2>
        <p>Esta política poderá ser atualizada quando houver mudanças relevantes no funcionamento do serviço ou nas integrações utilizadas.</p>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #263246", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#93c5fd" }}>Voltar para a Biblioteca</Link>
          <Link href="/termos-de-servico" style={{ color: "#93c5fd" }}>Termos de Serviço</Link>
        </div>
      </article>
    </main>
  );
}
