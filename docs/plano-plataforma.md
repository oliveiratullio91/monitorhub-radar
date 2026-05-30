# Plano da plataforma publica

Objetivo: transformar o monitoramento do n8n em uma pagina publica apresentavel para cadastro, revisao e uso real com Amazon, Mercado Livre e Vercel.

## Etapa 1 - Fundacao publica

Status: concluida.

- Pagina inicial com identidade clara: Radar Inteligente de Produtos.
- Navegacao para oportunidades, guias, metodologia, sobre e privacidade.
- Aviso de afiliado visivel no corpo da pagina e no rodape.
- Tema escuro responsivo com estrutura em HTML, CSS e JS separados.

## Etapa 2 - Conteudo de confianca

Status: concluida.

- Secao de metodologia explicando preco com historico, contexto de uso, fonte e compra consciente.
- Guias editoriais curtos para dar valor ao site alem da vitrine de produtos.
- Bloco de privacidade explicando armazenamento local e credenciais no servidor.
- Texto sem promessa de menor preco garantido.

## Etapa 3 - Vitrine de produtos

Status: concluida.

- Painel com cards de produtos, imagem, fonte, vendedor, preco, nota de curadoria e link original.
- Filtros por busca, categoria, fonte e produtos com mudancas.
- Ordenacao por mudanca, menor preco, maior preco e fonte.
- Modo demonstracao automatico quando as credenciais reais ainda nao existem.

## Etapa 4 - Integracao segura

Status: concluida.

- Backend local em Node.js para proteger credenciais.
- Funcoes serverless em `api/config.js` e `api/products.js` preparadas para Vercel.
- Mercado Livre via API oficial com `MERCADO_LIVRE_ACCESS_TOKEN`.
- Amazon via Creators API ou `AMAZON_ENDPOINT_URL` autorizado.
- Links Amazon recebem `AMAZON_PARTNER_TAG` quando disponivel.

## Etapa 5 - Historico e monitoramento

Status: concluida.

- Registro local de primeira leitura, queda e aumento de preco.
- Linha do tempo de eventos recentes.
- Mini historico visual em cada produto.
- Atualizacao automatica com intervalo configuravel e botao de pausa.

## Etapa 6 - Publicacao e revisao manual

Status: pendente para fazer manualmente.

- Criar projeto na Vercel e conectar ao repositorio ou subir pelo painel.
- Preencher Environment Variables com as chaves reais.
- Revisar dominio, politica, aviso de afiliado e links finais.
- Informar a URL publica no cadastro da Amazon Associates.
- Fazer testes manuais em desktop e celular antes de divulgar.
