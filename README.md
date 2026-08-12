# Nenero

Aplicação web de finanças pessoais construída com Expo Web, Supabase e suporte a PWA.

## Estrutura

```text
apps/
  web/                Expo Web com Supabase, PWA, servidor e Docker
supabase/
  migrations/         Banco da aplicação
```

## Instalação

Na raiz:

```bash
npm install
```

Copie as variáveis de ambiente:

```bash
cp apps/web/.env.example apps/web/.env
```

## Web

Desenvolvimento:

```bash
npm run start:web
```

Exportação e servidor de produção:

```bash
npm run export:web
npm run serve:web
```

Docker:

```bash
cd apps/web
docker compose up -d --build
```

O proxy HTTPS e o certificado temporário ficam em `apps/web/Caddyfile`.

## Validação

```bash
npm run typecheck
```
