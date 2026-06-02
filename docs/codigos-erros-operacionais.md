# Codigos de Erros Operacionais

Este documento traduz os codigos exibidos ao usuario em causas provaveis e pontos de verificacao internos.

## Regras de uso

- A interface publica deve exibir somente o codigo e uma mensagem curta.
- Nomes de ferramentas internas, provedores de hospedagem e banco nao devem aparecer para o usuario final.
- Ao investigar, use este documento para mapear o codigo para a camada tecnica correspondente.

## Codigos

| Codigo | Area | Mensagem publica sugerida | Causa provavel | O que verificar |
| --- | --- | --- | --- | --- |
| RAD-FEED-001 | Coleta | Aguardando entrada de produtos do motor de coleta. | O workflow/rotina de coleta ainda nao enviou produtos, enviou payload vazio ou a consulta ao feed falhou. | Verificar endpoint `/api/n8n/products`, ultimo payload recebido, agenda da automacao e arquivo `.site-local/n8n-products.json` no local. |
| RAD-FEED-002 | Coleta | Token de ingestao invalido. | Header de seguranca da automacao diferente do configurado no backend. | Conferir `N8N_INGEST_TOKEN` e o header `X-N8N-Token` usado pelo workflow. |
| RAD-FEED-003 | Coleta | Coleta parcial ou temporariamente indisponivel. | A fonte retornou bloqueio, captcha, HTML inesperado ou timeout durante a coleta. | Validar logs da coleta, resposta HTML e limites das paginas de ofertas. |
| RAD-AUTH-001 | Autenticacao | Servico de autenticacao aguardando configuracao. | Variaveis publicas de autenticacao ausentes no ambiente atual. | Conferir `SUPABASE_URL` e `SUPABASE_ANON_KEY`. |
| RAD-AUTH-002 | Autenticacao | Sessao expirada ou invalida. | Access token expirado, refresh token invalido ou header de autorizacao ausente. | Refazer login, conferir armazenamento local e rota `/api/auth/refresh`. |
| RAD-AUTH-003 | Autenticacao | Login social temporariamente indisponivel. | Provider social nao habilitado ou URL de retorno nao cadastrada. | Conferir provider Google, redirect URLs e variaveis de autenticacao. |
| RAD-AUTH-004 | Autenticacao | Login social interrompido antes da conclusao. | Usuario cancelou login, callback retornou erro ou o provedor recusou a autorizacao. | Repetir fluxo e conferir parametros de callback. |
| RAD-DATA-001 | Dados | Servico de dados indisponivel ou aguardando configuracao. | Variaveis do banco/servico de dados ausentes, chave de servico invalida ou API de dados indisponivel. | Conferir `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e permissao do projeto. |
| RAD-DATA-002 | Catalogo | Catalogo indisponivel; usando ofertas atuais. | Tabela/colunas de catalogo ainda nao existem, schema nao aplicado ou catalogo vazio. | Rodar `docs/supabase-alertas.sql` e verificar a tabela `monitorhub_product_catalog`. |
| RAD-DATA-003 | Alertas | Sincronizacao de alertas indisponivel. | Alertas nao podem ser lidos/salvos no banco no momento. | Conferir tabela `monitorhub_price_alerts`, RLS e service role. |
| RAD-DATA-004 | Dados | Registro nao encontrado. | ID invalido, item removido ou registro pertence a outro usuario. | Conferir ID enviado e filtros por usuario. |
| RAD-ENV-001 | Ambiente | Credenciais ausentes no ambiente online. | Variaveis necessarias nao foram cadastradas no ambiente publicado. | Conferir Environment Variables no provedor de hospedagem e redeploy. |
| RAD-ML-001 | Mercado Livre | Fonte Mercado Livre temporariamente indisponivel. | Busca publica/autenticada retornou erro, permissao insuficiente ou bloqueio temporario. | Conferir token Mercado Livre, permissoes de leitura e resposta da rota `/api/mercadolivre/offers`. |
| RAD-ML-002 | Mercado Livre | Fonte Mercado Livre aguardando credencial de integracao. | Ambiente local sem token ou integracao OAuth ainda nao autorizada. | Autorizar em `mercadolivre-setup.html` ou configurar `MERCADO_LIVRE_ACCESS_TOKEN`. |
| RAD-ML-003 | Mercado Livre | Conta Mercado Livre conectada sem anuncios proprios retornados. | Conta autorizada nao possui anuncios proprios, mas a vitrine pode seguir usando ofertas publicas. | Verificar se o fallback `public-offers` esta ativo e se `/api/mercadolivre/offers` retorna itens. |
| RAD-AMZ-001 | Amazon | Fonte Amazon temporariamente indisponivel. | Pagina de ofertas mudou, paginacao falhou, captcha ou timeout. | Conferir `/api/amazon/deals?limit=500&pages=20`, parser do widget e logs de erro. |
| RAD-AMZ-002 | Amazon | Fonte Amazon aguardando credencial de integracao. | API oficial sem credenciais, quando usada em modo autenticado. | Conferir `AMAZON_PARTNER_TAG`, `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET` e `AMAZON_CREDENTIAL_VERSION`. |
| RAD-NOTIFY-001 | Avisos | Falha ao enviar aviso. | Provedor respondeu erro, limite atingido, payload invalido ou indisponibilidade temporaria. | Conferir logs da rota `/api/alerts/dispatch`, resposta do provedor e status da notificacao. |
| RAD-NOTIFY-002 | Avisos | Envio de e-mail aguardando configuracao. | Nenhum provedor de e-mail ativo ou remetente/destinatario ausente. | Configurar `EMAIL_FROM` e uma opcao: `RESEND_API_KEY`, `SENDGRID_API_KEY` ou `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`. |
| RAD-NOTIFY-003 | Avisos | Envio por WhatsApp aguardando configuracao. | Token, phone number id ou telefone de destino ausente. | Configurar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e validar telefone do alerta. |
| RAD-NOTIFY-004 | Avisos | Envio por Telegram aguardando configuracao. | Bot token ou chat id ausente. | Configurar `TELEGRAM_ALERTS_ENABLED`, `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. |
| RAD-GEN-001 | Geral | Falha operacional. Consulte o codigo informado. | Erro nao classificado. | Revisar response da API, console/logs do servidor e reproduzir o fluxo. |

## Observacoes

- `RAD-FEED-*`, `RAD-AUTH-*`, `RAD-DATA-*` e `RAD-ENV-*` escondem nomes de infraestrutura.
- `RAD-ML-*` e `RAD-AMZ-*` podem aparecer porque Mercado Livre e Amazon sao fontes visiveis da plataforma.
- Ao adicionar nova mensagem publica, prefira criar um codigo antes de mostrar detalhes tecnicos.
