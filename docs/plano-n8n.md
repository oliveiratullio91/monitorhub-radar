# Plano do workflow n8n

## Objetivo

Automatizar o monitoramento de anuncios, precos e oportunidades em fontes digitais publicas, registrando historico no Google Sheets e enviando alertas por Telegram e Gmail quando houver novidade ou mudanca relevante.

## Arquitetura v0

Fluxo principal:

1. `Executar manualmente` ou `Agendamento - a cada 1 hora`
2. `Configuracao`
3. `Buscar dados da fonte`
4. `Normalizar, comparar e gerar alertas`
5. `Registrar no Google Sheets`
6. `Enviar Telegram`
7. `Enviar Gmail`

## Configuracao inicial

O no `Configuracao` concentra os valores que devem mudar de projeto para projeto:

- `sourceUrl`: endpoint publico que retorna JSON.
- `sourceName`: nome da fonte, como `Fake Store API`.
- `queryName`: nome da busca, como `produtos de teste`.
- `currency`: moeda exibida nos alertas.
- `minPercentChange`: percentual minimo para alertar mudanca de preco.
- `spreadsheetId`: ID da planilha do Google Sheets.
- `sheetName`: aba onde o historico sera gravado.
- `telegramChatId`: destino no Telegram.
- `gmailTo`: destino no Gmail.

## Historico

A planilha deve ter uma aba chamada `historico` com as colunas do arquivo:

`templates/google-sheets-historico.csv`

O workflow usa dados estaticos do proprio n8n para comparar rapidamente o ultimo preco conhecido de cada item e usa o Google Sheets como trilha de auditoria dos alertas gerados.

Observacao: dados estaticos do n8n devem ser pequenos. Se o volume crescer muito, a comparacao deve migrar para Google Sheets, banco SQL, Supabase ou Data Tables do n8n.

## Regras de alerta

O no de codigo gera alerta quando:

- encontra um `item_id` novo;
- detecta reducao de preco;
- detecta aumento de preco acima do percentual minimo configurado.

Se um item aparece novamente sem mudanca relevante de preco, o estado interno e atualizado, mas nenhum alerta e enviado.

## Modelo de dados normalizado

Cada oportunidade e convertida para:

- `checked_at`
- `source`
- `query`
- `event_type`
- `item_id`
- `title`
- `price`
- `previous_price`
- `price_diff`
- `percent_diff`
- `currency`
- `item_url`
- `image_url`
- `seller`
- `availability`
- `message`
- `raw_json`

## Roteiro de implementacao

1. Importar o workflow no n8n.
2. Criar a planilha e configurar credencial do Google Sheets.
3. Criar bot no Telegram e configurar credencial no n8n.
4. Configurar credencial do Gmail.
5. Testar com a URL publica de exemplo.
6. Trocar `sourceUrl` pela fonte real do projeto.
7. Ajustar o codigo de normalizacao caso a fonte use campos diferentes.
8. Ativar o workflow e acompanhar as primeiras execucoes.

## Testes minimos

- Execucao manual retorna itens normalizados.
- Primeira execucao gera alertas de itens novos.
- Segunda execucao sem mudanca nao gera alertas duplicados.
- Alteracao simulada de preco gera alerta.
- Google Sheets recebe a linha com dados completos.
- Telegram e Gmail recebem mensagem legivel.
