# Nenero

Um app de controle financeiro simples, leve e bem-humorado.

## Rodar o projeto

```bash
npm install
npm run android
```

Também é possível abrir no navegador com `npm run web`.

## MVP

- Carteiras com saldo inicial
- Lançamentos de entradas e gastos avulsos
- Gastos periódicos com ativação e pausa
- Resumo financeiro e histórico
- Dados salvos localmente no aparelho

## Análise financeira com Gemini

Como este é um aplicativo pessoal, a integração é feita diretamente no aparelho.
Copie `.env.example` para `.env` e informe sua chave:

```bash
EXPO_PUBLIC_GEMINI_API_KEY=SUA_CHAVE_GEMINI
```

Depois reinicie o Expo com `npx expo start --clear`.

## PWA com Docker

O container gera a versão web instalável e mantém a chave do Gemini apenas no
servidor. No servidor, copie `docker.env.example` para `.env` e preencha:

```bash
GEMINI_API_KEY=SUA_CHAVE_GEMINI
NENERO_PORT=8080
```

Suba a aplicação:

```bash
docker compose up -d --build
```

Acesse `http://localhost:8080`. Em produção, publique o container atrás de um
proxy reverso com HTTPS; navegadores exigem HTTPS para instalar a PWA.
