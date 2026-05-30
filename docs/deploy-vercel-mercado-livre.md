# Deploy na Vercel e URL do Mercado Livre

## 1. Login na Vercel

```powershell
npx vercel login
```

Escolha o metodo de login e conclua no navegador.

## 2. Publicar o projeto

Na pasta do projeto:

```powershell
npx vercel --prod
```

Na primeira publicacao, confirme as perguntas da Vercel. Ao final, ela mostrara uma URL parecida com:

```text
https://monitorhub.vercel.app
```

## 3. URLs para cadastrar no Mercado Livre

Use a URL real que a Vercel devolver.

```text
URL do site:
https://SEU-PROJETO.vercel.app

Redirect URI:
https://SEU-PROJETO.vercel.app/api/mercadolivre/oauth/callback
```

## 4. Variaveis da Vercel

Em Project Settings > Environment Variables, cadastre:

```env
MERCADO_LIVRE_ENABLED=true
MERCADO_LIVRE_SITE_ID=MLB
MERCADO_LIVRE_CLIENT_ID=APP_ID_DO_MERCADO_LIVRE
MERCADO_LIVRE_CLIENT_SECRET=SECRET_KEY_DO_MERCADO_LIVRE
MERCADO_LIVRE_REDIRECT_URI=https://SEU-PROJETO.vercel.app/api/mercadolivre/oauth/callback
```

Depois rode novamente:

```powershell
npx vercel --prod
```

## 5. Autorizar o Mercado Livre

Acesse:

```text
https://SEU-PROJETO.vercel.app/mercadolivre-setup.html
```

Clique em `Autorizar Mercado Livre`. A tela de callback vai retornar as variaveis:

```env
MERCADO_LIVRE_ACCESS_TOKEN=
MERCADO_LIVRE_REFRESH_TOKEN=
MERCADO_LIVRE_TOKEN_EXPIRES_AT=
MERCADO_LIVRE_USER_ID=
```

Cadastre essas variaveis na Vercel e publique de novo.
