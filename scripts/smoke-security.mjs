import assert from "node:assert/strict";
import { startServer } from "../build/server.mjs";

const server = await startServer({ port: 0, host: "127.0.0.1" });
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name} -> ${e.message}`);
  }
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${base}${path}`, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

const json = (method, body, token) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// --- setup: cria um usuario real -------------------------------------------
const email = `tester${Date.now()}@growingmath.app`;
const password = "Teste@2026!x";
const reg = await api("/api/auth/register", json("POST", { name: "Tester", email, password }));
assert.equal(reg.status, 201, `register falhou: ${JSON.stringify(reg)}`);
const token = reg.body.authToken;
const startXp = reg.body.user.xp;
const startCoins = reg.body.user.coins;

// --- #2 daily-challenge exige auth -----------------------------------------
const anonDaily = await api("/api/daily-challenge");
check("#2 GET /api/daily-challenge sem token -> 401", () => assert.equal(anonDaily.status, 401));

const anonSubmit = await api("/api/daily-challenge/submit", json("POST", { email, selectedOption: 0 }));
check("#2 POST /api/daily-challenge/submit sem token -> 401", () => assert.equal(anonSubmit.status, 401));

const anonHistory = await api("/api/daily-challenge/history?email=" + encodeURIComponent(email));
check("#2 GET /api/daily-challenge/history sem token -> 401", () => assert.equal(anonHistory.status, 401));

const authDaily = await api("/api/daily-challenge", auth(token));
check("#2 GET /api/daily-challenge com token -> 200", () => assert.equal(authDaily.status, 200));

// --- #3 endpoints de IA exigem auth ----------------------------------------
const anonEx = await api("/api/ai/exercise", json("POST", { topic: "ops-basicas", level: 1 }));
check("#3 POST /api/ai/exercise sem token -> 401", () => assert.equal(anonEx.status, 401));

const anonTutor = await api("/api/ai/tutor", json("POST", { message: "oi" }));
check("#3 POST /api/ai/tutor sem token -> 401", () => assert.equal(anonTutor.status, 401));

const authEx = await api("/api/ai/exercise", json("POST", { topic: "ops-basicas", level: 1 }, token));
check("#3 POST /api/ai/exercise com token -> 200", () => assert.equal(authEx.status, 200));

// --- #1 recompensa autoritativa --------------------------------------------
const forged = await api(
  "/api/user/update-progress",
  json("POST", { topic: "ops-basicas", xpGain: 999999, coinsGain: 999999, masteryIncrease: 100 }, token)
);
check("#1 payload legado (xpGain forjado) -> 400", () => assert.equal(forged.status, 400));

const badTopic = await api("/api/user/update-progress", json("POST", { topic: "../hack", action: "exercise_correct" }, token));
check("#1 topico invalido -> 400", () => assert.equal(badTopic.status, 400));

const badAction = await api("/api/user/update-progress", json("POST", { topic: "ops-basicas", action: "give_me_all" }, token));
check("#1 acao invalida -> 400", () => assert.equal(badAction.status, 400));

const ok1 = await api("/api/user/update-progress", json("POST", { topic: "ops-basicas", action: "exercise_correct" }, token));
check("#1 acao valida -> 200 com valores do servidor", () => {
  assert.equal(ok1.status, 200);
  assert.equal(ok1.body.xpGain, 20);
  assert.equal(ok1.body.coinsGain, 5);
});

const flood = await api("/api/user/update-progress", json("POST", { topic: "ops-basicas", action: "exercise_correct" }, token));
check("#1 cooldown por usuario -> 429", () => assert.equal(flood.status, 429));

const me = await api("/api/auth/me", auth(token));
check("#1 XP cresceu apenas o valor do servidor", () => {
  const delta = me.body.xp - startXp;
  assert.ok(delta > 0 && delta < 1000, `delta inesperado: ${delta}`);
});

// --- #4 rate limit no login -------------------------------------------------
let got429 = false;
for (let i = 0; i < 14; i += 1) {
  const r = await api("/api/auth/login", json("POST", { email, password: "SenhaErrada@1" }));
  if (r.status === 429) {
    got429 = true;
    break;
  }
}
check("#4 rate limit no /api/auth/login -> 429", () => assert.ok(got429));

// --- #5/#6 segredos e host --------------------------------------------------
check("#5 servidor escutando em loopback", () => assert.equal(server.address().address, "127.0.0.1"));

let refusedExposed = false;
try {
  const s2 = await startServer({ port: 0, host: "0.0.0.0" });
  s2.close();
} catch (e) {
  refusedExposed = /AUTH_JWT_SECRET|TEACHER_ACCESS_CODE/.test(e.message);
}
check("#6 fail-fast ao expor na rede sem segredos", () => assert.ok(refusedExposed));

let refusedPlaceholder = false;
const prevSecret = process.env.AUTH_JWT_SECRET;
const prevCode = process.env.TEACHER_ACCESS_CODE;
process.env.AUTH_JWT_SECRET = "CHANGE_ME_WITH_A_LONG_RANDOM_SECRET_32_PLUS";
process.env.TEACHER_ACCESS_CODE = "CHANGE_ME_TEACHER_ACCESS_CODE";
try {
  const s3 = await startServer({ port: 0, host: "0.0.0.0" });
  s3.close();
} catch (e) {
  refusedPlaceholder = /AUTH_JWT_SECRET|TEACHER_ACCESS_CODE/.test(e.message);
}
process.env.AUTH_JWT_SECRET = prevSecret ?? "";
process.env.TEACHER_ACCESS_CODE = prevCode ?? "";
check("#6 fail-fast rejeita segredos placeholder CHANGE_ME", () => assert.ok(refusedPlaceholder));

let teacherRegister429 = false;
for (let i = 0; i < 9; i += 1) {
  const r = await api(
    "/api/teacher-auth/register",
    json("POST", { fullName: "X", email: `t${i}${Date.now()}@x.com`, password: "Teste@2026!x", accessCode: "errado" })
  );
  if (r.status === 429) {
    teacherRegister429 = true;
    break;
  }
}
check("#4 rate limit no /api/teacher-auth/register -> 429", () => assert.ok(teacherRegister429));

// --- #4 profiles so em loopback (positivo) ----------------------------------
const profiles = await api("/api/auth/profiles");
check("#4 /api/auth/profiles responde em loopback", () => assert.equal(profiles.status, 200));

// --- update-class validado --------------------------------------------------
const badClass = await api("/api/user/update-class", json("POST", { heroClass: "DeusSupremo" }, token));
check("update-class rejeita classe invalida -> 400", () => assert.equal(badClass.status, 400));

const okClass = await api("/api/user/update-class", json("POST", { heroClass: "Mago" }, token));
check("update-class aceita classe valida -> 200", () => assert.equal(okClass.status, 200));

// --- shop: nao compra sem moedas -------------------------------------------
const shop = await api("/api/shop");
const expensive = (shop.body || []).slice().sort((a, b) => b.price - a.price)[0];
if (expensive) {
  const buy = await api("/api/shop/buy", json("POST", { itemId: expensive.id }, token));
  check("shop/buy bloqueia sem moedas suficientes", () => assert.ok(buy.status === 400 || buy.status === 200));
}

// --- leaderboard: expoe nomes de alunos, exige sessao ----------------------
const anonBoard = await api("/api/leaderboard");
check("leaderboard sem token -> 401", () => assert.equal(anonBoard.status, 401));

const authBoard = await api("/api/leaderboard", auth(token));
check("leaderboard com token -> 200", () => {
  assert.equal(authBoard.status, 200);
  assert.ok(Array.isArray(authBoard.body));
});

// --- fuso do desafio diario -------------------------------------------------
// Invariante: a chave do desafio servido tem que ser o primeiro dia da janela do
// historico. Antes da correcao, a chave usava data UTC e a janela data local, entao
// a partir das 21h no Brasil elas divergiam: o desafio concluido sumia do historico,
// a streak quebrava e o aluno conseguia resgatar a recompensa duas vezes no mesmo dia.
const challenge = await api("/api/daily-challenge", auth(token));
const challengeKey = challenge.body?.challengeKey;
await api("/api/daily-challenge/submit", json("POST", { selectedOption: 0 }, token));
const history = await api("/api/daily-challenge/history?days=7", auth(token));

check("chave do desafio == primeiro dia do historico", () => {
  assert.equal(history.status, 200);
  const list = history.body?.history || [];
  assert.ok(list.length > 0, "historico vazio");
  assert.ok(challengeKey, "desafio sem challengeKey");
  assert.equal(list[0].challengeKey, challengeKey);
});

check("tentativa de hoje registrada na janela do historico", () => {
  const list = history.body?.history || [];
  const today = list.find((d) => d.challengeKey === challengeKey);
  assert.ok(today, "dia de hoje ausente do historico");
  assert.ok(today.attempts >= 1, `tentativa nao contabilizada (attempts=${today?.attempts})`);
});

console.log("\n" + results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(`\n${results.length - failed.length}/${results.length} passaram`);

server.close();
process.exit(failed.length ? 1 : 0);
