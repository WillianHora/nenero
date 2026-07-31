# Nenero

O repositório é um monorepo com aplicações web e mobile independentes.

## Estrutura

```text
apps/
  mobile/             Expo local para Android e iOS
  web/                Expo Web com Supabase, PWA, servidor e Docker
supabase/
  migrations/         Banco usado pela versão web
```

## Instalação

Na raiz:

```bash
npm install
```

Copie as variáveis conforme o projeto que será executado:

```bash
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env
```

## Mobile

```bash
npm run start:mobile
npm run android
npm run ios
```

Os builds EAS devem ser executados dentro do projeto mobile:

```bash
cd apps/mobile
npx eas build --platform android --profile preview
npx eas build --platform ios --profile production
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

O proxy HTTPS e o certificado temporário também pertencem exclusivamente ao
projeto web em `apps/web/Caddyfile`.

## Validação

```bash
npm run typecheck
```
