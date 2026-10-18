# Growing Math

Plataforma de matemática gamificada (RPG) com IA, empacotada como app desktop para Windows.
Stack: React 19 + Vite + TypeScript, Express, SQLite (better-sqlite3), Electron, Gemini ou Ollama (IA local).

## Baixar e usar (Windows)

Baixe o instalador em **[Releases](../../releases/latest)** (`Growing Math Setup x.y.z.exe`) e execute.
O instalador também instala e configura o Ollama (IA local) quando selecionado.

## Rodar a partir do código

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env     # ajuste GEMINI_API_KEY ou use AI_PROVIDER=ollama
npm run dev              # servidor em http://127.0.0.1:3000
```

## Gerar o instalador

```bash
npm run pack:all         # saída em release/
```

## Testes de fumaça

```bash
npm run smoke
```

## Estrutura

- `src/` — front-end React
- `server.ts` — API Express + SQLite
- `electron/` — app desktop
- `installer/` — instalador NSIS e script do Ollama
- `scripts/` — build e smoke tests
- `DEPLOY-AWS.md` — como hospedar o servidor na AWS

Nunca versione `.env`, bancos `.db` ou o `teacher-access-code.txt` (já estão no `.gitignore`).
