// Valida a preparacao para servidor remoto:
//  1. modo local (padrao de hoje) nao muda;
//  2. modo remoto injeta a URL no HTML;
//  3. CORS aceita loopback e recusa origem desconhecida.
//
// Requer build previo:
//   npm run rebuild:native:node && npm run build && node scripts/build-server.mjs
//   node scripts/smoke-remote.mjs
import assert from "node:assert/strict";
import { startServer } from "../build/server.mjs";

process.env.NODE_ENV = "production";
process.env.GROWING_MATH_AUTOSTART = "false";
process.env.GROWING_MATH_DEMO = "true";

async function withServer(env, fn) {
  for (const [key, value] of Object.entries(env)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  const server = await startServer({ port: 0, host: "127.0.0.1" });
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let passed = 0;
const check = (label, condition) => {
  assert.ok(condition, `FALHOU: ${label}`);
  console.log(`  ok  ${label}`);
  passed += 1;
};

console.log("modo local (API_BASE_URL vazio)");
await withServer({ API_BASE_URL: null }, async (base) => {
  const html = await (await fetch(base + "/")).text();
  check("HTML injeta config vazia", html.includes('apiBaseUrl:""'));
  check("config vem antes do bundle", html.indexOf("__GROWING_MATH_CONFIG__") < html.indexOf("<script type=\"module\""));
  const shop = await fetch(base + "/api/shop");
  check("API local continua respondendo", shop.status === 200);

  const missing = await fetch(base + "/api/rota-que-nao-existe");
  check("rota /api inexistente devolve 404", missing.status === 404);
  check("rota /api inexistente devolve JSON", (missing.headers.get("content-type") || "").includes("application/json"));

  const page = await fetch(base + "/alguma/rota/do/front");
  check("rota do front continua caindo no index", page.status === 200);
});

console.log("modo remoto (API_BASE_URL definido)");
await withServer({ API_BASE_URL: "https://api.growingmath.example.com/" }, async (base) => {
  const html = await (await fetch(base + "/")).text();
  check("HTML injeta a URL remota", html.includes('apiBaseUrl:"https://api.growingmath.example.com"'));
  check("barra final removida", !html.includes('example.com/"'));
  const teacher = await (await fetch(base + "/teacher.html")).text();
  check("teacher.html tambem recebe a config", teacher.includes("__GROWING_MATH_CONFIG__"));
});

console.log("CORS");
await withServer({ API_BASE_URL: null }, async (base) => {
  const loopback = await fetch(base + "/api/shop", {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:54321", "Access-Control-Request-Method": "GET" },
  });
  check("preflight de loopback aceito", loopback.status === 204);
  check("eco da origem loopback", loopback.headers.get("access-control-allow-origin") === "http://127.0.0.1:54321");
  check("permite header Authorization", (loopback.headers.get("access-control-allow-headers") || "").includes("Authorization"));

  const evil = await fetch(base + "/api/shop", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "GET" },
  });
  check("preflight de origem desconhecida recusado", evil.status === 403);
  check("sem allow-origin para origem desconhecida", evil.headers.get("access-control-allow-origin") === null);

  const same = await fetch(base + "/api/shop");
  check("requisicao sem Origin segue normal", same.status === 200);
});

console.log("CORS com allowlist explicita");
await withServer({ CORS_ALLOWED_ORIGINS: "https://app.growingmath.example.com", CORS_ALLOW_LOOPBACK: "false" }, async (base) => {
  const allowed = await fetch(base + "/api/shop", {
    method: "OPTIONS",
    headers: { Origin: "https://app.growingmath.example.com", "Access-Control-Request-Method": "GET" },
  });
  check("origem da allowlist aceita", allowed.status === 204);

  const blocked = await fetch(base + "/api/shop", {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:54321", "Access-Control-Request-Method": "GET" },
  });
  check("loopback recusado quando desligado", blocked.status === 403);
});

console.log(`\n${passed}/${passed} asserçoes passaram.`);

// O servidor deixa handles abertos (banco, timers de rate limit) que mantem o
// event loop vivo; sem isto o script trava depois de passar em tudo.
process.exit(0);
