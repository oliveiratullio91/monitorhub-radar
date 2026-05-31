# Projeto de Hiperautomacao no n8n

Projeto: Monitoramento automatico de anuncios, precos e oportunidades.

Este repositorio contem o kit inicial para montar o projeto no n8n:

- `workflows/monitoramento-anuncios-precos-oportunidades.json`: workflow base para importar no n8n.
- `workflows/monitoramento-marketplaces-amazon-mercado-livre.json`: workflow preparado para Mercado Livre e Amazon via API autorizada.
- `workflows/monitorhub-feed-n8n-mercado-livre.json`: workflow que envia os produtos coletados pelo n8n diretamente para o dashboard.
- `workflows/monitorhub-promocoes-mercado-livre.json`: workflow que envia somente itens com promocao ativa do Mercado Livre.
- `workflows/monitorhub-ofertas-mercado-livre.json`: workflow que coleta a pagina publica de ofertas do Mercado Livre.
- `site/index.html`, `site/styles.css`, `site/app.js`: painel local para acompanhar produtos em tempo real.
- `server/server.js`: backend local que consulta Mercado Livre e Amazon sem expor credenciais no navegador.
- `api/config.js`, `api/products.js` e `api/n8n/products.js`: funcoes serverless preparadas para Vercel.
- `templates/google-sheets-historico.csv`: cabecalho da aba `historico` no Google Sheets.
- `docs/plano-n8n.md`: arquitetura, configuracao e roteiro de implementacao.
- `docs/plano-plataforma.md`: etapas da plataforma publica para Amazon, Mercado Livre e Vercel.
- `docs/fontes-amazon-mercado-livre.md`: observacoes especificas sobre Amazon e Mercado Livre.
- `docs/credenciais-marketplaces.md`: como preencher as credenciais reais.

## Como usar

1. Crie uma planilha no Google Sheets com uma aba chamada `historico`.
2. Copie a primeira linha de `templates/google-sheets-historico.csv` para a linha 1 da aba.
3. No n8n, importe o arquivo `workflows/monitoramento-anuncios-precos-oportunidades.json`.
4. Abra o no `Configuracao` e preencha:
   - `sourceUrl`: URL da API ou fonte publica em JSON.
   - `sourceName`: nome da fonte monitorada.
   - `queryName`: descricao curta do filtro/pesquisa.
   - `spreadsheetId`: ID da planilha Google.
   - `sheetName`: nome da aba, por padrao `historico`.
   - `telegramChatId`: chat ID do Telegram.
   - `gmailTo`: email que deve receber alertas.
5. Configure as credenciais dos nos Google Sheets, Telegram e Gmail no n8n.
6. Execute manualmente uma vez para testar.
7. Ative o workflow para rodar automaticamente.

## Estado atual

Esta primeira versao ja cobre o fluxo principal do PDF:

- coleta automatica por agendamento;
- processamento e normalizacao dos dados;
- identificacao de novo anuncio e mudanca de preco;
- registro em planilha;
- envio de alerta por Telegram e Gmail.

Para Amazon e Mercado Livre, use o workflow `monitoramento-marketplaces-amazon-mercado-livre.json`. Fontes com CAPTCHA, login ou bloqueio anti-bot exigem API autorizada ou outra estrategia.

## Feed do n8n para o dashboard

O painel agora prioriza produtos enviados pelo n8n em `POST /api/n8n/products`.

1. Importe `workflows/monitorhub-feed-n8n-mercado-livre.json` no n8n.
2. No node `Configuracao MonitorHub`, confira:
   - `monitorHubEndpoint`: `https://monitorhub-radar.vercel.app/api/n8n/products` ou `http://127.0.0.1:8080/api/n8n/products`.
   - `query`: termo buscado no Mercado Livre.
   - `limit`: quantidade de produtos.
   - `mercadoLivreAccessToken`: token do app, se a fonte exigir.
   - `mercadoLivreSearchUrl`: endpoint usado pelo n8n para buscar itens, com `{{query}}` e `{{limit}}`.
3. Execute manualmente. O workflow coleta, normaliza, calcula score de oportunidade e envia para o MonitorHub.
4. Abra o dashboard e clique em `Atualizar`.

Se quiser proteger a escrita do feed, defina `N8N_INGEST_TOKEN` na Vercel/local e coloque o mesmo valor em `monitorHubIngestToken` no workflow.

### Somente promocoes do Mercado Livre

Para listar apenas produtos que estao em promocao, importe `workflows/monitorhub-promocoes-mercado-livre.json`.

No node `Configuracao Promocoes`, preencha:

- `promotionsSourceUrl`: endpoint seguro que busca promocoes usando as credenciais do backend.
- `minDiscountPercent`: desconto minimo para entrar no painel.
- `promotionTypes`: tipos de promocao aceitos.

O filtro exige `status=started`, `original_price` maior que `price` e preco promocional maior que zero.
Com o workflow ativo no n8n local, voce tambem pode disparar uma coleta imediata em `http://127.0.0.1:5678/webhook/monitorhub-promocoes`.

### Pagina publica de ofertas

Para coletar a pagina `https://www.mercadolivre.com.br/ofertas`, importe `workflows/monitorhub-ofertas-mercado-livre.json`.

O endpoint usado pelo workflow e `https://monitorhub-radar.vercel.app/api/mercadolivre/offers?pages=20&limit=500`.
Ele pagina a listagem publica de ofertas, extrai os cards com preco atual, preco anterior, desconto e link, e envia para o dashboard.
Com o workflow ativo no n8n local, dispare uma coleta imediata em `http://127.0.0.1:5678/webhook/monitorhub-ofertas`.

## Painel local

Para abrir o dashboard com backend local:

```powershell
npm install
.\start-site-local.ps1
```

Depois acesse `http://127.0.0.1:8080`.

Preencha o arquivo `.env` para ativar Mercado Livre e Amazon reais.
O painel principal esta em modo real: sem credenciais, ele mostra quais variaveis faltam em vez de preencher a tela com produtos demonstrativos.
Para conectar Mercado Livre com OAuth local, acesse `http://127.0.0.1:8080/mercadolivre-setup.html` e use o APP ID/Secret Key do aplicativo criado no Mercado Livre Developers.

Na Vercel, use as mesmas chaves do `.env` como Environment Variables.
Depois do deploy, cadastre no app do Mercado Livre:

- URL do site: `https://SEU-PROJETO.vercel.app`
- Redirect URI: `https://SEU-PROJETO.vercel.app/api/mercadolivre/oauth/callback`

## Plataforma publica

As 5 primeiras etapas da plataforma ja estao preparadas:

1. Fundacao publica do site com cabecalho, navegacao, aviso de afiliado, sobre e privacidade.
2. Conteudo editorial com metodologia, guias de compra e orientacoes de comparacao.
3. Vitrine de produtos com busca, filtros, categorias, ordenacao e cards detalhados.
4. Integracao segura por backend para Mercado Livre, Amazon Creators API ou endpoint autorizado.
5. Historico local de mudancas com eventos, primeira leitura e comparacao de preco.

A etapa 6 fica para publicacao, dominio, revisao manual e ajustes finais da conta de associado.
