# Fontes: Amazon e Mercado Livre

## Mercado Livre

O caminho recomendado e usar a API oficial de busca de itens:

`https://api.mercadolibre.com/sites/MLB/search?q=TERMO&limit=10&sort=price_asc`

Na documentacao atual, os exemplos usam `Authorization: Bearer $ACCESS_TOKEN`. No teste local sem token, a API respondeu `403 forbidden`, entao o workflow novo ja deixa um campo para informar o access token.

Configuracao no no `Configuracao geral`:

- `mercadoLivreEnabled`: `true`
- `mercadoLivreQuery`: termo buscado, por exemplo `notebook`
- `mercadoLivreAccessToken`: token de acesso do app Mercado Livre

## Amazon

Amazon nao deve ser monitorada por scraping direto da pagina HTML. O site costuma bloquear automacoes com CAPTCHA/anti-bot, e isso tambem foge do escopo original do projeto, que exclui sites com bloqueios avancados.

O caminho correto e usar uma API autorizada. Em 27/05/2026, a documentacao antiga da Product Advertising API indica que a PA-API foi depreciada em 15/05/2026 e recomenda migrar para a Creators API. Por isso, o workflow trabalha com um campo generico `amazonApiUrl`, que pode receber uma URL de API autorizada que retorne JSON de produtos.

Configuracao no no `Configuracao geral`:

- `amazonEnabled`: `true`
- `amazonQuery`: termo buscado, por exemplo `fone bluetooth`
- `amazonApiUrl`: endpoint autorizado que retorne JSON
- `amazonAuthHeader`: header de autorizacao, se a API exigir

O normalizador ja reconhece estruturas comuns de respostas Amazon, incluindo campos como:

- `SearchResult.Items`
- `ASIN`
- `DetailPageURL`
- `ItemInfo.Title.DisplayValue`
- `OffersV2.Listings[0].Price.Money.Amount`
- `Offers.Listings[0].Price.Amount`
- `Images.Primary.Medium.URL`

## Sobre Keepa e outros provedores

Keepa, Rainforest, SerpAPI e provedores parecidos podem funcionar bem para Amazon, mas normalmente envolvem API key, creditos ou plano pago. Como o documento do projeto diz que nao inclui fontes privadas ou pagas, deixei o workflow preparado para API autorizada, mas nao prendi a implementacao a um provedor pago.

## Passo inicial recomendado

1. Ativar primeiro o Mercado Livre com token.
2. Validar planilha, Telegram e Gmail.
3. Decidir a API autorizada da Amazon.
4. Colar a URL da Amazon em `amazonApiUrl`.
5. Desativar `demoFallbackEnabled`.

Para o site em `site/`, a configuracao equivalente fica no arquivo `.env` e nas Environment Variables da Vercel. Use `MERCADO_LIVRE_ACCESS_TOKEN` para Mercado Livre e, para Amazon, prefira as chaves `AMAZON_PARTNER_TAG`, `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET` e `AMAZON_CREDENTIAL_VERSION`.

## Referencias

- Mercado Livre - Busca de itens: https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/itens-e-buscas
- Amazon - Creators API: https://affiliate-program.amazon.com/creatorsapi/docs/
- Amazon - aviso de depreciacao da PA-API: https://webservices.amazon.com/paapi5/documentation/search-items.html
