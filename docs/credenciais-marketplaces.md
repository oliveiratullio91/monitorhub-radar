# Credenciais para funcionamento real

O painel agora usa um backend local em Node.js. As credenciais ficam no arquivo `.env` e nao aparecem no navegador.

## Mercado Livre

O caminho mais simples no modo local e usar o assistente do projeto:

1. Abra `http://127.0.0.1:8090/mercadolivre-setup.html`.
2. No Mercado Livre Developers, cadastre no aplicativo o redirect URI:
   `http://127.0.0.1:8090/api/mercadolivre/oauth/callback`.
3. Cole o `APP ID` e a `Secret Key` no assistente local.
4. Autorize a conta no Mercado Livre.

O projeto troca o `code` por token e salva `access_token`, `refresh_token` e validade no `.env`.

Se preferir preencher manualmente, use:

```env
MERCADO_LIVRE_ENABLED=true
MERCADO_LIVRE_SITE_ID=MLB
MERCADO_LIVRE_ACCESS_TOKEN=SEU_ACCESS_TOKEN
MERCADO_LIVRE_REFRESH_TOKEN=SEU_REFRESH_TOKEN
MERCADO_LIVRE_CLIENT_ID=SEU_APP_ID
MERCADO_LIVRE_CLIENT_SECRET=SUA_SECRET_KEY
MERCADO_LIVRE_REDIRECT_URI=http://127.0.0.1:8090/api/mercadolivre/oauth/callback
```

O backend usa:

`GET https://api.mercadolibre.com/sites/MLB/search?q=TERMO&limit=10&sort=price_asc`

com:

`Authorization: Bearer SEU_ACCESS_TOKEN`

## Amazon

O caminho recomendado e Amazon Creators API. Preencha:

```env
AMAZON_ENABLED=true
AMAZON_PROVIDER=creators
AMAZON_MARKETPLACE=www.amazon.com.br
AMAZON_PARTNER_TAG=SEU_ASSOCIATE_TAG
AMAZON_CREDENTIAL_ID=SUA_CREDENTIAL_ID
AMAZON_CREDENTIAL_SECRET=SUA_CREDENTIAL_SECRET
AMAZON_CREDENTIAL_VERSION=SUA_CREDENTIAL_VERSION
```

Observacao importante: a Creators API exige conta Amazon Associates elegivel, registro para API e credenciais geradas no painel. A propria documentacao da Amazon informa como pre-requisito estar no Associates, ter vendas qualificadas recentes, registrar acesso e gerar credenciais.

## Amazon por endpoint autorizado alternativo

Se voce usar um provedor autorizado/terceiro para Amazon, pode preencher:

```env
AMAZON_ENDPOINT_URL=https://api.exemplo.com/search?q={{query}}&limit={{limit}}
AMAZON_ENDPOINT_AUTH_HEADER=Bearer SEU_TOKEN
```

Quando `AMAZON_ENDPOINT_URL` existe, o backend usa esse endpoint em vez da Creators API.

## Testes rapidos

Depois de preencher `.env` manualmente, reinicie o servidor:

```powershell
.\start-site-local.ps1
```

Teste a API:

```powershell
Invoke-RestMethod "http://127.0.0.1:8090/api/products?sources=mercadolivre,amazon&mercadoLivreQuery=notebook&amazonQuery=fone%20bluetooth&limit=5"
```

Sem credenciais, o site fica em modo real aguardando configuracao e mostra quais variaveis ainda faltam. Para dados reais, use sempre Mercado Livre, Amazon Creators API ou outro endpoint autorizado.

## Vercel

Na Vercel, cadastre as mesmas chaves do `.env` em Project Settings > Environment Variables. Nao envie `.env` para o deploy.

## Referencias

- Mercado Livre - Items & Searches: https://developers.mercadolivre.com.br/en_us/ios/items-and-searches
- Mercado Livre - OAuth e tokens: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao?nocache=true
- Amazon Creators API: https://affiliate-program.amazon.com/creatorsapi/docs/
- Amazon Associates policies: https://affiliate-program.amazon.com/help/operating/policies
