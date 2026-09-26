# Deploy na Cloudflare Workers

O projeto inclui OpenNext e Wrangler com versões fixas. `wrangler deploy`
executa o build configurado em `wrangler.jsonc`, gerando `.open-next/worker.js`
e os assets. O build da Cloudflare usa Webpack para compatibilidade com o
empacotamento standalone do OpenNext. O build convencional permanece disponível.

## Painel da Cloudflare

- Repositório: `Guilhsxzd12/kindle-book`, branch `main`, diretório `/`.
- Build command: pode ficar vazio; o Wrangler executa `npm run build:cloudflare`.
  O valor atual `npm run build` também funciona, mas faz um build adicional.
- Deploy command: `npx wrangler deploy`.
- Nome configurado: `kindlebook`. Deve corresponder ao Worker conectado.
- Use Node.js 22 ou superior.

## Variáveis e segredos

Configure no painel as variáveis já usadas pelo projeto. As variáveis
`NEXT_PUBLIC_*` precisam estar disponíveis durante o build, pois são incorporadas
no JavaScript do navegador. Os demais segredos precisam estar disponíveis no
Worker em execução. Nunca publique valores secretos no GitHub.

Obrigatórias para login e catálogo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` (segredo do servidor)
- `NEXT_PUBLIC_SITE_URL` (URL pública desejada)

Conforme as integrações ativas:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `GOOGLE_BOOKS_API_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`
- `CRON_SECRET` e demais configurações já usadas pelo worker local

`keep_vars` preserva variáveis definidas no painel durante o deploy. Isso não
transfere automaticamente variáveis da Vercel. Ao alterar `NEXT_PUBLIC_*`, refaça
o build.

## Validação

1. `npm ci`
2. `npm run build:cloudflare`
3. `npx wrangler deploy --dry-run --outdir /tmp/leituraverso-worker`
4. Teste a URL de preview: login, catálogo, pesquisa, downloads e administração.
5. Configure callbacks OAuth e webhook do Telegram para a URL pretendida.
6. Só transfira o domínio após validar os fluxos na nova hospedagem.

A configuração básica não provisiona cache persistente R2/KV nem serviços pagos.
O cache incremental padrão do OpenNext é desativado (dummy); avaliar cache
persistente separadamente após validar o deploy. Processamento de PDFs/EPUBs e
envio de arquivos pelo Telegram exigem testes de CPU e memória no plano escolhido.
