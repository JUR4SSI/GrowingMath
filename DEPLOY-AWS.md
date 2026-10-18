# Hospedar o Growing Math na AWS

O app continua rodando localmente (janela Electron, interface servida pela
maquina do usuario). Só os **dados** saem para o servidor: o `server.ts` — que
ja e uma API completa — passa a rodar na AWS junto com o banco.

```
Maquina do aluno                          AWS (EC2)
┌────────────────────────────┐            ┌──────────────────────────┐
│ Electron                   │            │ node build/server.mjs    │
│  └ Express local           │            │  ├ 34 rotas /api         │
│     └ serve so a interface │──/api/*──▶ │  └ growing_math.db (EBS) │
└────────────────────────────┘            └──────────────────────────┘
```

Por que a API vai junto e nao so o banco: `better-sqlite3` e **sincrono** e ha
128 chamadas diretas no `server.ts`. Trocar por um driver de banco remoto
(assincrono) exigiria reescrever todos os handlers. Alem disso, ligar cada app
direto no banco obrigaria a distribuir a credencial do banco para toda maquina
— qualquer usuario poderia ler ou alterar os dados de todos.

---

## 1. No servidor (EC2)

```bash
sudo mkdir -p /var/lib/growing-math          # volume persistente (EBS)
npm ci && npm run build && node scripts/build-server.mjs
```

`.env` do servidor:

```ini
HOST=0.0.0.0
PORT=3000
GROWING_MATH_DB_PATH=/var/lib/growing-math/growing_math.db

# A instancia roda em UTC. Sem isto o "dia" do desafio diario viraria as 21h
# em Brasilia: o desafio concluido some do historico, a streak quebra e o aluno
# consegue resgatar a recompensa duas vezes na mesma noite.
APP_TIMEZONE=America/Sao_Paulo

# Obrigatorios fora do loopback: o servidor se recusa a iniciar sem eles.
AUTH_JWT_SECRET=<32+ caracteres aleatorios>
AUTH_PASSWORD_PEPPER=<outro valor aleatorio>
TEACHER_ACCESS_CODE=<codigo de cadastro de professores>

AI_PROVIDER=auto
```

Gerar segredos: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Subir com `systemd` ou `pm2` para reiniciar sozinho. Colocar **HTTPS na frente**
(ALB com ACM, ou nginx + Let's Encrypt) — os tokens de autenticacao viajam no
header `Authorization` e nao podem trafegar em HTTP puro.

Security group: liberar apenas 443 para a internet; a porta 3000 fica interna.

## 2. Nas maquinas dos usuarios

Acrescentar uma linha ao `.env` ao lado do `Growing Math.exe`:

```ini
API_BASE_URL=https://api.growingmath.suaempresa.com
```

E so. A URL e lida em **runtime** e injetada no HTML pelo servidor local, entao
trocar de servidor nao exige recompilar nem redistribuir o instalador. Apagar a
linha volta ao modo local.

## 3. CORS

O app desktop abre em `http://127.0.0.1:<porta efemera>`, que muda a cada
inicializacao — por isso qualquer origem loopback e aceita por padrao. Isso e
seguro aqui porque a autenticacao usa **Bearer token no header**, nao cookie:
um site malicioso nao tem o token. Para restringir:

```ini
CORS_ALLOWED_ORIGINS=https://app.growingmath.suaempresa.com
CORS_ALLOW_LOOPBACK=false
```

---

## Antes de colocar em producao

- [ ] **`PRAGMA journal_mode = WAL`** — sem isso o SQLite serializa leituras e
      escritas e trava com varios alunos simultaneos.
- [ ] **Backup do `.db`** — snapshot do EBS ou copia periodica para S3.
- [ ] **Indices por `user_id`** nas tabelas de progresso.
- [ ] **`helmet`** e limite de tamanho no `express.json()`.
- [ ] **Rodar em instancia unica (sem cluster/autoscaling por enquanto).** O
      handler de `/api/daily-challenge/submit` grava a tentativa e credita a
      recompensa em statements separados, fora de uma `db.transaction()`. Hoje
      isso e seguro porque o handler nao tem `await` e o Node serializa tudo num
      processo so; com dois processos sobre o mesmo `.db` a recompensa pode ser
      creditada duas vezes. Envolver em transacao antes de escalar horizontalmente.
- [ ] Migrar usuarios existentes: hoje cada maquina tem o proprio `.db` em
      `%APPDATA%`. Nao ha importador — os perfis locais nao sobem sozinhos.
- [ ] Avaliar Postgres se passar de algumas dezenas de escritas simultaneas.
      Ai sim vale a reescrita assincrona.
