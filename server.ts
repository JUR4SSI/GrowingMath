import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";
import http from "http";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dbPath = process.env.GROWING_MATH_DB_PATH || path.resolve(process.cwd(), "growing_math.db");
const db = new Database(dbPath);

type AiExercise = {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
};

let aiClient: GoogleGenAI | null = null;
let cachedOllamaModel: string | null = null;
let cachedOllamaModelAt = 0;

type AiProvider = "auto" | "gemini" | "ollama";

type EquipSlot = "accessory" | "armor" | "weapon_1h" | "weapon_2h" | "shield";

const EQUIP_LIMITS: Record<EquipSlot, number> = {
  accessory: 2,
  armor: 1,
  weapon_1h: 2,
  weapon_2h: 1,
  shield: 1,
};

function getGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || "").trim();
}

function getAiProvider(): AiProvider {
  const raw = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  if (raw === "gemini" || raw === "ollama") return raw;
  return "auto";
}

function getOllamaBaseUrl(): string {
  return String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/$/, "");
}

function getOllamaModelFromEnv(): string {
  return String(process.env.OLLAMA_MODEL || "").trim();
}

// ---------------------------------------------------------------------------
// Preparacao para hospedar a API (AWS) mantendo o app rodando localmente.
//
// Modo local (padrao de hoje): API_BASE_URL vazio -> o front usa caminhos
// relativos e fala com este mesmo processo. Nada muda.
//
// Modo remoto: API_BASE_URL aponta para o servidor hospedado. O Express local
// continua servindo apenas a interface e injeta essa URL no HTML; as chamadas
// /api saem para a nuvem, onde ficam o banco e as credenciais.
// ---------------------------------------------------------------------------

function getApiBaseUrl(): string {
  return String(process.env.API_BASE_URL || "").trim().replace(/\/+$/, "");
}

function escapeForScriptTag(value: string): string {
  // "</script>" dentro do JSON encerraria a tag no meio da injecao, e "<!--"
  // abriria um comentario HTML. Ambos permitiriam injecao de marcacao.
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function injectRuntimeConfig(html: string): string {
  const snippet = `<script>window.__GROWING_MATH_CONFIG__={apiBaseUrl:${escapeForScriptTag(getApiBaseUrl())}};</script>`;

  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${snippet}`);
  }
  // Sem <head> o script vai antes de qualquer bundle, que e o que importa:
  // window.__GROWING_MATH_CONFIG__ precisa existir antes do app iniciar.
  return `${snippet}${html}`;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    const host = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

// Em modo remoto o navegador roda em http://127.0.0.1:<porta efemera>, que muda
// a cada inicializacao do app - por isso qualquer origem loopback e aceita por
// padrao. A autenticacao e por Bearer token no header, nao por cookie, entao
// nao ha risco de CSRF vindo de outro site: um site malicioso nao tem o token.
function corsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const origin = String(req.headers.origin || "");
  if (!origin) return next();

  const allowList = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const allowLoopback = String(process.env.CORS_ALLOW_LOOPBACK || "true").toLowerCase() !== "false";
  const normalized = origin.replace(/\/+$/, "");
  const allowed = allowList.includes(normalized) || (allowLoopback && isLoopbackOrigin(normalized));

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  // Sempre: respostas variam conforme a origem e nao podem ser cacheadas juntas.
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.sendStatus(allowed ? 204 : 403);
    return;
  }

  next();
}

// Sondagem de disponibilidade: precisa falhar rapido para nao travar a UI.
const OLLAMA_PROBE_TIMEOUT_MS = 5_000;

// Geracao de texto: um modelo local em CPU leva dezenas de segundos. O valor
// antigo (12s) abortava quase toda geracao e caia no fallback silenciosamente.
function getOllamaGenerationTimeoutMs(): number {
  const raw = Number(process.env.OLLAMA_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 600_000) return raw;
  return 120_000;
}

function extractFirstJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Resposta sem JSON valido.");
}

async function ollamaRequest<T>(pathName: string, body?: unknown, timeoutMs = OLLAMA_PROBE_TIMEOUT_MS): Promise<T> {
  const baseUrl = getOllamaBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Ollama ${pathName} failed: ${response.status} ${txt}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

let warnedMissingEnvModel = false;

async function listOllamaModels(): Promise<string[]> {
  const payload = await ollamaRequest<{ models?: Array<{ name?: string }> }>("/api/tags");
  return (payload.models || []).map((m) => String(m.name || "").trim()).filter(Boolean);
}

function pickPreferredModel(available: string[]): string | null {
  if (available.length === 0) return null;
  const preferredOrder = ["qwen2.5", "llama3.2", "llama3.1", "mistral", "tinyllama"];
  return (
    preferredOrder
      .map((prefix) => available.find((m) => m.startsWith(prefix)))
      .find(Boolean) || available[0]
  );
}

async function detectOllamaModel(): Promise<string | null> {
  const envModel = getOllamaModelFromEnv();

  const now = Date.now();
  if (cachedOllamaModel && now - cachedOllamaModelAt < 60_000) {
    return cachedOllamaModel;
  }

  let available: string[];
  try {
    available = await listOllamaModels();
  } catch (error) {
    // Ollama fora do ar: sem lista para validar, confia no que foi configurado.
    if (envModel) return envModel;
    throw error;
  }

  if (envModel) {
    // Um OLLAMA_MODEL com nome errado fazia toda requisicao falhar sem aviso.
    // "qwen2.5:3b" tambem casa com a tag publicada como "qwen2.5:3b-instruct".
    const match = available.find((m) => m === envModel || m.startsWith(`${envModel}-`) || m.startsWith(`${envModel}:`));
    if (match) {
      cachedOllamaModel = match;
      cachedOllamaModelAt = now;
      return match;
    }

    if (!warnedMissingEnvModel) {
      warnedMissingEnvModel = true;
      console.warn(
        `[ai] OLLAMA_MODEL="${envModel}" nao esta instalado no Ollama. Instalados: ${available.join(", ") || "nenhum"}. Usando deteccao automatica.`
      );
    }
  }

  const picked = pickPreferredModel(available);
  if (!picked) return null;

  cachedOllamaModel = picked;
  cachedOllamaModelAt = now;
  return picked;
}

function buildOfflineTutorResponse(message: string): string {
  const prompt = message.trim();
  if (!prompt) {
    return "Me diga sua duvida e eu te ajudo passo a passo com exemplos simples.";
  }

  const lower = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const topicHints: string[] = [];
  if (/(fracao|fracoes)/.test(lower)) topicHints.push("fracao");
  if (/(porcent|percent)/.test(lower)) topicHints.push("porcentagem");
  if (/(equacao|x\s*=|1o\s*grau)/.test(lower)) topicHints.push("equacao");
  if (/(area|perimetro|triangulo|retangulo|geometr)/.test(lower)) topicHints.push("geometria");
  if (/(regra\s*de\s*3|proporcao)/.test(lower)) topicHints.push("proporcao");

  if (topicHints.includes("fracao")) {
    return [
      "Estou no modo offline, mas consigo te ajudar agora.",
      "Para resolver fracoes:",
      "1) Identifique numerador e denominador.",
      "2) Se for soma/subtracao, iguale os denominadores.",
      "3) Se for multiplicacao, multiplique numeradores e denominadores.",
      "4) Simplifique no final.",
      "Exemplo rapido: 1/3 + 1/6 = 2/6 + 1/6 = 3/6 = 1/2.",
      "Se quiser, eu resolvo sua questao exata linha por linha.",
    ].join("\n");
  }

  if (topicHints.includes("porcentagem")) {
    return [
      "Estou no modo offline, mas vamos resolver.",
      "Regra base de porcentagem: valor x taxa/100.",
      "Exemplo: 15% de 200 = 200 x 15/100 = 30.",
      "Aumento: novo = valor + percentual do valor.",
      "Desconto: novo = valor - percentual do valor.",
      "Me envie os numeros da sua questao e eu calculo com voce.",
    ].join("\n");
  }

  if (topicHints.includes("equacao")) {
    return [
      "Estou no modo offline, mas consigo te orientar.",
      "Para equacoes de 1o grau:",
      "1) Organize termos com x de um lado e numeros do outro.",
      "2) Some/subtraia para simplificar.",
      "3) Divida pelo coeficiente de x.",
      "Exemplo: 3x + 5 = 17 => 3x = 12 => x = 4.",
      "Se voce mandar a equacao completa, eu resolvo passo a passo.",
    ].join("\n");
  }

  return [
    "Estou no modo offline (sem chave de IA), mas posso te ensinar normalmente.",
    "Me passe a questao completa e eu respondo neste formato:",
    "1) O que a questao pede",
    "2) Estrategia",
    "3) Calculo passo a passo",
    "4) Conferencia do resultado",
    "5) Dica para nao errar de novo",
  ].join("\n");
}

function getAiClient(): GoogleGenAI {
  if (aiClient) return aiClient;
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Chave GEMINI_API_KEY ausente.");
  }

  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function pickOne<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function formatExercise(question: string, correct: number, distractors: number[], explanation: string): AiExercise {
  const allOptions = shuffle([correct, ...distractors]).map(String);
  return {
    question,
    options: allOptions,
    correctAnswerIndex: allOptions.indexOf(String(correct)),
    explanation,
  };
}

function createNumericDistractors(correct: number, candidates: number[]): number[] {
  const unique: number[] = [];
  for (const raw of candidates) {
    const value = Math.max(0, Math.round(raw));
    if (value === correct || unique.includes(value)) continue;
    unique.push(value);
    if (unique.length === 3) break;
  }

  let delta = 1;
  while (unique.length < 3) {
    const candidate = Math.max(0, correct + (delta % 2 === 0 ? delta : -delta));
    if (candidate !== correct && !unique.includes(candidate)) {
      unique.push(candidate);
    }
    delta += 1;
  }

  return unique;
}

function getComplexityGuide(level: number): string {
  if (level <= 3) return "Nivel iniciante: 1 etapa de calculo, numeros pequenos e linguagem simples.";
  if (level <= 7) return "Nivel intermediario: 2 etapas de calculo, possivel uso de porcentagem ou proporcao simples.";
  if (level <= 12) return "Nivel avancado: 2-3 etapas, combinando conceitos e exigindo interpretacao do contexto.";
  return "Nivel especialista: problema multi-etapas com validacao de unidade e analise de resultado.";
}

type CanonicalTopic =
  | "trigonometria"
  | "equacoes-1"
  | "funcoes"
  | "calculo-intro"
  | "fracoes"
  | "geometria-basica"
  | "ops-basicas"
  | "unknown";

function normalizeTopicText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveCanonicalTopic(topic: string): CanonicalTopic {
  const normalized = normalizeTopicText(topic);

  if (/(trigonometria|trigon|seno|cosseno|tangente)/.test(normalized)) return "trigonometria";
  if (/(equacoes-1|equac|1o\s*grau|1º\s*grau|incognita)/.test(normalized)) return "equacoes-1";
  if (/(funcoes|funcao|funcao afim|f\(x\)|coeficiente\s*angular|coeficiente\s*linear|grafico)/.test(normalized)) return "funcoes";
  if (/(calculo-intro|calculo|derivada|limite|taxa\s*de\s*variac)/.test(normalized)) return "calculo-intro";
  if (/(fracoes|fracao|denominador|numerador)/.test(normalized)) return "fracoes";
  if (/(geometria-basica|geometr|area|perimetro|triangulo|retangulo|poligono|circulo|angulo)/.test(normalized)) return "geometria-basica";
  if (/(ops-basicas|operacoes\s*basicas|soma|subtracao|multiplicacao|divisao)/.test(normalized)) return "ops-basicas";

  return "unknown";
}

function getTopicFocusInstruction(topic: string): string {
  const canonical = resolveCanonicalTopic(topic);

  if (canonical === "trigonometria") {
    return "Foco obrigatorio em trigonometria: use seno, cosseno ou tangente em triangulo retangulo com cateto oposto/adjacente/hipotenusa.";
  }

  if (canonical === "equacoes-1") {
    return "Foco obrigatorio em equacao de 1o grau: inclua isolamento de x, podendo ter parenteses ou termos em ambos os lados.";
  }

  if (canonical === "funcoes") {
    return "Foco obrigatorio em funcoes afins: use f(x)=ax+b, leitura de coeficientes, raiz, variacao e comparacao entre duas funcoes.";
  }

  if (canonical === "calculo-intro") {
    return "Foco obrigatorio em calculo introdutorio: limite simples, taxa media de variacao e derivada basica de polinomios.";
  }

  if (canonical === "fracoes") {
    return "Foco obrigatorio em fracoes: equivalencia, fracao de quantidade, soma/subtracao com mesmo denominador e parte restante.";
  }

  if (canonical === "geometria-basica") {
    return "Foco obrigatorio em geometria basica: area, perimetro, angulos e propriedades de figuras planas.";
  }

  return "";
}

function isExerciseAlignedWithTopic(exercise: AiExercise, topic: string): boolean {
  const canonical = resolveCanonicalTopic(topic);
  if (canonical === "unknown" || canonical === "ops-basicas") return true;

  const merged = normalizeTopicText(
    `${exercise.question} ${exercise.explanation} ${exercise.options.join(" ")}`
  );

  const topicPatterns: Record<Exclude<CanonicalTopic, "unknown" | "ops-basicas">, RegExp> = {
    "trigonometria": /(seno|sen\(|cosseno|cos\(|tangente|tan\(|hipotenusa|cateto|triangulo\s*retang)/,
    "equacoes-1": /(equac|incognita|x\s*=|resolva\s*para\s*x|isole\s*o\s*x)/,
    "funcoes": /(funcao|f\(x\)|grafico|coeficiente\s*angular|coeficiente\s*linear|raiz\s*da\s*funcao)/,
    "calculo-intro": /(limite|derivad|taxa\s*de\s*variac|reta\s*tangente)/,
    "fracoes": /(fracao|denominador|numerador|equivalent|simplifiqu)/,
    "geometria-basica": /(area|perimetro|triangulo|retangulo|angulo|poligono|circulo)/,
  };

  return topicPatterns[canonical].test(merged);
}

function fallbackExercise(topic: string, level: number): AiExercise {
  const normalizedTopic = topic.toLowerCase();
  const difficultyBoost = Math.max(0, Math.min(level, 12));
  const progressionLevel = Math.max(1, Math.min(10, level));
  const isAdvanced = level >= 8;
  const isGeometryTopic = /(geometr|triang|retang|perimet|area|angulo|circul|poligon)/.test(normalizedTopic);
  const isFractionTopic = /(fraca|fracoes|fracao)/.test(normalizedTopic);
  const isFunctionsTopic = /(func|funcao|funcoes|afim|graf|coeficiente\s*angular|coeficiente\s*linear)/.test(normalizedTopic);
  const isCalculusTopic = /(calculo|derivad|limite|taxa\s*de\s*variac|taxa\s*media|reta\s*tangente)/.test(normalizedTopic);
  const isEquationTopic = /(equac|1o\s*grau|1º\s*grau|incogn|x\s*=)/.test(normalizedTopic);
  const isTrigonometryTopic = /(trigon|seno|coss|cosseno|tang|triangulo\s*retang|cateto|hipotenusa)/.test(normalizedTopic);
  const isPercentageTopic = /(porcent|percent|desconto|acrescimo|juros)/.test(normalizedTopic);
  const isProportionTopic = /(regra\s*de\s*3|proporc|escala|taxa|razao)/.test(normalizedTopic);
  const isTimeTopic = /(tempo|hora|minut|veloc|distanc)/.test(normalizedTopic);

  const arithmeticTemplates: Array<() => AiExercise> = [
    () => {
      const notebooks = randInt(8 + difficultyBoost, 20 + difficultyBoost * 2);
      const pens = randInt(4 + difficultyBoost, 14 + difficultyBoost);
      const correct = notebooks + pens;
      return formatExercise(
        `Na papelaria, Ana comprou ${notebooks} cadernos e ${pens} canetas. Quantos itens ela comprou ao todo?`,
        correct,
        createNumericDistractors(correct, [correct + pens, correct - pens, notebooks - pens]),
        "Somamos as quantidades dos dois grupos para obter o total."
      );
    },
    () => {
      const totalSeats = randInt(40, 90);
      const occupied = randInt(10, totalSeats - 8);
      const correct = totalSeats - occupied;
      return formatExercise(
        `Um teatro tem ${totalSeats} lugares e ${occupied} estao ocupados. Quantos lugares estao livres?`,
        correct,
        createNumericDistractors(correct, [totalSeats + occupied, occupied - 2, correct + 6]),
        "Para saber os lugares livres, fazemos total - ocupados."
      );
    },
    () => {
      const boxes = randInt(5, 14 + Math.floor(difficultyBoost / 2));
      const ballsPerBox = randInt(3, 9 + Math.floor(difficultyBoost / 3));
      const correct = boxes * ballsPerBox;
      return formatExercise(
        `Em uma gincana, ha ${boxes} caixas com ${ballsPerBox} bolinhas em cada uma. Quantas bolinhas ha no total?`,
        correct,
        createNumericDistractors(correct, [boxes + ballsPerBox, correct - boxes, correct + ballsPerBox]),
        "Quando ha grupos iguais, usamos multiplicacao: quantidade de grupos x itens por grupo."
      );
    },
    () => {
      const totalBudget = randInt(90, 260 + difficultyBoost * 4);
      const spentMorning = randInt(25, Math.floor(totalBudget * 0.45));
      const spentAfternoon = randInt(15, Math.floor(totalBudget * 0.35));
      const correct = totalBudget - spentMorning - spentAfternoon;
      return formatExercise(
        `Para organizar uma feira escolar, a turma tinha R$ ${totalBudget}. Foram gastos R$ ${spentMorning} pela manha e R$ ${spentAfternoon} a tarde. Quanto sobrou?`,
        correct,
        createNumericDistractors(correct, [totalBudget - spentMorning, spentMorning + spentAfternoon, correct + randInt(8, 20)]),
        "Quando ha dois gastos, somamos os gastos e subtraimos do valor inicial."
      );
    },
    () => {
      const laps = randInt(4, 10);
      const meters = randInt(180, 450);
      const extra = randInt(60, 180);
      const correct = laps * meters + extra;
      return formatExercise(
        `Em um treino, Beatriz correu ${laps} voltas de ${meters} m e depois mais ${extra} m. Quantos metros ela percorreu no total?`,
        correct,
        createNumericDistractors(correct, [laps * meters, meters + extra, correct - meters]),
        "Primeiro calculamos a distancia das voltas e depois somamos a distancia extra."
      );
    },
  ];

  if (isTrigonometryTopic) {
    const trigFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const triples = pickOne([
          { opp: 3, adj: 4, hyp: 5 },
          { opp: 5, adj: 12, hyp: 13 },
          { opp: 6, adj: 8, hyp: 10 },
        ]);
        const k = randInt(1, 3);
        const hyp = triples.hyp * k;
        const correct = triples.opp * k;
        return formatExercise(
          `Em um triangulo retangulo, para o angulo theta vale sen(theta) = ${triples.opp}/${triples.hyp}. Se a hipotenusa mede ${hyp} cm, qual e o cateto oposto?`,
          correct,
          createNumericDistractors(correct, [triples.adj * k, hyp - correct, correct + triples.opp]),
          "Usamos sen(theta) = cateto oposto / hipotenusa. Entao cateto oposto = sen(theta) x hipotenusa."
        );
      },
      () => {
        const triples = pickOne([
          { opp: 3, adj: 4, hyp: 5 },
          { opp: 5, adj: 12, hyp: 13 },
          { opp: 6, adj: 8, hyp: 10 },
        ]);
        const k = randInt(1, 3);
        const hyp = triples.hyp * k;
        const correct = triples.adj * k;
        return formatExercise(
          `Num triangulo retangulo, cos(theta) = ${triples.adj}/${triples.hyp}. Se a hipotenusa vale ${hyp} m, quanto mede o cateto adjacente?`,
          correct,
          createNumericDistractors(correct, [triples.opp * k, hyp - correct, correct + triples.opp]),
          "Aplicamos cos(theta) = cateto adjacente / hipotenusa."
        );
      },
      () => {
        const pairs = pickOne([
          { opp: 3, adj: 4 },
          { opp: 5, adj: 2 },
          { opp: 4, adj: 3 },
        ]);
        const k = randInt(1, 3);
        const adj = pairs.adj * k;
        const correct = pairs.opp * k;
        return formatExercise(
          `Para um angulo theta, tg(theta) = ${pairs.opp}/${pairs.adj}. Se o cateto adjacente mede ${adj} m, qual e o cateto oposto?`,
          correct,
          createNumericDistractors(correct, [adj, correct + pairs.adj, Math.max(1, correct - pairs.opp)]),
          "Como tg(theta) = oposto/adjacente, temos oposto = tg(theta) x adjacente."
        );
      },
    ];

    const trigIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const base = randInt(6, 18);
        const ratio = pickOne([
          { num: 3, den: 4 },
          { num: 2, den: 3 },
          { num: 4, den: 5 },
        ]);
        const correct = Math.round((base * ratio.num) / ratio.den);
        return formatExercise(
          `Uma rampa forma um angulo theta com o solo e vale tg(theta) = ${ratio.num}/${ratio.den}. Se a base horizontal mede ${base} m, qual altura aproximada a rampa alcanca?`,
          correct,
          createNumericDistractors(correct, [base, base + correct, Math.max(1, correct - ratio.num)]),
          "A tangente relaciona altura e base: tg(theta) = altura/base."
        );
      },
      () => {
        const adj = randInt(9, 24);
        const ratio = pickOne([
          { num: 4, den: 5 },
          { num: 3, den: 5 },
          { num: 5, den: 13 },
        ]);
        const correct = Math.round((adj * ratio.den) / ratio.num);
        return formatExercise(
          `Em um triangulo retangulo, cos(theta) = ${ratio.num}/${ratio.den}. Se o cateto adjacente vale ${adj} cm, qual e a hipotenusa?`,
          correct,
          createNumericDistractors(correct, [adj, correct - ratio.num, correct + ratio.den]),
          "Reorganizamos cos(theta) = adjacente/hipotenusa para hipotenusa = adjacente/cos(theta)."
        );
      },
      () => {
        const opp = randInt(8, 22);
        const ratio = pickOne([
          { num: 3, den: 5 },
          { num: 5, den: 13 },
          { num: 8, den: 17 },
        ]);
        const correct = Math.round((opp * ratio.den) / ratio.num);
        return formatExercise(
          `Para um angulo theta em triangulo retangulo, sen(theta) = ${ratio.num}/${ratio.den}. Se o cateto oposto mede ${opp} m, qual e a hipotenusa?`,
          correct,
          createNumericDistractors(correct, [opp, correct + ratio.num, Math.max(1, correct - ratio.den)]),
          "Usamos sen(theta) = oposto/hipotenusa e isolamos a hipotenusa."
        );
      },
    ];

    const trigAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const opposite = randInt(6, 18);
        const adjacent = randInt(8, 20);
        const hypotenuse = Math.round(Math.sqrt(opposite * opposite + adjacent * adjacent));
        const correct = hypotenuse;
        return formatExercise(
          `Em um triangulo retangulo, os catetos medem ${opposite} cm e ${adjacent} cm. Qual e a hipotenusa aproximada?`,
          correct,
          createNumericDistractors(correct, [opposite + adjacent, Math.abs(adjacent - opposite), correct + 2]),
          "Aplicamos o teorema de Pitagoras para obter a hipotenusa."
        );
      },
      () => {
        const base = randInt(10, 35);
        const angleTan = pickOne([
          { num: 1, den: 1, label: "45" },
          { num: 3, den: 4, label: "aprox. 37" },
          { num: 4, den: 3, label: "aprox. 53" },
        ]);
        const height = Math.round((base * angleTan.num) / angleTan.den);
        return formatExercise(
          `Uma escada faz angulo de ${angleTan.label} graus com o chao (tg(theta) = ${angleTan.num}/${angleTan.den}). Se a base esta a ${base} m da parede, qual altura aproximada a escada alcanca?`,
          height,
          createNumericDistractors(height, [base, height + randInt(2, 6), Math.max(1, height - randInt(2, 5))]),
          "Usamos tg(theta) = altura/base e isolamos a altura."
        );
      },
      () => {
        const hyp = randInt(20, 60);
        const cosRatio = pickOne([
          { num: 3, den: 5 },
          { num: 4, den: 5 },
          { num: 5, den: 13 },
        ]);
        const adj = Math.round((hyp * cosRatio.num) / cosRatio.den);
        const opp = Math.round(Math.sqrt(Math.max(1, hyp * hyp - adj * adj)));
        const correct = opp;
        return formatExercise(
          `Num triangulo retangulo, a hipotenusa mede ${hyp} cm e cos(theta) = ${cosRatio.num}/${cosRatio.den}. Qual e o cateto oposto aproximado a theta?`,
          correct,
          createNumericDistractors(correct, [adj, hyp - adj, correct + randInt(2, 5)]),
          "Primeiro achamos o adjacente com o cosseno e depois aplicamos Pitagoras para achar o oposto."
        );
      },
    ];

    const trigTemplates = progressionLevel <= 3
      ? trigFoundationalTemplates
      : progressionLevel <= 6
        ? trigIntermediateTemplates
        : trigAdvancedTemplates;

    return pickOne(trigTemplates)();
  }

  if (isGeometryTopic) {
    const geometryFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const width = randInt(3, 12 + Math.floor(difficultyBoost / 2));
        const height = randInt(2, 10 + Math.floor(difficultyBoost / 2));
        const area = width * height;
        return formatExercise(
          `Um jardim retangular mede ${width} m de largura e ${height} m de comprimento. Qual e a area do jardim em m2?`,
          area,
          createNumericDistractors(area, [2 * (width + height), width + height, area + width]),
          "Area do retangulo = base x altura."
        );
      },
      () => {
        const side = randInt(4, 14 + Math.floor(difficultyBoost / 3));
        const perimeter = 4 * side;
        return formatExercise(
          `Uma praca em formato de quadrado tem lado de ${side} m. Qual e o perimetro dessa praca?`,
          perimeter,
          createNumericDistractors(perimeter, [side * side, side + 4, perimeter + side]),
          "Perimetro do quadrado = 4 x lado."
        );
      },
      () => {
        const base = randInt(4 + Math.floor(difficultyBoost / 4), 12 + Math.floor(difficultyBoost / 2));
        const height = randInt(3 + Math.floor(difficultyBoost / 5), 10 + Math.floor(difficultyBoost / 3));
        const area = Math.round((base * height) / 2);
        return formatExercise(
          `Um telhado triangular tem base ${base} m e altura ${height} m. Qual e a area desse triangulo em m2?`,
          area,
          createNumericDistractors(area, [base * height, base + height, area + base]),
          "Area do triangulo = (base x altura) / 2."
        );
      },
    ];

    const geometryIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const width = randInt(5, 18);
        const height = randInt(4, 16);
        const perimeter = 2 * (width + height);
        return formatExercise(
          `Uma quadra retangular mede ${width} m por ${height} m. Quantos metros de tela sao necessarios para cercar todo o contorno?`,
          perimeter,
          createNumericDistractors(perimeter, [width * height, width + height, perimeter + height]),
          "Para cercar o contorno usamos o perimetro: 2 x (comprimento + largura)."
        );
      },
      () => {
        const side = randInt(6, 20);
        const tileArea = side * side;
        return formatExercise(
          `Um piso quadrado tem lado de ${side} cm. Qual area de UMA peca desse piso em cm2?`,
          tileArea,
          createNumericDistractors(tileArea, [4 * side, side + side, tileArea + side]),
          "Area do quadrado = lado x lado."
        );
      },
      () => {
        const r = randInt(3, 10);
        const correct = Math.round(2 * 3.14 * r);
        return formatExercise(
          `Uma pista circular tem raio ${r} m. Qual e o comprimento aproximado da borda (use pi=3,14)?`,
          correct,
          createNumericDistractors(correct, [Math.round(3.14 * r * r), 2 * r, correct + randInt(3, 12)]),
          "Comprimento da circunferencia: C = 2*pi*r."
        );
      },
    ];

    const geometryAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const baseB = randInt(10, 26);
        const baseb = randInt(4, 12);
        const h = randInt(5, 14);
        const correct = Math.round(((baseB + baseb) * h) / 2);
        return formatExercise(
          `Um terreno em forma de trapezio tem bases ${baseB} m e ${baseb} m, com altura ${h} m. Qual e sua area?`,
          correct,
          createNumericDistractors(correct, [baseB * h, baseb * h, correct + randInt(8, 20)]),
          "Area do trapezio: A = (B+b)*h/2."
        );
      },
      () => {
        const side = randInt(6, 16);
        const apothem = randInt(4, 11);
        const perimeter = 5 * side;
        const correct = Math.round((perimeter * apothem) / 2);
        return formatExercise(
          `Um pentagono regular tem lado ${side} cm e apotema ${apothem} cm. Qual e a area aproximada?`,
          correct,
          createNumericDistractors(correct, [perimeter * apothem, 5 * side * side, correct - randInt(5, 12)]),
          "Para poligono regular: A = perimetro*apotema/2."
        );
      },
      () => {
        const l = randInt(3, 9);
        const w = randInt(2, 7);
        const h = randInt(2, 8);
        const correct = 2 * (l * w + l * h + w * h);
        return formatExercise(
          `Uma caixa retangular mede ${l} cm x ${w} cm x ${h} cm. Qual e a area total da superficie?`,
          correct,
          createNumericDistractors(correct, [l * w * h, 2 * (l + w + h), correct + randInt(6, 16)]),
          "Area total do paralelepipedo: 2(lw + lh + wh)."
        );
      },
    ];

    const geometryTemplates = progressionLevel <= 3
      ? geometryFoundationalTemplates
      : progressionLevel <= 6
        ? geometryIntermediateTemplates
        : geometryAdvancedTemplates;

    return pickOne(geometryTemplates)();
  }

  if (isFunctionsTopic) {
    const functionsFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const a = pickOne([1, 2, 3]);
        const b = randInt(1, 8);
        const x = randInt(1, 7);
        const correct = a * x + b;
        return formatExercise(
          `Considere a funcao f(x) = ${a}x + ${b}. Qual e o valor de f(${x})?`,
          correct,
          createNumericDistractors(correct, [a + x + b, a * (x + b), correct + a]),
          "Substituimos x pelo valor dado e calculamos f(x)."
        );
      },
      () => {
        const b = randInt(2, 9);
        const correct = b;
        return formatExercise(
          `Na funcao afim f(x) = 3x + ${b}, qual e o valor de f(0)?`,
          correct,
          createNumericDistractors(correct, [3 + b, b + 1, Math.max(0, b - 2)]),
          "Em f(0), o termo com x zera e sobra apenas o coeficiente linear."
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 6);
        const x1 = randInt(1, 4);
        const x2 = x1 + 1;
        const y1 = a * x1 + b;
        const y2 = a * x2 + b;
        const correct = y2 - y1;
        return formatExercise(
          `Para a funcao f(x) = ${a}x + ${b}, quanto f(x) aumenta quando x passa de ${x1} para ${x2}?`,
          correct,
          createNumericDistractors(correct, [a + b, y2, y1]),
          "Numa funcao afim, o crescimento por +1 em x e igual ao coeficiente angular a."
        );
      },
    ];

    const functionsIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(3, 12);
        const y = randInt(20, 45);
        const correct = Math.round((y - b) / a);
        const adjustedY = a * correct + b;
        return formatExercise(
          `Na funcao f(x) = ${a}x + ${b}, para qual valor de x temos f(x) = ${adjustedY}?`,
          correct,
          createNumericDistractors(correct, [correct + 1, Math.max(0, correct - 2), correct + 3]),
          "Resolvemos ${a}x + ${b} = ${adjustedY} para encontrar x."
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const b = randInt(-3, 5);
        const correct = a;
        return formatExercise(
          `Qual e o coeficiente angular da funcao g(x) = ${a}x ${b >= 0 ? "+" : "-"} ${Math.abs(b)}?`,
          correct,
          createNumericDistractors(correct, [b, a + b, Math.abs(b)]),
          "No modelo ax + b, o coeficiente angular e o numero que multiplica x."
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 8);
        const target = randInt(2, 6);
        const correct = a * target + b;
        return formatExercise(
          `Uma maquina segue a regra y = ${a}x + ${b}. Quando x = ${target}, qual sera a saida y?`,
          correct,
          createNumericDistractors(correct, [a * target, correct + b, correct - a]),
          "Aplicamos diretamente a regra da funcao para o valor de entrada x."
        );
      },
    ];

    const functionsAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const a1 = pickOne([2, 3, 4]);
        const b1 = randInt(1, 8);
        const a2 = pickOne([1, 2]);
        const b2 = randInt(9, 18);
        const correct = Math.round((b2 - b1) / (a1 - a2));
        const adjustedB2 = (a1 - a2) * correct + b1;
        return formatExercise(
          `As funcoes f(x) = ${a1}x + ${b1} e g(x) = ${a2}x + ${adjustedB2}. Em qual x elas tem o mesmo valor?`,
          correct,
          createNumericDistractors(correct, [correct + 1, Math.max(0, correct - 1), correct + 3]),
          "Igualamos f(x) e g(x) e resolvemos a equacao resultante."
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const b = randInt(-6, 4);
        const correct = Math.round(-b / a);
        const adjustedB = -a * correct;
        return formatExercise(
          `Para h(x) = ${a}x ${adjustedB >= 0 ? "+" : "-"} ${Math.abs(adjustedB)}, qual e a raiz da funcao (valor de x quando h(x)=0)?`,
          correct,
          createNumericDistractors(correct, [a, Math.abs(adjustedB), correct + 2]),
          "Na raiz, fazemos h(x)=0 e isolamos x."
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 7);
        const x1 = randInt(1, 4);
        const x2 = x1 + randInt(2, 4);
        const correct = a * (x2 - x1);
        return formatExercise(
          `Na funcao p(x) = ${a}x + ${b}, qual e a variacao de p(x) quando x vai de ${x1} para ${x2}?`,
          correct,
          createNumericDistractors(correct, [a + b, a * x2 + b, a * x1 + b]),
          "A variacao em funcao afim e a multiplicada pela variacao de x: a(x2-x1)."
        );
      },
    ];

    const functionsTemplates = progressionLevel <= 3
      ? functionsFoundationalTemplates
      : progressionLevel <= 6
        ? functionsIntermediateTemplates
        : functionsAdvancedTemplates;

    return pickOne(functionsTemplates)();
  }

  if (isCalculusTopic) {
    const calculusFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const x1 = randInt(1, 4);
        const x2 = x1 + randInt(1, 4);
        const y1 = randInt(2, 10);
        const y2 = y1 + randInt(2, 12);
        const correct = Math.round((y2 - y1) / (x2 - x1));
        return formatExercise(
          `Uma funcao passa pelos pontos (${x1}, ${y1}) e (${x2}, ${y2}). Qual e a taxa media de variacao entre esses pontos?`,
          correct,
          createNumericDistractors(correct, [y2 - y1, x2 - x1, correct + 1]),
          "Taxa media = variacao de y dividida pela variacao de x."
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 7);
        const correct = a;
        return formatExercise(
          `Para f(x) = ${a}x + ${b}, qual e a derivada f'(x)?`,
          correct,
          createNumericDistractors(correct, [b, a + b, 1]),
          "A derivada de ax+b e a."
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const point = randInt(1, 6);
        const correct = a;
        return formatExercise(
          `Se s(t) = ${a}t + 4 representa a posicao, qual e a velocidade instantanea em t=${point}?`,
          correct,
          createNumericDistractors(correct, [a * point + 4, point, correct + 2]),
          "Em funcao linear, a velocidade instantanea e constante e igual ao coeficiente angular."
        );
      },
    ];

    const calculusIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const a = pickOne([2, 3, 4]);
        const x = randInt(1, 5);
        const correct = 2 * a * x;
        return formatExercise(
          `Para f(x) = ${a}x^2, qual e o valor de f'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x, 2 * a, correct + a]),
          "Derivada: f'(x)=2ax. Substituimos x no final."
        );
      },
      () => {
        const a = pickOne([1, 2, 3]);
        const b = pickOne([2, 3, 4]);
        const c = randInt(1, 7);
        const x = randInt(1, 4);
        const correct = 2 * a * x + b;
        return formatExercise(
          `Dada f(x) = ${a}x^2 + ${b}x + ${c}, qual e f'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x + b * x + c, 2 * a + b, correct + 2]),
          "Derivamos termo a termo e avaliamos em x."
        );
      },
      () => {
        const a = randInt(2, 6);
        return formatExercise(
          `Qual e o limite lim(x->2) de ${a}x + 1?`,
          2 * a + 1,
          createNumericDistractors(2 * a + 1, [a + 1, a * 2, 2 * a + 3]),
          "Em funcao polinomial, o limite em x=a e o proprio valor da funcao em a."
        );
      },
    ];

    const calculusAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const a = pickOne([1, 2, 3]);
        const b = pickOne([2, 3, 4]);
        const x = randInt(1, 4);
        const correct = 3 * a * x * x + b;
        return formatExercise(
          `Se f(x) = ${a}x^3 + ${b}x, qual e f'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x * x + b * x, 3 * a * x + b, correct + randInt(2, 6)]),
          "Derivada: f'(x)=3ax^2 + b."
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const h = pickOne([1, 2]);
        const correct = a * h;
        return formatExercise(
          `Para f(x)=x^2, qual e a taxa media de variacao entre x=${a} e x=${a + h}?`,
          correct + 2 * a,
          createNumericDistractors(correct + 2 * a, [a * a, 2 * a, correct + 2 * a + 1]),
          "Taxa media = [f(a+h)-f(a)]/h = 2a+h."
        );
      },
      () => {
        const a = pickOne([3, 4, 5]);
        const correct = a;
        return formatExercise(
          `Uma particula segue s(t)=${a}t^2. Qual e a velocidade instantanea em t=2?`,
          4 * a,
          createNumericDistractors(4 * a, [2 * a, a * a, 4 * a + 2]),
          "v(t)=s'(t)=2at. Em t=2, v=4a."
        );
      },
    ];

    const calculusTemplates = progressionLevel <= 3
      ? calculusFoundationalTemplates
      : progressionLevel <= 6
        ? calculusIntermediateTemplates
        : calculusAdvancedTemplates;

    return pickOne(calculusTemplates)();
  }

  if (isEquationTopic) {
    const equationFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const x = randInt(2, 12);
        const offset = randInt(3, 15);
        const right = 3 * x + offset;
        return formatExercise(
          `Resolva a equacao: 3x + ${offset} = ${right}. Qual e o valor de x?`,
          x,
          createNumericDistractors(x, [x + 1, x - 1, x + 3]),
          "Isole o termo com x: 3x = ${right - offset}, depois divida por 3."
        );
      },
      () => {
        const x = randInt(3, 14);
        const packPrice = randInt(4, 12);
        const total = x * packPrice;
        return formatExercise(
          `Uma cantina vende pacotes por R$ ${packPrice} cada. Se o total pago foi R$ ${total}, quantos pacotes foram comprados?`,
          x,
          createNumericDistractors(x, [x + 2, x - 2, x + 1]),
          "A quantidade e total dividido pelo preco por pacote."
        );
      },
      () => {
        const x = randInt(4, 16);
        const subtract = randInt(2, 9);
        const right = x - subtract;
        return formatExercise(
          `Encontre x na expressao: x - ${subtract} = ${right}.`,
          x,
          createNumericDistractors(x, [right, x + subtract, x - 2]),
          "Para desfazer a subtracao, somamos ${subtract} nos dois lados."
        );
      },
      () => {
        const x = randInt(3, 12);
        const add = randInt(3, 10);
        const right = x + add;
        return formatExercise(
          `Encontre x em: x + ${add} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 1), x + add]),
          `Subtraimos ${add} dos dois lados para isolar x.`
        );
      },
    ];

    const equationIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const x = randInt(3, 14);
        const mul = pickOne([2, 3, 4]);
        const bonus = randInt(4, 15);
        const total = x * mul + bonus;
        return formatExercise(
          `Numa campanha, cada equipe fez ${mul} tarefas por rodada e recebeu ${bonus} pontos extras. Se o total foi ${total}, quantas rodadas (x) aconteceram?`,
          x,
          createNumericDistractors(x, [x + 2, x - 1, Math.max(1, x - 3)]),
          `Montamos a equacao ${mul}x + ${bonus} = ${total}; depois isolamos x.`
        );
      },
      () => {
        const x = randInt(2, 10);
        const left = 2 * (x + 3);
        return formatExercise(
          `Resolva: 2(x + 3) = ${left}. Qual e o valor de x?`,
          x,
          createNumericDistractors(x, [x + 3, x - 2, x + 1]),
          "Distribuimos o 2: 2x + 6 = valor da direita, depois isolamos x."
        );
      },
      () => {
        const x = randInt(3, 14);
        const a = pickOne([2, 3, 4]);
        const b = randInt(2, 11);
        const c = pickOne([1, 2]);
        const d = a * x + b - c * x;
        return formatExercise(
          `Resolva a equacao: ${a}x + ${b} = ${c}x + ${d}. Qual e x?`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 2), x + 3]),
          "Passamos os termos com x para um lado e os numeros para o outro, depois dividimos pelo coeficiente final de x."
        );
      },
    ];

    const equationAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const x = randInt(4, 15);
        const a = pickOne([2, 3, 4]);
        const b = randInt(2, 9);
        const c = randInt(1, 7);
        const right = a * (x - b) + c;
        return formatExercise(
          `Resolva: ${a}(x - ${b}) + ${c} = ${right}. Qual o valor de x?`,
          x,
          createNumericDistractors(x, [x + b, x - 1, x + 2]),
          "Primeiro desfazemos soma/subtracao e depois dividimos pelo coeficiente de x."
        );
      },
      () => {
        const x = randInt(5, 18);
        const total = x * 2 + randInt(6, 14);
        const add = total - 2 * x;
        return formatExercise(
          `A soma de um numero com seu dobro e ${total}. Qual e esse numero?`,
          x,
          createNumericDistractors(x, [Math.floor(total / 2), Math.floor(total / 3), x + 2]),
          `Montamos x + 2x = ${total}, entao 3x = ${total} e x = ${x}.`
        );
      },
      () => {
        const x = randInt(3, 12);
        const denom = pickOne([2, 3, 4]);
        const right = randInt(5, 18);
        const leftConst = right + x / denom;
        return formatExercise(
          `Resolva a equacao: ${leftConst} - x/${denom} = ${right}. Qual e x?`,
          x,
          createNumericDistractors(x, [Math.max(1, x - 1), x + denom, Math.max(1, x - denom)]),
          `Passamos x/${denom} para o outro lado e isolamos x.`
        );
      },
      () => {
        const x = randInt(2, 11);
        const a = pickOne([3, 4, 5]);
        const b = randInt(1, 5);
        const c = randInt(2, 7);
        const right = a * (x + b) - c;
        return formatExercise(
          `Resolva: ${a}(x + ${b}) - ${c} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 2), x + b]),
          "Desfazemos a subtracao, depois dividimos por a e por fim retiramos b."
        );
      },
      () => {
        const x = randInt(4, 14);
        const half = x / 2;
        const constant = randInt(3, 9);
        const right = half + constant;
        return formatExercise(
          `Resolva: x/2 + ${constant} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 2, Math.max(1, x - 2), right]),
          "Subtraimos a constante e multiplicamos por 2 para achar x."
        );
      },
      () => {
        const x = randInt(5, 17);
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 5);
        const c = randInt(2, 7);
        const d = randInt(3, 8);
        const right = a * (x - b) + c - d;
        return formatExercise(
          `Resolva: ${a}(x - ${b}) + ${c} - ${d} = ${right}.`,
          x,
          createNumericDistractors(x, [x + b, Math.max(1, x - 3), x + 1]),
          "Simplificamos as constantes, dividimos por a e somamos b ao final."
        );
      },
    ];

    const equationTemplates = progressionLevel <= 3
      ? equationFoundationalTemplates
      : progressionLevel <= 6
        ? equationIntermediateTemplates
        : equationAdvancedTemplates;

    return pickOne(equationTemplates)();
  }

  if (isFractionTopic) {
    const fractionFoundationalTemplates: Array<() => AiExercise> = [
      () => {
        const denominator = randInt(4, 10);
        const numeratorA = randInt(1, denominator - 2);
        const numeratorB = randInt(1, denominator - numeratorA - 1);
        const correct = numeratorA + numeratorB;
        return formatExercise(
          `Em uma pizza dividida em ${denominator} fatias iguais, Lara comeu ${numeratorA} fatias e Davi comeu ${numeratorB}. Quantas fatias foram comidas?`,
          correct,
          createNumericDistractors(correct, [Math.abs(numeratorA - numeratorB), numeratorA * numeratorB, correct + 1]),
          "Como as partes sao iguais, somamos as fatias consumidas."
        );
      },
      () => {
        const denominator = randInt(5, 12);
        const numerator = randInt(2, denominator - 1);
        const quantity = randInt(12, 60);
        const correct = Math.round((quantity * numerator) / denominator);
        return formatExercise(
          `Uma caixa tem ${quantity} bombons. Se ${numerator}/${denominator} da caixa foi distribuida, quantos bombons foram entregues?`,
          correct,
          createNumericDistractors(correct, [quantity - correct, numerator + denominator, correct + randInt(2, 6)]),
          "Calculamos a fracao de uma quantidade: total x numerador / denominador."
        );
      },
      () => {
        const denominator = randInt(4, 10);
        const start = randInt(2, denominator - 1);
        const consumed = randInt(1, start);
        const correct = start - consumed;
        return formatExercise(
          `Uma garrafa estava com ${start}/${denominator} de suco. Foram consumidos ${consumed}/${denominator}. Qual ficou sendo o numerador da parte restante?`,
          correct,
          createNumericDistractors(correct, [start + consumed, consumed, correct + 1]),
          "Com denominador igual, subtraimos os numeradores."
        );
      },
    ];

    const fractionIntermediateTemplates: Array<() => AiExercise> = [
      () => {
        const denominator = pickOne([6, 8, 10, 12]);
        const numerator = randInt(2, denominator - 2);
        const multiplier = randInt(2, 5);
        const correct = numerator * multiplier;
        return formatExercise(
          `Uma receita usa ${numerator}/${denominator} de xicara por porcao. Para ${multiplier} porcoes, qual deve ser o numerador da fracao equivalente?`,
          correct,
          createNumericDistractors(correct, [numerator + multiplier, numerator * multiplier + 1, denominator]),
          `Multiplicamos numerador e denominador pelo mesmo valor (${multiplier}).`
        );
      },
      () => {
        const denominator = pickOne([8, 10, 12]);
        const numA = randInt(1, denominator - 3);
        const numB = randInt(numA + 1, denominator - 1);
        const correct = numB - numA;
        return formatExercise(
          `Em uma corrida, Carla completou ${numA}/${denominator} na primeira parte e terminou com ${numB}/${denominator}. Qual fracao da pista ela percorreu na segunda parte (em numerador)?`,
          correct,
          createNumericDistractors(correct, [numA + numB, numB, Math.max(1, correct + 2)]),
          "A segunda parte e a diferenca entre o total final e a primeira parte."
        );
      },
      () => {
        const denominator = pickOne([6, 8, 10]);
        const numerator = randInt(1, denominator - 1);
        const pieces = randInt(18, 48);
        const correct = Math.round((pieces * numerator) / denominator);
        return formatExercise(
          `Uma turma deve resolver ${pieces} exercicios. Se cada grupo ficou com ${numerator}/${denominator} do total, quantos exercicios cabem a um grupo?`,
          correct,
          createNumericDistractors(correct, [pieces - correct, numerator + denominator, correct + 3]),
          "Calculamos fracao de quantidade: total x numerador / denominador."
        );
      },
    ];

    const fractionAdvancedTemplates: Array<() => AiExercise> = [
      () => {
        const denominator = pickOne([12, 15, 18]);
        const n1 = randInt(2, 6);
        const n2 = randInt(2, 6);
        const sum = n1 + n2;
        return formatExercise(
          `Em um reservatorio, pela manha entrou ${n1}/${denominator} da capacidade e a tarde entrou ${n2}/${denominator}. Qual e o numerador total preenchido?`,
          sum,
          createNumericDistractors(sum, [Math.abs(n1 - n2), n1 * n2, sum + 2]),
          "Com denominadores iguais, somamos os numeradores."
        );
      },
      () => {
        const denominator = pickOne([12, 16, 20]);
        const full = randInt(60, 140);
        const doneNum = randInt(3, Math.floor(denominator / 2));
        const leftNum = denominator - doneNum;
        const correct = Math.round((full * leftNum) / denominator);
        return formatExercise(
          `Uma tarefa tem ${full} etapas. Ja foram concluídas ${doneNum}/${denominator}. Quantas etapas faltam?`,
          correct,
          createNumericDistractors(correct, [Math.round((full * doneNum) / denominator), full - correct + 2, correct + 4]),
          "Primeiro achamos a fracao que falta e depois calculamos essa parte do total."
        );
      },
      () => {
        const denominator = pickOne([9, 12, 15]);
        const numerator = randInt(2, denominator - 2);
        const scale = pickOne([2, 3, 4]);
        const correct = denominator * scale;
        return formatExercise(
          `Qual deve ser o novo denominador de ${numerator}/${denominator} para obter uma fracao equivalente com numerador ${numerator * scale}?`,
          correct,
          createNumericDistractors(correct, [denominator + scale, numerator * scale, correct - scale]),
          "Em fracoes equivalentes, numerador e denominador sao multiplicados pelo mesmo fator."
        );
      },
    ];

    const fractionTemplates = progressionLevel <= 3
      ? fractionFoundationalTemplates
      : progressionLevel <= 6
        ? fractionIntermediateTemplates
        : fractionAdvancedTemplates;

    return pickOne(fractionTemplates)();
  }

  if (isPercentageTopic) {
    const percentageTemplates: Array<() => AiExercise> = [
      () => {
        const original = randInt(80, 450);
        const pct = pickOne([10, 15, 20, 25]);
        const discount = Math.round((original * pct) / 100);
        return formatExercise(
          `Um tenis custa R$ ${original} e esta com desconto de ${pct}%. Qual e o valor do desconto em reais?`,
          discount,
          createNumericDistractors(discount, [original - discount, pct + discount, discount + randInt(4, 20)]),
          "Desconto em reais = preco x porcentagem / 100."
        );
      },
      () => {
        const total = randInt(60, 200);
        const pct = pickOne([20, 25, 30, 40]);
        const correct = Math.round((total * pct) / 100);
        return formatExercise(
          `Em uma turma com ${total} alunos, ${pct}% escolheram futebol. Quantos alunos escolheram futebol?`,
          correct,
          createNumericDistractors(correct, [total - correct, pct, correct + randInt(3, 12)]),
          "Transformamos a porcentagem em fracao de 100 e multiplicamos pelo total."
        );
      },
      () => {
        const price = randInt(120, 900);
        const increase = pickOne([5, 8, 10, 12]);
        const correct = Math.round(price * (1 + increase / 100));
        return formatExercise(
          `Um curso custava R$ ${price} e teve reajuste de ${increase}%. Qual e o novo preco aproximado?`,
          correct,
          createNumericDistractors(correct, [Math.round(price * (increase / 100)), price - Math.round(price * (increase / 100)), correct + randInt(10, 45)]),
          "Novo preco = preco antigo + percentual de aumento."
        );
      },
      () => {
        const total = randInt(100, 360);
        const donePct = pickOne([15, 20, 35, 40]);
        const done = Math.round((total * donePct) / 100);
        const correct = total - done;
        return formatExercise(
          `Uma meta semanal e de ${total} pontos. Ja foram concluidos ${donePct}% da meta. Quantos pontos ainda faltam?`,
          correct,
          createNumericDistractors(correct, [done, total + done, Math.round(total * donePct / 100)]),
          "Primeiro calculamos a parte concluida; depois subtraimos do total."
        );
      },
    ];

    return pickOne(percentageTemplates)();
  }

  if (isProportionTopic) {
    const proportionTemplates: Array<() => AiExercise> = [
      () => {
        const peopleA = randInt(3, 7);
        const juiceA = peopleA * pickOne([2, 3]);
        const peopleB = peopleA + randInt(2, 6);
        const correct = Math.round((juiceA * peopleB) / peopleA);
        return formatExercise(
          `${peopleA} pessoas consomem ${juiceA} copos de suco em uma festa. Mantendo a mesma proporcao, quantos copos sao necessarios para ${peopleB} pessoas?`,
          correct,
          createNumericDistractors(correct, [juiceA + peopleB, correct - peopleA, correct + peopleA]),
          "Em proporcao direta, multiplicamos pela razao entre as quantidades de pessoas."
        );
      },
      () => {
        const mapScale = pickOne([1000, 2000, 5000]);
        const mapCm = randInt(3, 12);
        const correct = mapCm * mapScale;
        return formatExercise(
          `Em um mapa na escala 1:${mapScale}, uma rua mede ${mapCm} cm. Qual e o comprimento real em cm?`,
          correct,
          createNumericDistractors(correct, [mapScale + mapCm, correct / 10, correct + mapScale]),
          "Na escala 1:n, 1 cm no mapa representa n cm reais."
        );
      },
      () => {
        const workersA = randInt(3, 8);
        const daysA = randInt(10, 20);
        const workersB = workersA * 2;
        const correct = Math.ceil((workersA * daysA) / workersB);
        return formatExercise(
          `${workersA} pedreiros finalizam um muro em ${daysA} dias. Mantendo o mesmo ritmo, em quantos dias ${workersB} pedreiros terminam o mesmo muro?`,
          correct,
          createNumericDistractors(correct, [daysA, daysA * 2, Math.max(1, correct + 3)]),
          "Mais trabalhadores reduzem o tempo: grandezas inversamente proporcionais."
        );
      },
    ];

    return pickOne(proportionTemplates)();
  }

  if (isTimeTopic) {
    const timeTemplates: Array<() => AiExercise> = [
      () => {
        const speed = randInt(40, 90);
        const hours = randInt(2, 6);
        const correct = speed * hours;
        return formatExercise(
          `Um onibus viaja a ${speed} km/h durante ${hours} horas. Qual distancia ele percorre?`,
          correct,
          createNumericDistractors(correct, [speed + hours, correct - speed, correct + hours]),
          "Distancia = velocidade x tempo."
        );
      },
      () => {
        const minutes = randInt(20, 110);
        const task = randInt(3, 9);
        const correct = minutes + task;
        return formatExercise(
          `Uma atividade levou ${minutes} minutos e outra levou ${task} minutos a mais. Quantos minutos a segunda atividade levou?`,
          correct,
          createNumericDistractors(correct, [minutes - task, minutes * task, correct + task]),
          "Somamos os minutos extras ao tempo inicial."
        );
      },
      () => {
        const startHour = randInt(6, 20);
        const durationMin = pickOne([35, 40, 50, 65, 75, 90]);
        const totalMinutes = startHour * 60 + durationMin;
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const correct = endHour;
        return formatExercise(
          `Uma oficina comecou as ${String(startHour).padStart(2, "0")}:00 e durou ${durationMin} minutos. Em qual HORA terminou?`,
          correct,
          createNumericDistractors(correct, [startHour, (startHour + 2) % 24, Math.max(0, correct - 1)]),
          "Convertemos a duracao para horas e minutos e somamos ao horario inicial."
        );
      },
    ];

    return pickOne(timeTemplates)();
  }

  if (normalizedTopic.includes("mercado")) {
    const apples = randInt(6 + difficultyBoost, 18 + difficultyBoost * 2);
    const oranges = randInt(4 + difficultyBoost, 15 + difficultyBoost);
    const total = apples + oranges;
    return formatExercise(
      `No mercado, Joao comprou ${apples} macas e ${oranges} laranjas. Quantas frutas ele comprou no total?`,
      total,
      createNumericDistractors(total, [total - randInt(1, 3), total + randInt(1, 3), total - randInt(4, 6)]),
      "Somamos as macas e as laranjas para obter o total."
    );
  }

  if (isAdvanced) {
    return pickOne(arithmeticTemplates)();
  }

  return pickOne(arithmeticTemplates)();
}

function normalizeExercise(payload: unknown): AiExercise {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de exercicio invalido.");
  }

  const candidate = payload as Partial<AiExercise>;
  if (typeof candidate.question !== "string") throw new Error("Pergunta invalida.");
  if (!Array.isArray(candidate.options) || candidate.options.length !== 4) throw new Error("Opcoes invalidas.");
  if (typeof candidate.correctAnswerIndex !== "number") throw new Error("Indice correto invalido.");
  if (typeof candidate.explanation !== "string") throw new Error("Explicacao invalida.");

  return {
    question: candidate.question,
    options: candidate.options.map(String),
    correctAnswerIndex: Math.max(0, Math.min(3, Math.floor(candidate.correctAnswerIndex))),
    explanation: candidate.explanation,
  };
}

async function generateAiExercise(topic: string, level: number): Promise<AiExercise> {
  const complexityGuide = getComplexityGuide(level);
  const topicFocus = getTopicFocusInstruction(topic);
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Gere um exercicio de matematica sobre "${topic}" para o nivel ${level}.
Requisitos obrigatorios:
- Use contexto cotidiano e realista (mercado, transporte, tempo, financas, esportes, casa, trabalho, escola).
- Evite enunciado abstrato puro; sempre contextualize a situacao.
- Varie o contexto entre chamadas para nao repetir o mesmo tipo de historia.
- Varie a ESTRUTURA do problema escolhendo uma destas abordagens: totalizacao, valor faltante, comparacao entre cenarios, planejamento com restricao, interpretacao de dados textuais.
- Nao use sempre a pergunta "quantos ao todo"; alterne o que e pedido (total, diferenca, parte restante, valor final, unidade correta).
- Crie 4 alternativas plausiveis (apenas 1 correta).
- Forneca explicacao curta e didatica em portugues.
- ${complexityGuide}
- ${topicFocus}
Retorne em JSON com: question (string), options (array de 4 strings), correctAnswerIndex (number), explanation (string).`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Resposta vazia da IA.");
  }

  return normalizeExercise(JSON.parse(text));
}

async function generateOllamaExercise(topic: string, level: number): Promise<AiExercise> {
  const model = await detectOllamaModel();
  if (!model) {
    throw new Error("Nenhum modelo Ollama instalado.");
  }

  const complexityGuide = getComplexityGuide(level);
  const topicFocus = getTopicFocusInstruction(topic);
  const payload = await ollamaRequest<{ message?: { content?: string } }>("/api/chat", {
    model,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "Voce e um gerador de exercicios de matematica para estudantes brasileiros. Responda somente JSON valido sem markdown.",
      },
      {
        role: "user",
        content: `Gere um exercicio de matematica sobre \"${topic}\" para nivel ${level}.
Requisitos obrigatorios:
- Contexto cotidiano e realista.
- Estrutura variada: totalizacao, valor faltante, comparacao, planejamento com restricao ou interpretacao de dados.
- Evite repetir "quantos ao todo" em todas as questoes.
- Exatamente 4 alternativas, apenas 1 correta.
- Explicacao curta e didatica em portugues.
- ${complexityGuide}
- ${topicFocus}
Retorne APENAS JSON com: question (string), options (array de 4 strings), correctAnswerIndex (number), explanation (string).`,
      },
    ],
    options: {
      temperature: 0.3,
    },
  }, getOllamaGenerationTimeoutMs());

  const content = String(payload.message?.content || "").trim();
  if (!content) throw new Error("Ollama retornou exercicio vazio.");
  const json = extractFirstJsonObject(content);
  return normalizeExercise(JSON.parse(json));
}

async function generateTutorResponse(message: string): Promise<string> {
  const ai = getAiClient();
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction:
        "Voce e o Growing Math Tutor, um professor de matematica amigavel, paciente e incentivador. Ajude o aluno a entender conceitos, nao apenas dar resposta direta.",
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text || "Nao consegui responder agora. Tente novamente em alguns instantes.";
}

async function generateOllamaTutorResponse(message: string): Promise<string> {
  const model = await detectOllamaModel();
  if (!model) {
    throw new Error("Nenhum modelo Ollama instalado.");
  }

  const payload = await ollamaRequest<{ message?: { content?: string } }>("/api/chat", {
    model,
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "Voce e o Growing Math Tutor. Responda em portugues do Brasil, com didatica, incentivo e passos claros para estudantes.",
      },
      { role: "user", content: message },
    ],
    options: {
      temperature: 0.4,
    },
  }, getOllamaGenerationTimeoutMs());

  const text = String(payload.message?.content || "").trim();
  if (!text) throw new Error("Ollama retornou resposta vazia.");
  return text;
}

function resolveDistDir(): string {
  const candidates = [
    path.join(__dirname, "dist"),
    path.join(__dirname, "..", "dist"),
    path.join(process.cwd(), "dist"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return path.join(__dirname, "dist");
}

type DailyChallenge = {
  id: number;
  challengeKey: string;
  title: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  rewardXp: number;
  rewardCoins: number;
  createdAt: string;
};

function makeSeedFromText(text: string): number {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function createSeededRandom(seedText: string): () => number {
  let seed = makeSeedFromText(seedText) || 123456789;
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function seededShuffle<T>(items: T[], random: () => number): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

const DEFAULT_APP_TIMEZONE = "America/Sao_Paulo";

// O dia civil do desafio diario precisa ser o mesmo para o aluno e para o servidor.
// Rodando local o fuso do processo ja seria o do aluno, mas hospedado na AWS o
// processo roda em UTC - por isso o fuso e explicito e configuravel.
function resolveAppTimeZone(): string {
  const candidate = String(process.env.APP_TIMEZONE || "").trim() || DEFAULT_APP_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate });
    return candidate;
  } catch {
    console.warn(`[config] APP_TIMEZONE invalido ("${candidate}"). Usando ${DEFAULT_APP_TIMEZONE}.`);
    return DEFAULT_APP_TIMEZONE;
  }
}

const APP_TIME_ZONE = resolveAppTimeZone();

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// formatToParts em vez de format(): o layout de en-CA pode variar entre versoes do ICU.
function localDayKey(date: Date = new Date()): string {
  const parts = dayKeyFormatter.formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function dailyChallengeKey(now = new Date()): string {
  return localDayKey(now);
}

function buildDailyChallenge(challengeKey: string): DailyChallenge {
  const random = createSeededRandom(challengeKey);
  const variation = Math.floor(random() * 4);
  const rewardXp = 35;
  const rewardCoins = 25;

  if (variation === 0) {
    const a = 10 + Math.floor(random() * 30);
    const b = 5 + Math.floor(random() * 20);
    const correct = a + b;
    const options = seededShuffle([correct, correct + 1, correct - 2, correct + 3], random).map(String);
    return {
      id: Number(challengeKey.replace(/-/g, "")),
      challengeKey,
      title: "Soma Rapida do Dia",
      question: `Quanto e ${a} + ${b}?`,
      options,
      correctAnswerIndex: options.indexOf(String(correct)),
      rewardXp,
      rewardCoins,
      createdAt: `${challengeKey}T00:00:00.000Z`,
    };
  }

  if (variation === 1) {
    const a = 4 + Math.floor(random() * 8);
    const b = 3 + Math.floor(random() * 9);
    const correct = a * b;
    const options = seededShuffle([correct, correct + a, correct - b, correct + 2], random).map(String);
    return {
      id: Number(challengeKey.replace(/-/g, "")),
      challengeKey,
      title: "Multiplicacao do Dia",
      question: `Resolva: ${a} x ${b}`,
      options,
      correctAnswerIndex: options.indexOf(String(correct)),
      rewardXp,
      rewardCoins,
      createdAt: `${challengeKey}T00:00:00.000Z`,
    };
  }

  if (variation === 2) {
    const x = 2 + Math.floor(random() * 9);
    const offset = 3 + Math.floor(random() * 7);
    const right = 2 * x + offset;
    const options = seededShuffle([x, x + 1, x - 1, x + 2], random).map(String);
    return {
      id: Number(challengeKey.replace(/-/g, "")),
      challengeKey,
      title: "Equacao do Dia",
      question: `Encontre x: 2x + ${offset} = ${right}`,
      options,
      correctAnswerIndex: options.indexOf(String(x)),
      rewardXp,
      rewardCoins,
      createdAt: `${challengeKey}T00:00:00.000Z`,
    };
  }

  const part = 1 + Math.floor(random() * 4);
  const total = part + (2 + Math.floor(random() * 5));
  const correct = `${part}/${total}`;
  const options = seededShuffle([correct, `${part + 1}/${total}`, `${part}/${total + 1}`, `${part + 1}/${total + 1}`], random);
  return {
    id: Number(challengeKey.replace(/-/g, "")),
    challengeKey,
    title: "Fracao do Dia",
    question: `Se voce pinta ${part} de ${total} partes iguais, qual fracao representa a parte pintada?`,
    options,
    correctAnswerIndex: options.indexOf(correct),
    rewardXp,
    rewardCoins,
    createdAt: `${challengeKey}T00:00:00.000Z`,
  };
}

function challengeKeyDaysAgo(daysAgo: number, now = new Date()): string {
  // Ancora a data civil ja resolvida no fuso do app e faz aritmetica de calendario
  // em UTC. Reformatar pelo fuso aqui reaplicaria o offset e voltaria um dia.
  const [year, month, day] = localDayKey(now).split("-").map(Number);
  const anchored = new Date(Date.UTC(year, month - 1, day));
  anchored.setUTCDate(anchored.getUTCDate() - daysAgo);
  return anchored.toISOString().slice(0, 10);
}

function getDailyHistoryForUser(userId: number, now = new Date(), days = 7) {
  const safeDays = Math.max(1, Math.min(31, Math.floor(days)));
  const todayKey = challengeKeyDaysAgo(0, now);
  const startKey = challengeKeyDaysAgo(safeDays - 1, now);

  const rows = db
    .prepare(
      `SELECT challenge_key, completed, attempts, completed_at
       FROM daily_challenge_attempts
       WHERE user_id = ? AND challenge_key >= ? AND challenge_key <= ?
       ORDER BY challenge_key DESC`
    )
    .all(userId, startKey, todayKey) as Array<{
      challenge_key: string;
      completed: number;
      attempts: number;
      completed_at: string | null;
    }>;

  const map = new Map(rows.map((row) => [row.challenge_key, row]));
  const history: Array<{
    challengeKey: string;
    title: string;
    completed: boolean;
    attempts: number;
    completedAt: string | null;
  }> = [];

  for (let i = 0; i < safeDays; i += 1) {
    const key = challengeKeyDaysAgo(i, now);
    const record = map.get(key);
    const challenge = buildDailyChallenge(key);
    history.push({
      challengeKey: key,
      title: challenge.title,
      completed: Boolean(record?.completed),
      attempts: Number(record?.attempts || 0),
      completedAt: record?.completed_at || null,
    });
  }

  let streak = 0;
  for (const item of history) {
    if (!item.completed) break;
    streak += 1;
  }

  return { streak, history };
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    password_salt TEXT,
    failed_attempts INTEGER DEFAULT 0,
    lock_until TEXT,
    xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    last_active DATE,
    hero_class TEXT
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    topic TEXT,
    mastery INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    description TEXT,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rarity TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    type TEXT,
    rarity TEXT,
    bonus_xp INTEGER DEFAULT 0,
    bonus_damage INTEGER DEFAULT 0,
    bonus_hp INTEGER DEFAULT 0,
    price INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    item_id INTEGER,
    equipped BOOLEAN DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    teacher_id INTEGER,
    class_code TEXT,
    grade_label TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS class_students (
    class_id INTEGER,
    user_id INTEGER,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(class_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS teacher_student_personalizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    target_topic TEXT,
    weekly_goal INTEGER DEFAULT 3,
    difficulty_preset TEXT DEFAULT 'equilibrado',
    support_style TEXT DEFAULT 'passo_a_passo',
    focus_notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS teacher_class_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    target_value INTEGER,
    reward_xp INTEGER,
    reward_coins INTEGER,
    type TEXT -- 'exercises', 'xp', 'coins'
  );

  CREATE TABLE IF NOT EXISTS user_quests (
    user_id INTEGER,
    quest_id INTEGER,
    current_value INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    PRIMARY KEY(user_id, quest_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(quest_id) REFERENCES quests(id)
  );

  CREATE TABLE IF NOT EXISTS teacher_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    school_name TEXT,
    subject TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    failed_attempts INTEGER DEFAULT 0,
    lock_until TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_challenge_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_key TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    last_selected_option INTEGER,
    awarded_xp INTEGER DEFAULT 0,
    awarded_coins INTEGER DEFAULT 0,
    completed_at TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, challenge_key),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const itemTableColumns = new Set(
  (db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>).map((column) => String(column.name || ""))
);

if (!itemTableColumns.has("slot_category")) {
  db.prepare("ALTER TABLE items ADD COLUMN slot_category TEXT").run();
}

if (!itemTableColumns.has("hand_mode")) {
  db.prepare("ALTER TABLE items ADD COLUMN hand_mode TEXT").run();
}

db.prepare(`
  UPDATE items
  SET slot_category = CASE
    WHEN lower(type) = 'weapon_2h' THEN 'weapon_2h'
    WHEN lower(type) = 'weapon_1h' THEN 'weapon_1h'
    WHEN lower(type) = 'shield' THEN 'shield'
    WHEN lower(type) = 'armor' AND lower(name) LIKE '%escudo%' THEN 'shield'
    WHEN lower(type) = 'armor' THEN 'armor'
    WHEN lower(type) = 'accessory' THEN 'accessory'
    WHEN lower(type) = 'weapon' AND (lower(name) LIKE '%arco%' OR lower(name) LIKE '%lanca longa%') THEN 'weapon_2h'
    WHEN lower(type) = 'weapon' THEN 'weapon_1h'
    ELSE 'accessory'
  END
  WHERE slot_category IS NULL OR trim(slot_category) = ''
`).run();

db.prepare(`
  UPDATE items
  SET hand_mode = CASE
    WHEN slot_category = 'weapon_2h' THEN 'two_handed'
    WHEN slot_category IN ('weapon_1h', 'shield') THEN 'one_handed'
    ELSE 'none'
  END
  WHERE hand_mode IS NULL OR trim(hand_mode) = ''
`).run();

function normalizeEquipSlot(rawType: unknown, rawName: unknown): EquipSlot {
  const type = String(rawType || "").trim().toLowerCase();
  const name = String(rawName || "").trim().toLowerCase();

  if (type === "weapon_2h") return "weapon_2h";
  if (type === "weapon_1h") return "weapon_1h";
  if (type === "shield") return "shield";
  if (type === "armor") return "armor";
  if (type === "accessory") return "accessory";
  if (type === "weapon") {
    if (name.includes("arco") || name.includes("lanca longa")) return "weapon_2h";
    return "weapon_1h";
  }

  if (name.includes("escudo")) return "shield";
  if (name.includes("anel") || name.includes("amuleto")) return "accessory";
  if (name.includes("manto") || name.includes("armadura")) return "armor";
  if (name.includes("arco") || name.includes("lanca longa")) return "weapon_2h";
  return "weapon_1h";
}

db.exec(`
  CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Segredos gerados ficam no proprio banco local para nao dependerem de valores
// previsiveis (caminho do executavel, cwd) nem de constantes no codigo-fonte.
function getOrCreatePersistedSecret(key: string, generate: () => string): string {
  const row = db.prepare("SELECT value FROM app_secrets WHERE key = ?").get(key) as { value?: string } | undefined;
  const existing = String(row?.value || "").trim();
  if (existing) return existing;

  const generated = generate();
  db.prepare("INSERT OR REPLACE INTO app_secrets (key, value) VALUES (?, ?)").run(key, generated);
  return generated;
}

function isLoopbackHost(host: string): boolean {
  const normalized = String(host || "").trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

function isLoopbackRequest(req: express.Request): boolean {
  return isLoopbackHost(String(req.ip || req.socket?.remoteAddress || ""));
}

type RateLimitBucket = { count: number; resetAt: number };

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function pruneRateLimitBuckets(now: number) {
  if (rateLimitBuckets.size < 5000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

// Limitador em memoria: evita nova dependencia e cobre o cenario de processo
// unico do app desktop. Retorna false quando ja respondeu com 429.
function enforceRateLimit(
  req: express.Request,
  res: express.Response,
  options: { scope: string; windowMs: number; max: number; identifier?: string; message?: string }
): boolean {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const who = options.identifier || String(req.ip || req.socket?.remoteAddress || "unknown");
  const key = `${options.scope}|${who}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  bucket.count += 1;
  if (bucket.count > options.max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: options.message || "Muitas requisicoes. Tente novamente em instantes.",
      retryAfter,
    });
    return false;
  }

  return true;
}

const VALID_TOPIC_IDS = new Set([
  "ops-basicas",
  "fracoes",
  "equacoes-1",
  "geometria-basica",
  "funcoes",
  "trigonometria",
  "calculo-intro",
]);

const VALID_HERO_CLASSES = new Set(["Guerreiro", "Mago", "Arqueiro"]);

type ProgressAction = "exercise_correct" | "combat_hit" | "focus_reward";

// Tabela de recompensas autoritativa: o cliente informa apenas QUAL acao
// ocorreu, nunca quanto vale. Impede forjar xpGain/coinsGain via requisicao.
const PROGRESS_REWARDS: Record<
  ProgressAction,
  { xp: number; coins: number; mastery: number; applyEquipmentXpBonus: boolean; minIntervalMs: number }
> = {
  exercise_correct: { xp: 20, coins: 5, mastery: 10, applyEquipmentXpBonus: false, minIntervalMs: 1000 },
  combat_hit: { xp: 30, coins: 10, mastery: 15, applyEquipmentXpBonus: true, minIntervalMs: 1000 },
  focus_reward: { xp: 120, coins: 25, mastery: 8, applyEquipmentXpBonus: false, minIntervalMs: 30000 },
};

const MAX_EQUIPMENT_XP_BONUS_PERCENT = 200;

function isProgressAction(value: unknown): value is ProgressAction {
  return value === "exercise_correct" || value === "combat_hit" || value === "focus_reward";
}

function getEquippedXpBonusPercent(userId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(i.bonus_xp), 0) AS total
       FROM inventory inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.user_id = ? AND inv.equipped = 1`
    )
    .get(userId) as { total?: number } | undefined;

  const total = Number(row?.total || 0);
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(MAX_EQUIPMENT_XP_BONUS_PERCENT, total));
}

function ensureUsersSecurityColumns() {
  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }

  if (!columnNames.has("password_salt")) {
    db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT");
  }

  if (!columnNames.has("failed_attempts")) {
    db.exec("ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0");
  }

  if (!columnNames.has("lock_until")) {
    db.exec("ALTER TABLE users ADD COLUMN lock_until TEXT");
  }
}

ensureUsersSecurityColumns();

function ensureTeacherDataColumns() {
  const classColumns = db.prepare("PRAGMA table_info(classes)").all() as Array<{ name: string }>;
  const classColumnNames = new Set(classColumns.map((c) => c.name));

  if (!classColumnNames.has("class_code")) {
    db.exec("ALTER TABLE classes ADD COLUMN class_code TEXT");
  }

  if (!classColumnNames.has("grade_label")) {
    db.exec("ALTER TABLE classes ADD COLUMN grade_label TEXT");
  }

  if (!classColumnNames.has("description")) {
    db.exec("ALTER TABLE classes ADD COLUMN description TEXT");
  }

  if (!classColumnNames.has("created_at")) {
    db.exec("ALTER TABLE classes ADD COLUMN created_at TEXT");
  }

  const classStudentColumns = db.prepare("PRAGMA table_info(class_students)").all() as Array<{ name: string }>;
  const classStudentColumnNames = new Set(classStudentColumns.map((c) => c.name));

  if (!classStudentColumnNames.has("joined_at")) {
    db.exec("ALTER TABLE class_students ADD COLUMN joined_at TEXT");
  }
}

ensureTeacherDataColumns();

function ensureTeacherIndexes() {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_code_unique ON classes(class_code);
    CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
    CREATE INDEX IF NOT EXISTS idx_class_students_user_id ON class_students(user_id);
    CREATE INDEX IF NOT EXISTS idx_personalizations_teacher_user ON teacher_student_personalizations(teacher_id, user_id);
  `);
}

ensureTeacherIndexes();

function generateClassCodeSeed() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function generateUniqueClassCode() {
  let attempts = 0;
  while (attempts < 20) {
    const code = generateClassCodeSeed();
    const existing = db.prepare("SELECT id FROM classes WHERE class_code = ?").get(code) as any;
    if (!existing) {
      return code;
    }
    attempts += 1;
  }

  return `${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function ensureExistingClassCodes() {
  const rows = db.prepare("SELECT id FROM classes WHERE class_code IS NULL OR TRIM(class_code) = ''").all() as Array<{ id: number }>;
  rows.forEach((row) => {
    db.prepare("UPDATE classes SET class_code = ?, created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE id = ?")
      .run(generateUniqueClassCode(), row.id);
  });
}

ensureExistingClassCodes();

function getPasswordPepper() {
  return String(process.env.AUTH_PASSWORD_PEPPER || "").trim();
}

function buildPasswordMaterial(password: string) {
  const pepper = getPasswordPepper();
  return pepper ? `${password}${pepper}` : password;
}

function isStrongPassword(password: string) {
  const raw = String(password || "");
  return (
    raw.length >= 8 &&
    /[a-z]/.test(raw) &&
    /[A-Z]/.test(raw) &&
    /\d/.test(raw) &&
    /[^A-Za-z0-9]/.test(raw)
  );
}

function hashPassword(password: string, salt?: string) {
  const finalSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(buildPasswordMaterial(password), finalSalt, 64).toString("hex");
  return { hash, salt: finalSalt };
}

type PasswordVerification = { ok: boolean; needsRehash: boolean };

function verifyPassword(password: string, salt: string, hash: string): PasswordVerification {
  const storedBuffer = Buffer.from(hash, "hex");

  const attempted = crypto.scryptSync(buildPasswordMaterial(password), salt, 64).toString("hex");
  const attemptedBuffer = Buffer.from(attempted, "hex");
  if (attemptedBuffer.length === storedBuffer.length && crypto.timingSafeEqual(attemptedBuffer, storedBuffer)) {
    return { ok: true, needsRehash: false };
  }

  // Compatibilidade com hashes criados antes do pepper. So faz sentido quando
  // existe pepper configurado; nesse caso o hash e migrado no proximo login.
  if (!getPasswordPepper() || isEnvFlagEnabled(process.env.AUTH_DISABLE_LEGACY_PASSWORD_FALLBACK)) {
    return { ok: false, needsRehash: false };
  }

  const legacy = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const legacyBuffer = Buffer.from(legacy, "hex");
  if (legacyBuffer.length === storedBuffer.length && crypto.timingSafeEqual(legacyBuffer, storedBuffer)) {
    return { ok: true, needsRehash: true };
  }

  return { ok: false, needsRehash: false };
}

function isUserLocked(lockUntil?: string | null) {
  if (!lockUntil) return false;
  const lockDate = new Date(lockUntil);
  return !Number.isNaN(lockDate.getTime()) && lockDate.getTime() > Date.now();
}

function getLockRemainingMinutes(lockUntil?: string | null) {
  if (!lockUntil) return 0;
  const lockDate = new Date(lockUntil);
  const msRemaining = lockDate.getTime() - Date.now();
  return Math.max(1, Math.ceil(msRemaining / 60000));
}

function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

function isEnvFlagEnabled(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

type AuthRole = "user" | "teacher";

type AuthTokenPayload = {
  sub: number;
  email: string;
  role: AuthRole;
  iat: number;
  exp: number;
};

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64").toString("utf8");
}

function signAuthToken(secret: string, data: { sub: number; email: string; role: AuthRole }, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    ...data,
    iat: now,
    exp: now + Math.max(60, ttlSeconds),
  };

  const headerSegment = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const message = `${headerSegment}.${payloadSegment}`;
  const signature = crypto.createHmac("sha256", secret).update(message).digest();
  const signatureSegment = toBase64Url(signature);
  return `${message}.${signatureSegment}`;
}

function verifyAuthToken(secret: string, token: string): AuthTokenPayload | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const message = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = toBase64Url(crypto.createHmac("sha256", secret).update(message).digest());

  const expectedBuffer = Buffer.from(expectedSignature);
  const incomingBuffer = Buffer.from(signatureSegment);
  if (expectedBuffer.length !== incomingBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) return null;

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadSegment)) as AuthTokenPayload;
  } catch {
    return null;
  }

  if (!payload?.sub || !payload?.email || !payload?.role || !payload?.exp) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (payload.role !== "user" && payload.role !== "teacher") return null;
  return payload;
}

function getBearerToken(req: express.Request) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getUserPayloadById(userId: number) {
  const user = db.prepare("SELECT id, name, email, xp, coins, level, streak, last_active, hero_class FROM users WHERE id = ?").get(userId) as any;
  if (!user) return null;

  const progress = db.prepare("SELECT * FROM progress WHERE user_id = ?").all(user.id);
  const achievements = db.prepare("SELECT * FROM achievements WHERE user_id = ?").all(user.id);
  const inventory = db.prepare(`
    SELECT i.*, COALESCE(i.slot_category, i.type) as equip_type, inv.equipped, inv.id as inventory_id 
    FROM items i 
    JOIN inventory inv ON i.id = inv.item_id 
    WHERE inv.user_id = ?
  `).all(user.id);

  const quests = db.prepare(`
    SELECT q.*, uq.current_value, uq.completed 
    FROM quests q 
    JOIN user_quests uq ON q.id = uq.quest_id 
    WHERE uq.user_id = ?
  `).all(user.id);

  return { ...user, progress, achievements, inventory, quests };
}

// Seed mock data for school mode if empty
const classCount = db.prepare("SELECT COUNT(*) as count FROM classes").get() as any;
if (classCount.count === 0) {
  db.prepare("INSERT INTO classes (name, teacher_id) VALUES (?, ?)").run("Matemática 9º Ano A", 1);

  // Seed some quests
  db.prepare("INSERT INTO quests (title, description, target_value, reward_xp, reward_coins, type) VALUES (?, ?, ?, ?, ?, ?)").run(
    "Iniciante em Aritmética", "Resolva 5 exercícios de qualquer tópico.", 5, 50, 20, "exercises"
  );
  db.prepare("INSERT INTO quests (title, description, target_value, reward_xp, reward_coins, type) VALUES (?, ?, ?, ?, ?, ?)").run(
    "Mestre do Conhecimento", "Ganhe 500 de XP total.", 500, 200, 100, "xp"
  );
  db.prepare("INSERT INTO quests (title, description, target_value, reward_xp, reward_coins, type) VALUES (?, ?, ?, ?, ?, ?)").run(
    "Caçador de Recompensas", "Ganhe 200 moedas.", 200, 100, 50, "coins"
  );

  // Em banco novo o usuario 1 ainda nao existe; vincular turma/missoes a ele
  // violaria a foreign key e derrubaria o servidor no boot.
  const seedUser = db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
  if (seedUser?.id) {
    const seedClass = db.prepare("SELECT id FROM classes ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
    if (seedClass?.id) {
      db.prepare("INSERT OR IGNORE INTO class_students (class_id, user_id) VALUES (?, ?)").run(seedClass.id, seedUser.id);
    }

    const allQuests = db.prepare("SELECT id FROM quests").all() as any[];
    allQuests.forEach((q) => {
      db.prepare("INSERT OR IGNORE INTO user_quests (user_id, quest_id) VALUES (?, ?)").run(seedUser.id, q.id);
    });
  }
}

type ItemSeed = {
  name: string;
  description: string;
  type: string;
  slotCategory: EquipSlot;
  handMode: "none" | "one_handed" | "two_handed";
  rarity: string;
  bonusXp: number;
  bonusDamage: number;
  bonusHp: number;
  price: number;
};

const ITEM_CATALOG: ItemSeed[] = [
  { name: "Cajado de Pitágoras", description: "Aumenta o ganho de XP e Dano Mágico.", type: "weapon_1h", slotCategory: "weapon_1h", handMode: "one_handed", rarity: "Raro", bonusXp: 10, bonusDamage: 15, bonusHp: 0, price: 100 },
  { name: "Adaga de Gauss", description: "Lamina leve para ataques rapidos e precisos.", type: "weapon_1h", slotCategory: "weapon_1h", handMode: "one_handed", rarity: "Comum", bonusXp: 0, bonusDamage: 12, bonusHp: 0, price: 80 },
  { name: "Lanca Longa de Arquimedes", description: "Arma de duas maos com alcance superior.", type: "weapon_2h", slotCategory: "weapon_2h", handMode: "two_handed", rarity: "Épico", bonusXp: 8, bonusDamage: 28, bonusHp: 6, price: 380 },
  { name: "Arco de Fibonacci", description: "Precisão matemática em cada disparo.", type: "weapon_2h", slotCategory: "weapon_2h", handMode: "two_handed", rarity: "Lendário", bonusXp: 15, bonusDamage: 25, bonusHp: 10, price: 500 },
  { name: "Manto da Lógica", description: "Proteção contra erros e aumento de HP.", type: "armor", slotCategory: "armor", handMode: "none", rarity: "Épico", bonusXp: 5, bonusDamage: 0, bonusHp: 50, price: 250 },
  { name: "Armadura de Euler", description: "Reforco pesado para reduzir impactos.", type: "armor", slotCategory: "armor", handMode: "none", rarity: "Raro", bonusXp: 2, bonusDamage: 0, bonusHp: 40, price: 210 },
  { name: "Escudo de Euclides", description: "Defesa sólida para guerreiros.", type: "shield", slotCategory: "shield", handMode: "one_handed", rarity: "Raro", bonusXp: 0, bonusDamage: 5, bonusHp: 30, price: 150 },
  { name: "Broquel de Tales", description: "Escudo pequeno para duelos tecnicos.", type: "shield", slotCategory: "shield", handMode: "one_handed", rarity: "Comum", bonusXp: 0, bonusDamage: 3, bonusHp: 18, price: 90 },
  { name: "Anel do Infinito", description: "Um acessório que aumenta levemente tudo.", type: "accessory", slotCategory: "accessory", handMode: "none", rarity: "Épico", bonusXp: 5, bonusDamage: 5, bonusHp: 10, price: 300 },
  { name: "Amuleto das Fracoes", description: "Aprimora foco e ganho de experiencia.", type: "accessory", slotCategory: "accessory", handMode: "none", rarity: "Raro", bonusXp: 12, bonusDamage: 0, bonusHp: 8, price: 180 },
  { name: "Poção de Concentração", description: "Aumenta o dano temporariamente (Equipável).", type: "accessory", slotCategory: "accessory", handMode: "none", rarity: "Comum", bonusXp: 0, bonusDamage: 10, bonusHp: 0, price: 50 },
];

const insertItemStatement = db.prepare(`
  INSERT INTO items (name, description, type, slot_category, hand_mode, rarity, bonus_xp, bonus_damage, bonus_hp, price)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateItemStatement = db.prepare(`
  UPDATE items
  SET description = ?, type = ?, slot_category = ?, hand_mode = ?, rarity = ?, bonus_xp = ?, bonus_damage = ?, bonus_hp = ?, price = ?
  WHERE id = ?
`);

ITEM_CATALOG.forEach((entry) => {
  const existing = db.prepare("SELECT id FROM items WHERE name = ?").get(entry.name) as { id: number } | undefined;
  if (!existing) {
    insertItemStatement.run(
      entry.name,
      entry.description,
      entry.type,
      entry.slotCategory,
      entry.handMode,
      entry.rarity,
      entry.bonusXp,
      entry.bonusDamage,
      entry.bonusHp,
      entry.price
    );
    return;
  }

  updateItemStatement.run(
    entry.description,
    entry.type,
    entry.slotCategory,
    entry.handMode,
    entry.rarity,
    entry.bonusXp,
    entry.bonusDamage,
    entry.bonusHp,
    entry.price,
    existing.id
  );
});

const starterItem = db.prepare("SELECT id FROM items WHERE name = ?").get("Cajado de Pitágoras") as { id: number } | undefined;
const starterUser = db.prepare("SELECT id FROM users WHERE id = 1").get() as { id: number } | undefined;
if (starterItem && starterUser) {
  const userOneHasStarter = db.prepare("SELECT 1 as ok FROM inventory WHERE user_id = 1 AND item_id = ?").get(starterItem.id) as { ok: number } | undefined;
  if (!userOneHasStarter) {
    db.prepare("INSERT INTO inventory (user_id, item_id, equipped) VALUES (?, ?, ?)").run(1, starterItem.id, 1);
  }
}

const DEMO_USER_EMAIL = "demo@growingmath.app";
const DEMO_USER_NAME = "Aventureiro Demo";
const DEMO_TEACHER_EMAIL = "demo.prof@growingmath.app";
const DEMO_TEACHER_NAME = "Professor Demo";

function generateDemoPassword(): string {
  // Contas demo entram pelos endpoints /demo-login; a senha existe apenas para
  // satisfazer o schema e nunca precisa ser conhecida por ninguem.
  return `Demo@${crypto.randomBytes(24).toString("base64url")}!1Aa`;
}

const DEMO_USER_PASSWORD = getOrCreatePersistedSecret("demo_user_password", generateDemoPassword);
const DEMO_TEACHER_PASSWORD = getOrCreatePersistedSecret("demo_teacher_password", generateDemoPassword);

const DEMO_TOPIC_MASTERY: Record<string, number> = {
  "ops-basicas": 100,
  fracoes: 100,
  "equacoes-1": 95,
  "geometria-basica": 90,
  funcoes: 85,
  trigonometria: 65,
  "calculo-intro": 55,
};

const DEMO_ITEM_LOADOUT = [
  "Cajado de Pitágoras",
  "Escudo de Euclides",
  "Manto da Lógica",
  "Anel do Infinito",
  "Amuleto das Fracoes",
  "Poção de Concentração",
];

function ensureDemoUserForPresentation() {
  const normalizedEmail = normalizeEmail(DEMO_USER_EMAIL);
  const { hash, salt } = hashPassword(DEMO_USER_PASSWORD);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as { id: number } | undefined;
  let userId = Number(existing?.id || 0);

  if (!userId) {
    const insertInfo = db.prepare(
      "INSERT INTO users (name, email, password_hash, password_salt, failed_attempts, lock_until, xp, coins, level, streak, hero_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(DEMO_USER_NAME, normalizedEmail, hash, salt, 0, null, 3200, 4800, 14, 9, "Mago");
    userId = Number(insertInfo.lastInsertRowid);
  } else {
    db.prepare(
      "UPDATE users SET name = ?, password_hash = ?, password_salt = ?, failed_attempts = 0, lock_until = NULL, xp = ?, coins = ?, level = ?, streak = ?, hero_class = ? WHERE id = ?"
    ).run(DEMO_USER_NAME, hash, salt, 3200, 4800, 14, 9, "Mago", userId);
  }

  Object.entries(DEMO_TOPIC_MASTERY).forEach(([topic, mastery]) => {
    const existingProgress = db.prepare("SELECT id FROM progress WHERE user_id = ? AND topic = ? LIMIT 1").get(userId, topic) as { id: number } | undefined;
    if (existingProgress?.id) {
      db.prepare("UPDATE progress SET mastery = ? WHERE id = ?").run(mastery, existingProgress.id);
      return;
    }

    db.prepare("INSERT INTO progress (user_id, topic, mastery) VALUES (?, ?, ?)").run(userId, topic, mastery);
  });

  const allQuests = db.prepare("SELECT id FROM quests").all() as Array<{ id: number }>;
  allQuests.forEach((quest) => {
    db.prepare("INSERT OR IGNORE INTO user_quests (user_id, quest_id, current_value, completed) VALUES (?, ?, ?, ?)")
      .run(userId, quest.id, 0, 0);
  });

  const loadoutItems = db
    .prepare(`SELECT id, name FROM items WHERE name IN (${DEMO_ITEM_LOADOUT.map(() => "?").join(",")})`)
    .all(...DEMO_ITEM_LOADOUT) as Array<{ id: number; name: string }>;

  loadoutItems.forEach((item) => {
    db.prepare("INSERT OR IGNORE INTO inventory (user_id, item_id, equipped) VALUES (?, ?, 0)").run(userId, item.id);
  });

  db.prepare("UPDATE inventory SET equipped = 0 WHERE user_id = ?").run(userId);

  const preferredEquipped = [
    "Cajado de Pitágoras",
    "Escudo de Euclides",
    "Manto da Lógica",
    "Anel do Infinito",
    "Amuleto das Fracoes",
  ];

  preferredEquipped.forEach((itemName) => {
    db.prepare(
      `UPDATE inventory
       SET equipped = 1
       WHERE id = (
         SELECT inv.id
         FROM inventory inv
         JOIN items i ON i.id = inv.item_id
         WHERE inv.user_id = ? AND i.name = ?
         LIMIT 1
       )`
    ).run(userId, itemName);
  });

  return userId;
}

function ensureDemoTeacherForPresentation() {
  const normalizedEmail = normalizeEmail(DEMO_TEACHER_EMAIL);
  const { hash, salt } = hashPassword(DEMO_TEACHER_PASSWORD);

  const existing = db.prepare("SELECT id FROM teacher_accounts WHERE email = ?").get(normalizedEmail) as { id: number } | undefined;
  let teacherId = Number(existing?.id || 0);

  if (!teacherId) {
    const insertInfo = db.prepare(
      "INSERT INTO teacher_accounts (full_name, email, school_name, subject, password_hash, password_salt, failed_attempts, lock_until) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)"
    ).run(DEMO_TEACHER_NAME, normalizedEmail, "Escola Demo", "Matematica", hash, salt);
    teacherId = Number(insertInfo.lastInsertRowid);
  } else {
    db.prepare(
      "UPDATE teacher_accounts SET full_name = ?, school_name = ?, subject = ?, password_hash = ?, password_salt = ?, failed_attempts = 0, lock_until = NULL WHERE id = ?"
    ).run(DEMO_TEACHER_NAME, "Escola Demo", "Matematica", hash, salt, teacherId);
  }

  const demoStudentId = ensureDemoUserForPresentation();
  const defaultStudentIds = db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 3").all() as Array<{ id: number }>;
  const studentIds = Array.from(new Set([demoStudentId, ...defaultStudentIds.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0)]));

  const existingClass = db.prepare("SELECT id FROM classes WHERE teacher_id = ? AND name = ? LIMIT 1").get(teacherId, "Turma Demo Matematica") as { id: number } | undefined;
  let classId = Number(existingClass?.id || 0);

  if (!classId) {
    const info = db.prepare(
      "INSERT INTO classes (name, teacher_id, class_code, grade_label, description, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).run("Turma Demo Matematica", teacherId, generateUniqueClassCode(), "9o ano", "Turma preparada para demonstracoes automaticas.");
    classId = Number(info.lastInsertRowid);
  } else {
    db.prepare("UPDATE classes SET grade_label = ?, description = ? WHERE id = ?")
      .run("9o ano", "Turma preparada para demonstracoes automaticas.", classId);
  }

  studentIds.forEach((studentId) => {
    db.prepare("INSERT OR IGNORE INTO class_students (class_id, user_id, joined_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run(classId, studentId);
  });

  return teacherId;
}


type StartServerOptions = {
  port?: number;
  host?: string;
};

function listenWithRetry(app: express.Express, host: string, initialPort: number, attempts = 12): Promise<http.Server> {
  const maxAttempts = Math.max(1, attempts);

  return new Promise<http.Server>((resolve, reject) => {
    let attempt = 0;

    const tryListen = (port: number) => {
      const server = app.listen(port, host, () => {
        const addressInfo = server.address();
        if (addressInfo && typeof addressInfo !== "string") {
          console.log(`Server running on http://${host}:${addressInfo.port}`);
        } else {
          console.log(`Server running on http://${host}:${port}`);
        }
        resolve(server);
      });

      server.on("error", (error: NodeJS.ErrnoException) => {
        const inUse = error?.code === "EADDRINUSE";
        const canRetry = inUse && port !== 0 && attempt < maxAttempts - 1;

        if (!canRetry) {
          reject(error);
          return;
        }

        attempt += 1;
        const nextPort = port + 1;
        console.warn(`Porta ${port} ocupada. Tentando porta ${nextPort}...`);
        tryListen(nextPort);
      });
    };

    tryListen(initialPort);
  });
}

export async function startServer(options: StartServerOptions = {}): Promise<http.Server> {
  const app = express();
  const PORT = options.port ?? Number(process.env.PORT || 3000);
  const HOST = options.host ?? process.env.HOST ?? "127.0.0.1";
  const DEMO_LOGIN_ENABLED = isEnvFlagEnabled(process.env.GROWING_MATH_DEMO);
  const EXPOSED_TO_NETWORK = !isLoopbackHost(HOST);

  const AUTH_JWT_SECRET = String(process.env.AUTH_JWT_SECRET || "").trim();
  const TEACHER_ACCESS_CODE_FROM_ENV = String(process.env.TEACHER_ACCESS_CODE || "").trim();

  // Quando o servidor escuta fora do loopback ele deixa de ser um app desktop
  // local e passa a ser um servico exposto: exigir segredos explicitos.
  if (EXPOSED_TO_NETWORK) {
    const isPlaceholder = (value: string) => /^change[_-]?me/i.test(value);

    if (AUTH_JWT_SECRET.length < 32 || isPlaceholder(AUTH_JWT_SECRET)) {
      throw new Error(
        `[security] AUTH_JWT_SECRET com 32+ caracteres aleatorios e obrigatorio quando HOST=${HOST} (fora do loopback). Configure no ambiente antes de iniciar.`
      );
    }

    if (TEACHER_ACCESS_CODE_FROM_ENV.length < 12 || isPlaceholder(TEACHER_ACCESS_CODE_FROM_ENV)) {
      throw new Error(
        `[security] TEACHER_ACCESS_CODE com 12+ caracteres nao-placeholder e obrigatorio quando HOST=${HOST} (fora do loopback). Configure no ambiente antes de iniciar.`
      );
    }
  }

  const EFFECTIVE_AUTH_JWT_SECRET =
    AUTH_JWT_SECRET.length >= 32
      ? AUTH_JWT_SECRET
      : getOrCreatePersistedSecret("auth_jwt_secret", () => crypto.randomBytes(48).toString("hex"));

  const TEACHER_ACCESS_CODE =
    TEACHER_ACCESS_CODE_FROM_ENV ||
    getOrCreatePersistedSecret("teacher_access_code", () => `PROF-${crypto.randomBytes(6).toString("hex").toUpperCase()}`);

  const USER_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 8);
  const TEACHER_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TEACHER_TOKEN_TTL_SECONDS || 60 * 60 * 8);

  if (!TEACHER_ACCESS_CODE_FROM_ENV) {
    try {
      const codeFilePath = path.join(path.dirname(dbPath), "teacher-access-code.txt");
      fs.writeFileSync(codeFilePath, `${TEACHER_ACCESS_CODE}\n`, "utf8");
      console.warn(`[security] TEACHER_ACCESS_CODE ausente; codigo local gerado: ${TEACHER_ACCESS_CODE} (salvo em ${codeFilePath})`);
    } catch {
      console.warn(`[security] TEACHER_ACCESS_CODE ausente; codigo local gerado: ${TEACHER_ACCESS_CODE}`);
    }
  }

  if (AUTH_JWT_SECRET.length < 32) {
    console.warn("[security] AUTH_JWT_SECRET ausente/fraco; usando segredo aleatorio persistido no banco local.");
  }

  if (DEMO_LOGIN_ENABLED) {
    ensureDemoUserForPresentation();
    ensureDemoTeacherForPresentation();
    console.log(`[demo] Perfil de demonstracao pronto: ${DEMO_USER_EMAIL}`);
    console.log(`[demo] Perfil de professor pronto: ${DEMO_TEACHER_EMAIL}`);
  }

  const requireAuth = (req: express.Request, res: express.Response, role?: AuthRole) => {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Autenticacao obrigatoria." });
      return null;
    }

    const auth = verifyAuthToken(EFFECTIVE_AUTH_JWT_SECRET, token);
    if (!auth) {
      res.status(401).json({ error: "Token invalido ou expirado." });
      return null;
    }

    if (role && auth.role !== role) {
      res.status(403).json({ error: "Perfil sem permissao para esta acao." });
      return null;
    }

    return auth;
  };

  app.use(corsMiddleware);
  app.use(express.json());

  app.get("/api/ai/status", async (_req, res) => {
    const provider = getAiProvider();
    const geminiConfigured = Boolean(getGeminiApiKey());
    const ollamaConfigured = Boolean(getOllamaModelFromEnv());

    let modelDetected: string | null = null;
    try {
      modelDetected = await detectOllamaModel();
    } catch {
      modelDetected = null;
    }

    const hasLocalModel = Boolean(ollamaConfigured || modelDetected);
    let runtimeMode: "gemini" | "ollama" | "offline" = "offline";

    if (provider === "gemini") {
      runtimeMode = geminiConfigured ? "gemini" : "offline";
    } else if (provider === "ollama") {
      runtimeMode = hasLocalModel ? "ollama" : "offline";
    } else {
      if (geminiConfigured) {
        runtimeMode = "gemini";
      } else if (hasLocalModel) {
        runtimeMode = "ollama";
      }
    }

    res.json({
      configured: geminiConfigured || hasLocalModel,
      provider,
      runtimeMode,
      geminiConfigured,
      ollamaConfigured,
      ollamaBaseUrl: getOllamaBaseUrl(),
      ollamaModel: getOllamaModelFromEnv() || null,
      modelDetected,
    });
  });

  app.post("/api/ai/exercise", async (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    // Proxy para a chave Gemini: sem limite, vira custo direto por abuso.
    if (!enforceRateLimit(req, res, { scope: "ai-exercise", identifier: `user:${auth.sub}`, windowMs: 60_000, max: 30, message: "Muitas geracoes de exercicio. Aguarde um instante." })) return;

    const topic = String(req.body?.topic || "Operacoes Basicas").trim();
    const level = Number(req.body?.level || 1);
    const provider = getAiProvider();
    const geminiConfigured = Boolean(getGeminiApiKey());
    const canonicalTopic = resolveCanonicalTopic(topic);
    const isGeometryTopic = canonicalTopic === "geometria-basica";

    try {
      // Geometry must stay strictly correct and consistent.
      if (isGeometryTopic) {
        return res.json(fallbackExercise(topic, level));
      }

      const modelDetected = await detectOllamaModel().catch(() => null);
      const hasLocalModel = Boolean(getOllamaModelFromEnv() || modelDetected);

      if (provider === "ollama") {
        if (!hasLocalModel) {
          return res.json(fallbackExercise(topic, level));
        }
        const exercise = await generateOllamaExercise(topic, level);
        if (!isExerciseAlignedWithTopic(exercise, topic)) {
          return res.json(fallbackExercise(topic, level));
        }
        return res.json(exercise);
      }

      if (provider === "auto" && !geminiConfigured) {
        if (!hasLocalModel) {
          return res.json(fallbackExercise(topic, level));
        }
        const exercise = await generateOllamaExercise(topic, level);
        if (!isExerciseAlignedWithTopic(exercise, topic)) {
          return res.json(fallbackExercise(topic, level));
        }
        return res.json(exercise);
      }

      if (!geminiConfigured) {
        return res.json(fallbackExercise(topic, level));
      }

      const exercise = await generateAiExercise(topic, level);
      if (!isExerciseAlignedWithTopic(exercise, topic)) {
        return res.json(fallbackExercise(topic, level));
      }
      return res.json(exercise);
    } catch (error) {
      console.error("/api/ai/exercise failed", error);
      return res.json(fallbackExercise(topic, level));
    }
  });

  app.post("/api/ai/tutor", async (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    if (!enforceRateLimit(req, res, { scope: "ai-tutor", identifier: `user:${auth.sub}`, windowMs: 60_000, max: 15, message: "Muitas perguntas seguidas ao tutor. Aguarde um instante." })) return;

    const message = String(req.body?.message || "").trim().slice(0, 2000);
    const provider = getAiProvider();
    const geminiConfigured = Boolean(getGeminiApiKey());
    if (!message) {
      return res.status(400).json({ error: "Mensagem obrigatoria." });
    }

    try {
      const modelDetected = await detectOllamaModel().catch(() => null);
      const hasLocalModel = Boolean(getOllamaModelFromEnv() || modelDetected);

      if (provider === "ollama") {
        if (!hasLocalModel) {
          return res.json({ text: buildOfflineTutorResponse(message) });
        }
        const text = await generateOllamaTutorResponse(message);
        return res.json({ text });
      }

      if (provider === "auto" && !geminiConfigured) {
        if (!hasLocalModel) {
          return res.json({ text: buildOfflineTutorResponse(message) });
        }
        const text = await generateOllamaTutorResponse(message);
        return res.json({ text });
      }

      if (!geminiConfigured) {
        return res.json({
          text: buildOfflineTutorResponse(message),
        });
      }

      const text = await generateTutorResponse(message);
      return res.json({ text });
    } catch (error) {
      console.error("/api/ai/tutor failed", error);
      return res.json({
        text: buildOfflineTutorResponse(message),
      });
    }
  });

  // API Routes
  app.post("/api/teacher-auth/register", (req, res) => {
    // Unico endpoint nao autenticado que emite token de professor: sem limite,
    // o codigo de acesso pode ser adivinhado por forca bruta.
    if (!enforceRateLimit(req, res, { scope: "teacher-register", windowMs: 60_000, max: 5, message: "Muitas tentativas de cadastro de professor. Aguarde um minuto." })) return;

    const { fullName, email, schoolName, subject, password, accessCode } = req.body ?? {};

    if (!fullName || !email || !password || !accessCode) {
      return res.status(400).json({ error: "Nome, email, senha e codigo de acesso sao obrigatorios." });
    }

    if (String(accessCode) !== TEACHER_ACCESS_CODE) {
      return res.status(403).json({ error: "Codigo de acesso de professor invalido." });
    }

    if (!isStrongPassword(String(password))) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres, incluindo maiuscula, minuscula, numero e simbolo." });
    }

    const normalizedEmail = normalizeEmail(String(email));
    const existing = db.prepare("SELECT id FROM teacher_accounts WHERE email = ?").get(normalizedEmail) as any;
    if (existing) {
      return res.status(409).json({ error: "Ja existe um professor com este email." });
    }

    const { hash, salt } = hashPassword(String(password));
    const info = db.prepare(
      "INSERT INTO teacher_accounts (full_name, email, school_name, subject, password_hash, password_salt, failed_attempts, lock_until) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)"
    ).run(String(fullName).trim(), normalizedEmail, String(schoolName || "").trim(), String(subject || "").trim(), hash, salt);

    const teacher = db.prepare(
      "SELECT id, full_name, email, school_name, subject, created_at, last_active FROM teacher_accounts WHERE id = ?"
    ).get(Number(info.lastInsertRowid));

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: teacher.id, email: teacher.email, role: "teacher" }, TEACHER_TOKEN_TTL_SECONDS);
    return res.status(201).json({ teacher, authToken });
  });

  app.post("/api/teacher-auth/login", (req, res) => {
    if (!enforceRateLimit(req, res, { scope: "teacher-login", windowMs: 60_000, max: 10, message: "Muitas tentativas de login. Aguarde um minuto." })) return;

    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha sao obrigatorios." });
    }

    const normalizedEmail = normalizeEmail(String(email));
    const teacher = db.prepare(
      "SELECT id, full_name, email, school_name, subject, password_hash, password_salt, failed_attempts, lock_until FROM teacher_accounts WHERE email = ?"
    ).get(normalizedEmail) as any;

    if (!teacher) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    if (isUserLocked(teacher.lock_until)) {
      const minutes = getLockRemainingMinutes(teacher.lock_until);
      return res.status(423).json({ error: `Perfil de professor bloqueado. Tente novamente em ${minutes} minuto(s).` });
    }

    const verification = verifyPassword(String(password), teacher.password_salt, teacher.password_hash);
    if (!verification.ok) {
      const nextAttempts = Number(teacher.failed_attempts || 0) + 1;
      if (nextAttempts >= 5) {
        const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare("UPDATE teacher_accounts SET failed_attempts = 0, lock_until = ? WHERE id = ?").run(lockUntil, teacher.id);
        return res.status(423).json({ error: "Muitas tentativas invalidas. Perfil bloqueado por 10 minutos." });
      }

      db.prepare("UPDATE teacher_accounts SET failed_attempts = ?, lock_until = NULL WHERE id = ?").run(nextAttempts, teacher.id);
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    if (verification.needsRehash) {
      const migrated = hashPassword(String(password));
      db.prepare("UPDATE teacher_accounts SET password_hash = ?, password_salt = ? WHERE id = ?")
        .run(migrated.hash, migrated.salt, teacher.id);
    }

    db.prepare("UPDATE teacher_accounts SET failed_attempts = 0, lock_until = NULL, last_active = CURRENT_TIMESTAMP WHERE id = ?").run(teacher.id);

    const payload = db.prepare(
      "SELECT id, full_name, email, school_name, subject, created_at, last_active FROM teacher_accounts WHERE id = ?"
    ).get(teacher.id);

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: payload.id, email: payload.email, role: "teacher" }, TEACHER_TOKEN_TTL_SECONDS);
    return res.json({ teacher: payload, authToken });
  });

  app.post("/api/teacher-auth/demo-login", (_req, res) => {
    if (!DEMO_LOGIN_ENABLED) {
      return res.status(403).json({ error: "Modo demonstracao desativado neste ambiente." });
    }

    const teacherId = ensureDemoTeacherForPresentation();
    const payload = db.prepare(
      "SELECT id, full_name, email, school_name, subject, created_at, last_active FROM teacher_accounts WHERE id = ?"
    ).get(teacherId) as any;

    if (!payload) {
      return res.status(500).json({ error: "Nao foi possivel carregar o professor demo." });
    }

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: payload.id, email: payload.email, role: "teacher" }, TEACHER_TOKEN_TTL_SECONDS);
    return res.json({ teacher: payload, authToken, demo: true });
  });

  app.get("/api/auth/profiles", (req, res) => {
    // Seletor de perfis e um recurso do app desktop local. Fora do loopback a
    // lista viraria enumeracao de usuarios (nome + email) para qualquer um.
    if (!isLoopbackRequest(req)) {
      return res.status(403).json({ error: "Listagem de perfis disponivel apenas no dispositivo local." });
    }

    const profiles = db
      .prepare("SELECT id, name, email, level, last_active FROM users WHERE password_hash IS NOT NULL AND password_hash != '' ORDER BY name ASC")
      .all();
    return res.json(profiles);
  });

  app.post("/api/auth/register", (req, res) => {
    if (!enforceRateLimit(req, res, { scope: "register", windowMs: 60 * 60_000, max: 20, message: "Muitos cadastros a partir deste dispositivo. Tente mais tarde." })) return;

    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, email e senha sao obrigatorios." });
    }

    if (!isStrongPassword(String(password))) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres, incluindo maiuscula, minuscula, numero e simbolo." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as any;
    if (existing) {
      return res.status(409).json({ error: "Ja existe um perfil com este email." });
    }

    const { hash, salt } = hashPassword(String(password));
    const info = db.prepare(
      "INSERT INTO users (name, email, password_hash, password_salt, failed_attempts, lock_until, xp, coins, level, streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(String(name).trim(), normalizedEmail, hash, salt, 0, null, 0, 100, 1, 0);

    const newUserId = Number(info.lastInsertRowid);
    const allQuests = db.prepare("SELECT id FROM quests").all() as any[];
    allQuests.forEach((q) => {
      db.prepare("INSERT OR IGNORE INTO user_quests (user_id, quest_id) VALUES (?, ?)").run(newUserId, q.id);
    });

    const payload = getUserPayloadById(newUserId);
    if (!payload) {
      return res.status(500).json({ error: "Nao foi possivel carregar o perfil criado." });
    }

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: payload.id, email: payload.email, role: "user" }, USER_TOKEN_TTL_SECONDS);
    return res.status(201).json({ user: payload, authToken });
  });

  app.post("/api/auth/login", (req, res) => {
    if (!enforceRateLimit(req, res, { scope: "login", windowMs: 60_000, max: 10, message: "Muitas tentativas de login. Aguarde um minuto." })) return;

    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha sao obrigatorios." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id, password_hash, password_salt, failed_attempts, lock_until FROM users WHERE email = ?").get(normalizedEmail) as any;
    if (!user || !user.password_hash || !user.password_salt) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    if (isUserLocked(user.lock_until)) {
      const minutes = getLockRemainingMinutes(user.lock_until);
      return res.status(423).json({ error: `Perfil bloqueado temporariamente. Tente novamente em ${minutes} minuto(s).` });
    }

    const verification = verifyPassword(String(password), user.password_salt, user.password_hash);
    if (!verification.ok) {
      const nextAttempts = Number(user.failed_attempts || 0) + 1;
      if (nextAttempts >= 5) {
        const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare("UPDATE users SET failed_attempts = 0, lock_until = ? WHERE id = ?").run(lockUntil, user.id);
        return res.status(423).json({ error: "Muitas tentativas invalidas. Perfil bloqueado por 5 minutos." });
      }

      db.prepare("UPDATE users SET failed_attempts = ?, lock_until = NULL WHERE id = ?").run(nextAttempts, user.id);
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    if (verification.needsRehash) {
      const migrated = hashPassword(String(password));
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(migrated.hash, migrated.salt, user.id);
    }

    db.prepare("UPDATE users SET last_active = CURRENT_TIMESTAMP, failed_attempts = 0, lock_until = NULL WHERE id = ?").run(user.id);
    const payload = getUserPayloadById(user.id);
    if (!payload) {
      return res.status(404).json({ error: "Perfil nao encontrado." });
    }

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: payload.id, email: payload.email, role: "user" }, USER_TOKEN_TTL_SECONDS);
    return res.json({ user: payload, authToken });
  });

  app.post("/api/auth/demo-login", (_req, res) => {
    if (!DEMO_LOGIN_ENABLED) {
      return res.status(403).json({ error: "Modo demonstracao desativado neste ambiente." });
    }

    const userId = ensureDemoUserForPresentation();
    const payload = getUserPayloadById(userId);
    if (!payload) {
      return res.status(500).json({ error: "Nao foi possivel carregar o perfil demo." });
    }

    const authToken = signAuthToken(EFFECTIVE_AUTH_JWT_SECRET, { sub: payload.id, email: payload.email, role: "user" }, USER_TOKEN_TTL_SECONDS);
    return res.json({ user: payload, authToken, demo: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const payload = getUserPayloadById(auth.sub);
    if (!payload) {
      return res.status(404).json({ error: "Perfil nao encontrado." });
    }

    return res.json(payload);
  });

  app.post("/api/auth/change-password", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Senha atual e nova senha sao obrigatorios." });
    }

    if (!isStrongPassword(String(newPassword))) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres, incluindo maiuscula, minuscula, numero e simbolo." });
    }

    const user = db.prepare("SELECT id, password_hash, password_salt FROM users WHERE id = ?").get(auth.sub) as any;
    if (!user || !user.password_hash || !user.password_salt) {
      return res.status(404).json({ error: "Perfil nao encontrado." });
    }

    const verification = verifyPassword(String(currentPassword), user.password_salt, user.password_hash);
    if (!verification.ok) {
      return res.status(401).json({ error: "Senha atual incorreta." });
    }

    const { hash, salt } = hashPassword(String(newPassword));
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, failed_attempts = 0, lock_until = NULL WHERE id = ?")
      .run(hash, salt, user.id);

    return res.json({ success: true });
  });

  app.get("/api/user/:email", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const { email } = req.params;
    const normalizedEmail = String(email).trim().toLowerCase();
    if (normalizedEmail !== auth.email) {
      return res.status(403).json({ error: "Acesso negado para este perfil." });
    }

    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as any;

    if (!user) {
      return res.status(404).json({ error: "Perfil nao encontrado." });
    }

    const payload = getUserPayloadById(user.id);
    return res.json(payload);
  });

  app.post("/api/user/update-progress", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const action = req.body?.action;
    if (!isProgressAction(action)) {
      return res.status(400).json({ error: "Acao de progresso invalida." });
    }

    const topic = String(req.body?.topic || "").trim();
    if (!VALID_TOPIC_IDS.has(topic)) {
      return res.status(400).json({ error: "Topico invalido." });
    }

    const reward = PROGRESS_REWARDS[action];

    // Cooldown por usuario/acao: mesmo com token valido, impede script que
    // dispara a rota em loop para farmar recompensa.
    if (
      !enforceRateLimit(req, res, {
        scope: `progress|${action}`,
        identifier: `user:${auth.sub}`,
        windowMs: reward.minIntervalMs,
        max: 1,
        message: "Aguarde antes de registrar um novo progresso.",
      })
    ) {
      return;
    }

    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(auth.sub) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    // Valores vem da tabela do servidor; o cliente nunca informa quanto ganhou.
    const bonusPercent = reward.applyEquipmentXpBonus ? getEquippedXpBonusPercent(user.id) : 0;
    const xpGain = Math.round(reward.xp * (1 + bonusPercent / 100));
    const coinsGain = reward.coins;
    const masteryIncrease = reward.mastery;

    const applyProgress = db.transaction(() => {
      db.prepare("UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?").run(xpGain, coinsGain, user.id);

      // Recalculate level based on cumulative XP (100 XP per level)
      const updatedUser = db.prepare("SELECT xp FROM users WHERE id = ?").get(user.id) as any;
      const newLevel = Math.floor(Number(updatedUser?.xp || 0) / 100) + 1;
      db.prepare("UPDATE users SET level = ? WHERE id = ?").run(newLevel, user.id);

      // Update topic progress
      const existingProgress = db.prepare("SELECT id FROM progress WHERE user_id = ? AND topic = ?").get(user.id, topic) as any;
      if (existingProgress) {
        db.prepare("UPDATE progress SET mastery = MIN(100, mastery + ?) WHERE id = ?").run(masteryIncrease, existingProgress.id);
      } else {
        db.prepare("INSERT INTO progress (user_id, topic, mastery) VALUES (?, ?, ?)").run(user.id, topic, masteryIncrease);
      }

      // Update Quests
      const activeQuests = db.prepare("SELECT uq.*, q.type, q.target_value, q.reward_xp, q.reward_coins FROM user_quests uq JOIN quests q ON uq.quest_id = q.id WHERE uq.user_id = ? AND uq.completed = 0").all(user.id) as any[];

      activeQuests.forEach((q) => {
        let increment = 0;
        if (q.type === 'exercises') increment = 1;
        else if (q.type === 'xp') increment = xpGain;
        else if (q.type === 'coins') increment = coinsGain;

        const newValue = Number(q.current_value || 0) + increment;
        const completed = newValue >= Number(q.target_value || 0) ? 1 : 0;

        db.prepare("UPDATE user_quests SET current_value = ?, completed = ? WHERE user_id = ? AND quest_id = ?").run(newValue, completed, user.id, q.quest_id);

        if (completed) {
          db.prepare("UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?").run(q.reward_xp, q.reward_coins, user.id);
        }
      });

      const finalUser = db.prepare("SELECT xp FROM users WHERE id = ?").get(user.id) as any;
      const finalLevel = Math.floor(Number(finalUser?.xp || 0) / 100) + 1;
      db.prepare("UPDATE users SET level = ? WHERE id = ?").run(finalLevel, user.id);
    });

    applyProgress();

    res.json({ success: true, xpGain, coinsGain, masteryIncrease });
  });

  app.post("/api/user/update-class", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const heroClass = String(req.body?.heroClass || "").trim();
    if (!VALID_HERO_CLASSES.has(heroClass)) {
      return res.status(400).json({ error: "Classe de heroi invalida." });
    }

    db.prepare("UPDATE users SET hero_class = ? WHERE id = ?").run(heroClass, auth.sub);
    res.json({ success: true });
  });

  app.post("/api/user/equip-item", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const { inventoryId, equipped } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(auth.sub) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    const item = db.prepare(`
      SELECT i.name, COALESCE(i.slot_category, i.type) as equip_type FROM items i 
      JOIN inventory inv ON i.id = inv.item_id 
      WHERE inv.id = ? AND inv.user_id = ?
    `).get(inventoryId, user.id) as any;

    if (!item) {
      return res.status(404).json({ error: "Item não encontrado no inventário." });
    }

    if (equipped) {
      const selectedSlot = normalizeEquipSlot(item.equip_type, item.name);
      const equippedRows = db.prepare(`
        SELECT i.name, COALESCE(i.slot_category, i.type) as equip_type
        FROM inventory inv
        JOIN items i ON i.id = inv.item_id
        WHERE inv.user_id = ? AND inv.equipped = 1 AND inv.id != ?
      `).all(user.id, inventoryId) as Array<{ name: string; equip_type: string }>;

      const counts: Record<EquipSlot, number> = {
        accessory: 0,
        armor: 0,
        weapon_1h: 0,
        weapon_2h: 0,
        shield: 0,
      };

      equippedRows.forEach((row) => {
        const slot = normalizeEquipSlot(row.equip_type, row.name);
        counts[slot] += 1;
      });

      const reject = (message: string) => {
        res.status(400).json({
          error: message,
          limits: EQUIP_LIMITS,
          counts,
        });
      };

      if (selectedSlot === "accessory" && counts.accessory >= EQUIP_LIMITS.accessory) {
        return reject("Limite de acessórios atingido (2). Desequipe um acessório antes de equipar outro.");
      }

      if (selectedSlot === "armor" && counts.armor >= EQUIP_LIMITS.armor) {
        return reject("Você já possui uma armadura equipada.");
      }

      if (selectedSlot === "weapon_2h") {
        if (counts.weapon_2h >= 1 || counts.weapon_1h > 0 || counts.shield > 0) {
          return reject("Arma de 2 mãos não pode ser combinada com arma de 1 mão ou escudo.");
        }
      }

      if (selectedSlot === "weapon_1h") {
        if (counts.weapon_2h > 0) {
          return reject("Não é possível equipar arma de 1 mão com arma de 2 mãos equipada.");
        }
        if (counts.weapon_1h >= EQUIP_LIMITS.weapon_1h) {
          return reject("Limite de armas de 1 mão atingido (2).");
        }
        if (counts.shield >= 1 && counts.weapon_1h >= 1) {
          return reject("Com escudo equipado, só é permitido usar 1 arma de 1 mão.");
        }
      }

      if (selectedSlot === "shield") {
        if (counts.weapon_2h > 0) {
          return reject("Escudo não pode ser usado com arma de 2 mãos.");
        }
        if (counts.shield >= EQUIP_LIMITS.shield) {
          return reject("Você já possui um escudo equipado.");
        }
        if (counts.weapon_1h >= 2) {
          return reject("Desequipe uma arma de 1 mão para usar escudo.");
        }
      }
    }

    db.prepare("UPDATE inventory SET equipped = ? WHERE id = ? AND user_id = ?").run(equipped ? 1 : 0, inventoryId, user.id);
    res.json({ success: true });
  });

  app.get("/api/shop", (req, res) => {
    const items = db.prepare("SELECT *, COALESCE(slot_category, type) as equip_type FROM items").all();
    res.json(items);
  });

  app.post("/api/shop/buy", (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const itemId = Number(req.body?.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: "Item invalido." });
    }

    const item = db.prepare("SELECT id, price FROM items WHERE id = ?").get(itemId) as any;
    if (!item) {
      return res.status(404).json({ error: "User or Item not found" });
    }

    const price = Math.max(0, Number(item.price || 0));

    // Debito e entrega precisam ser atomicos para nao gerar item sem cobranca.
    const purchase = db.transaction(() => {
      const info = db.prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?").run(price, auth.sub, price);
      if (info.changes === 0) return false;
      db.prepare("INSERT INTO inventory (user_id, item_id) VALUES (?, ?)").run(auth.sub, itemId);
      return true;
    });

    if (!purchase()) {
      const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(auth.sub);
      if (!exists) return res.status(404).json({ error: "User or Item not found" });
      return res.status(400).json({ error: "Moedas insuficientes" });
    }

    res.json({ success: true });
  });

  app.get("/api/leaderboard", (req, res) => {
    // Expoe nomes de alunos: exige sessao valida.
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const topUsers = db.prepare("SELECT name, xp, level, hero_class FROM users ORDER BY xp DESC LIMIT 10").all();
    res.json(topUsers);
  });

  app.get("/api/teacher/students/search", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const query = String(req.query?.q || "").trim().toLowerCase();
    const teacherId = auth.sub;

    const limit = 20;
    const rows = query
      ? db
          .prepare(
            `SELECT id, name, email, level, xp, coins, last_active
             FROM users
             WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?
             ORDER BY xp DESC
             LIMIT ?`
          )
          .all(`%${query}%`, `%${query}%`, limit)
      : db
          .prepare(
            `SELECT id, name, email, level, xp, coins, last_active
             FROM users
             ORDER BY xp DESC
             LIMIT ?`
          )
          .all(limit);

    return res.json(rows);
  });

  app.post("/api/teacher/classes", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const name = String(req.body?.name || "").trim();
    const gradeLabel = String(req.body?.gradeLabel || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Nome da sala e obrigatorio." });
    }

    const classCode = generateUniqueClassCode();
    const info = db
      .prepare("INSERT INTO classes (name, teacher_id, class_code, grade_label, description, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(name, teacherId, classCode, gradeLabel, description);

    const created = db
      .prepare("SELECT id, name, teacher_id, class_code, grade_label, description, created_at FROM classes WHERE id = ?")
      .get(Number(info.lastInsertRowid));

    return res.status(201).json(created);
  });

  app.get("/api/teacher/classes", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const classes = db
      .prepare("SELECT id, name, teacher_id, class_code, grade_label, description, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC, id DESC")
      .all(teacherId);

    const result = classes.map((c: any) => {
      const students = db
        .prepare(
          `SELECT u.id, u.name, u.email, u.level, u.xp, u.coins, u.last_active,
                  COALESCE(ROUND(AVG(CAST(p.mastery AS REAL)), 1), 0) as avg_mastery
           FROM users u
           JOIN class_students cs ON u.id = cs.user_id
           LEFT JOIN progress p ON p.user_id = u.id
           WHERE cs.class_id = ?
           GROUP BY u.id
           ORDER BY u.xp DESC, u.name ASC`
        )
        .all(c.id);

      return {
        id: c.id,
        name: c.name,
        teacherId: c.teacher_id,
        classCode: c.class_code,
        gradeLabel: c.grade_label || "",
        description: c.description || "",
        createdAt: c.created_at,
        studentCount: students.length,
        students,
      };
    });

    return res.json(result);
  });

  app.post("/api/teacher/classes/:classId/students", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const classId = Number(req.params.classId || 0);
    const teacherId = auth.sub;
    const studentEmail = normalizeEmail(String(req.body?.studentEmail || ""));

    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ error: "classId invalido." });
    }

    if (!studentEmail) {
      return res.status(400).json({ error: "Email do aluno e obrigatorio." });
    }

    const room = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, teacherId) as any;
    if (!room) {
      return res.status(404).json({ error: "Sala nao encontrada para este professor." });
    }

    const student = db.prepare("SELECT id, name, email, level, xp, coins FROM users WHERE email = ?").get(studentEmail) as any;
    if (!student) {
      return res.status(404).json({ error: "Aluno nao encontrado. Cadastre o aluno antes de vincular." });
    }

    db.prepare("INSERT OR IGNORE INTO class_students (class_id, user_id, joined_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(classId, student.id);

    return res.json({ success: true, student });
  });

  app.delete("/api/teacher/classes/:classId/students/:userId", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const classId = Number(req.params.classId || 0);
    const userId = Number(req.params.userId || 0);
    const teacherId = auth.sub;

    if (!Number.isFinite(classId) || classId <= 0 || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Parametros invalidos." });
    }

    const room = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, teacherId) as any;
    if (!room) {
      return res.status(404).json({ error: "Sala nao encontrada para este professor." });
    }

    db.prepare("DELETE FROM class_students WHERE class_id = ? AND user_id = ?").run(classId, userId);
    return res.json({ success: true });
  });

  app.get("/api/teacher/dashboard", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const classRows = db.prepare("SELECT id, name, teacher_id FROM classes WHERE teacher_id = ? ORDER BY name ASC").all(teacherId) as Array<{ id: number; name: string; teacher_id: number }>;

    const classIds = classRows.map((row) => row.id);

    const summary = classIds.length > 0
      ? (db
          .prepare(
            `SELECT
               COUNT(*) as total_students,
               ROUND(AVG(CAST(u.level AS REAL)), 1) as avg_level,
               SUM(CASE WHEN DATE(u.last_active) = DATE('now') THEN 1 ELSE 0 END) as active_today,
               SUM(u.xp) as total_xp
             FROM users u
             JOIN class_students cs ON cs.user_id = u.id
             WHERE cs.class_id IN (${classIds.map(() => "?").join(",")})`
          )
          .get(...classIds) as any)
      : ({ total_students: 0, avg_level: 0, active_today: 0, total_xp: 0 } as any);

    const classes = classRows.map((row) => {
      const stats = db
        .prepare(
          `SELECT
             COUNT(*) as student_count,
             ROUND(AVG(CAST(u.level AS REAL)), 1) as avg_level
           FROM users u
           JOIN class_students cs ON cs.user_id = u.id
           WHERE cs.class_id = ?`
        )
        .get(row.id) as any;

      return {
        id: row.id,
        name: row.name,
        teacherId: row.teacher_id,
        studentCount: Number(stats?.student_count || 0),
        avgLevel: Number(stats?.avg_level || 0),
      };
    });

    const topStudents = classIds.length > 0
      ? db
          .prepare(
            `SELECT u.name, u.email, u.level, u.xp, u.coins, u.last_active
             FROM users u
             JOIN class_students cs ON cs.user_id = u.id
             WHERE cs.class_id IN (${classIds.map(() => "?").join(",")})
             ORDER BY u.xp DESC
             LIMIT 8`
          )
          .all(...classIds)
      : [];

    const strugglingTopics = classIds.length > 0
      ? db
          .prepare(
            `SELECT p.topic, ROUND(AVG(CAST(p.mastery AS REAL)), 1) as avg_mastery, COUNT(*) as records
             FROM progress p
             JOIN class_students cs ON cs.user_id = p.user_id
             WHERE cs.class_id IN (${classIds.map(() => "?").join(",")})
             GROUP BY p.topic
             ORDER BY avg_mastery ASC, records DESC
             LIMIT 8`
          )
          .all(...classIds)
      : [];

    res.json({
      summary: {
        totalStudents: Number(summary?.total_students || 0),
        avgLevel: Number(summary?.avg_level || 0),
        activeToday: Number(summary?.active_today || 0),
        totalXp: Number(summary?.total_xp || 0),
      },
      classes,
      topStudents,
      strugglingTopics,
    });
  });

  app.get("/api/teacher/reports/class", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const classId = Number(req.query?.classId || 0);

    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ error: "classId invalido." });
    }

    const room = db
      .prepare("SELECT id, name, class_code, grade_label, description FROM classes WHERE id = ? AND teacher_id = ?")
      .get(classId, teacherId) as any;

    if (!room) {
      return res.status(404).json({ error: "Sala nao encontrada para este professor." });
    }

    const summary = db
      .prepare(
        `SELECT
           COUNT(*) as total_students,
           ROUND(AVG(CAST(u.level AS REAL)), 1) as avg_level,
           ROUND(AVG(CAST(u.xp AS REAL)), 1) as avg_xp,
           SUM(CASE WHEN DATE(u.last_active) = DATE('now') THEN 1 ELSE 0 END) as active_today
         FROM users u
         JOIN class_students cs ON cs.user_id = u.id
         WHERE cs.class_id = ?`
      )
      .get(classId) as any;

    const byTopic = db
      .prepare(
        `SELECT p.topic, ROUND(AVG(CAST(p.mastery AS REAL)), 1) as avg_mastery, COUNT(*) as records
         FROM progress p
         JOIN class_students cs ON cs.user_id = p.user_id
         WHERE cs.class_id = ?
         GROUP BY p.topic
         ORDER BY avg_mastery ASC, records DESC`
      )
      .all(classId);

    const students = db
      .prepare(
        `SELECT
           u.id,
           u.name,
           u.email,
           u.level,
           u.xp,
           u.coins,
           u.last_active,
           COALESCE(ROUND(AVG(CAST(p.mastery AS REAL)), 1), 0) as avg_mastery,
           (
             SELECT p2.topic
             FROM progress p2
             WHERE p2.user_id = u.id
             ORDER BY p2.mastery ASC
             LIMIT 1
           ) as weakest_topic
         FROM users u
         JOIN class_students cs ON cs.user_id = u.id
         LEFT JOIN progress p ON p.user_id = u.id
         WHERE cs.class_id = ?
         GROUP BY u.id
         ORDER BY u.xp DESC, u.name ASC`
      )
      .all(classId);

    return res.json({
      classInfo: {
        id: room.id,
        name: room.name,
        classCode: room.class_code,
        gradeLabel: room.grade_label || "",
        description: room.description || "",
      },
      summary: {
        totalStudents: Number(summary?.total_students || 0),
        avgLevel: Number(summary?.avg_level || 0),
        avgXp: Number(summary?.avg_xp || 0),
        activeToday: Number(summary?.active_today || 0),
      },
      byTopic,
      students,
    });
  });

  app.get("/api/teacher/personalizations", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const classId = Number(req.query?.classId || 0);

    const classFilter = Number.isFinite(classId) && classId > 0;

    const rows = classFilter
      ? db
          .prepare(
            `SELECT tsp.id, tsp.teacher_id, tsp.user_id, tsp.target_topic, tsp.weekly_goal, tsp.difficulty_preset, tsp.support_style, tsp.focus_notes, tsp.updated_at,
                    u.name as student_name, u.email as student_email
             FROM teacher_student_personalizations tsp
             JOIN users u ON u.id = tsp.user_id
             JOIN class_students cs ON cs.user_id = u.id
             WHERE tsp.teacher_id = ? AND cs.class_id = ?
             ORDER BY u.name ASC`
          )
          .all(teacherId, classId)
      : db
          .prepare(
            `SELECT tsp.id, tsp.teacher_id, tsp.user_id, tsp.target_topic, tsp.weekly_goal, tsp.difficulty_preset, tsp.support_style, tsp.focus_notes, tsp.updated_at,
                    u.name as student_name, u.email as student_email
             FROM teacher_student_personalizations tsp
             JOIN users u ON u.id = tsp.user_id
             WHERE tsp.teacher_id = ?
             ORDER BY u.name ASC`
          )
          .all(teacherId);

    return res.json(rows);
  });

  app.post("/api/teacher/personalizations", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;

    const teacherId = auth.sub;
    const userId = Number(req.body?.userId || 0);
    const targetTopic = String(req.body?.targetTopic || "").trim();
    const weeklyGoalRaw = Number(req.body?.weeklyGoal || 3);
    const weeklyGoal = Math.max(1, Math.min(21, Number.isFinite(weeklyGoalRaw) ? Math.floor(weeklyGoalRaw) : 3));
    const difficultyPreset = String(req.body?.difficultyPreset || "equilibrado").trim().toLowerCase();
    const supportStyle = String(req.body?.supportStyle || "passo_a_passo").trim().toLowerCase();
    const focusNotes = String(req.body?.focusNotes || "").trim();

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Aluno invalido." });
    }

    const student = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as any;
    if (!student) {
      return res.status(404).json({ error: "Aluno nao encontrado." });
    }

    db.prepare(
      `INSERT INTO teacher_student_personalizations
       (teacher_id, user_id, target_topic, weekly_goal, difficulty_preset, support_style, focus_notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(teacher_id, user_id)
       DO UPDATE SET
         target_topic = excluded.target_topic,
         weekly_goal = excluded.weekly_goal,
         difficulty_preset = excluded.difficulty_preset,
         support_style = excluded.support_style,
         focus_notes = excluded.focus_notes,
         updated_at = CURRENT_TIMESTAMP`
    ).run(teacherId, userId, targetTopic, weeklyGoal, difficultyPreset, supportStyle, focusNotes);

    const saved = db
      .prepare(
        `SELECT tsp.id, tsp.teacher_id, tsp.user_id, tsp.target_topic, tsp.weekly_goal, tsp.difficulty_preset, tsp.support_style, tsp.focus_notes, tsp.updated_at,
                u.name as student_name, u.email as student_email
         FROM teacher_student_personalizations tsp
         JOIN users u ON u.id = tsp.user_id
         WHERE tsp.teacher_id = ? AND tsp.user_id = ?`
      )
      .get(teacherId, userId);

    return res.json(saved);
  });

  app.get("/api/teacher/recommendations", (req, res) => {
    const auth = requireAuth(req, res, "teacher");
    if (!auth) return;
    const teacherId = auth.sub;

    const weakest = db
      .prepare(
        `SELECT p.topic, ROUND(AVG(CAST(p.mastery AS REAL)), 1) as avg_mastery, COUNT(*) as records
         FROM progress p
         JOIN class_students cs ON cs.user_id = p.user_id
         JOIN classes c ON c.id = cs.class_id
         WHERE c.teacher_id = ?
         GROUP BY p.topic
         ORDER BY avg_mastery ASC, records DESC
         LIMIT 3`
      )
      .all(teacherId) as Array<{ topic: string; avg_mastery: number; records: number }>;

    const recommendations = weakest.map((item) => ({
      topic: item.topic,
      mastery: Number(item.avg_mastery || 0),
      priority: item.avg_mastery < 45 ? "alta" : item.avg_mastery < 65 ? "media" : "baixa",
      suggestion:
        item.avg_mastery < 45
          ? `Reforce ${item.topic} com uma mini-revisao de 10 minutos e 3 exercicios guiados em grupo.`
          : `Aplique uma atividade rapida de consolidacao em ${item.topic} e acompanhe duplas de apoio.`,
    }));

    return res.json({ recommendations });
  });

  // Endpoint para receber feedback
  app.post('/api/feedback', (req, res) => {
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).send('Feedback is required');
    }

    try {
      db.prepare('INSERT INTO feedback (content) VALUES (?)').run(String(feedback));
      return res.status(200).send('Feedback received');
    } catch (err) {
      console.error(err);
      return res.status(500).send('Failed to save feedback');
    }
  });

  // Endpoint para obter o desafio diario
  app.get('/api/daily-challenge', (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const challengeKey = dailyChallengeKey();
    const challenge = buildDailyChallenge(challengeKey);

    const attempt = db
      .prepare('SELECT completed, attempts FROM daily_challenge_attempts WHERE user_id = ? AND challenge_key = ?')
      .get(auth.sub, challengeKey) as any;

    const completed = Boolean(attempt?.completed);
    const attempts = Number(attempt?.attempts || 0);

    return res.json({
      id: challenge.id,
      challengeKey: challenge.challengeKey,
      title: challenge.title,
      question: challenge.question,
      options: challenge.options,
      rewardXp: challenge.rewardXp,
      rewardCoins: challenge.rewardCoins,
      completed,
      attempts,
      createdAt: challenge.createdAt,
    });
  });

  // Endpoint para enviar resposta do desafio diario
  app.post('/api/daily-challenge/submit', (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    if (!enforceRateLimit(req, res, { scope: "daily-submit", identifier: `user:${auth.sub}`, windowMs: 10_000, max: 5, message: 'Aguarde antes de tentar novamente.' })) return;

    const selectedOption = Number(req.body?.selectedOption);
    const requestedKey = String(req.body?.challengeKey || '').trim();

    if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
      return res.status(400).json({ message: 'Opcao escolhida invalida.' });
    }

    const user = db.prepare('SELECT id, xp FROM users WHERE id = ?').get(auth.sub) as any;
    if (!user) {
      return res.status(404).json({ message: 'Perfil nao encontrado.' });
    }

    const todayKey = dailyChallengeKey();
    // Impede escolher uma chave antiga/futura para refarmar a recompensa.
    const challengeKey = requestedKey && requestedKey === todayKey ? requestedKey : todayKey;
    const challenge = buildDailyChallenge(challengeKey);
    const isCorrect = selectedOption === challenge.correctAnswerIndex;

    const existing = db
      .prepare('SELECT id, attempts, completed FROM daily_challenge_attempts WHERE user_id = ? AND challenge_key = ?')
      .get(user.id, challengeKey) as any;

    if (existing?.completed) {
      return res.json({
        success: true,
        correct: true,
        alreadyCompleted: true,
        completed: true,
        attempts: Number(existing.attempts || 1),
        rewardXp: 0,
        rewardCoins: 0,
        message: 'Voce ja concluiu o desafio diario de hoje.',
      });
    }

    const nextAttempts = Number(existing?.attempts || 0) + 1;
    let rewardXp = 0;
    let rewardCoins = 0;

    if (isCorrect) {
      rewardXp = challenge.rewardXp;
      rewardCoins = challenge.rewardCoins;
    }

    if (!existing) {
      db.prepare(
        'INSERT INTO daily_challenge_attempts (user_id, challenge_key, attempts, completed, last_selected_option, awarded_xp, awarded_coins, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
      ).run(
        user.id,
        challengeKey,
        nextAttempts,
        isCorrect ? 1 : 0,
        selectedOption,
        rewardXp,
        rewardCoins,
        isCorrect ? new Date().toISOString() : null
      );
    } else {
      db.prepare(
        'UPDATE daily_challenge_attempts SET attempts = ?, completed = ?, last_selected_option = ?, awarded_xp = ?, awarded_coins = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(
        nextAttempts,
        isCorrect ? 1 : 0,
        selectedOption,
        rewardXp,
        rewardCoins,
        isCorrect ? new Date().toISOString() : null,
        existing.id
      );
    }

    if (isCorrect) {
      db.prepare('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?').run(rewardXp, rewardCoins, user.id);
      const refreshed = db.prepare('SELECT xp FROM users WHERE id = ?').get(user.id) as any;
      const newLevel = Math.floor(Number(refreshed?.xp || 0) / 100) + 1;
      db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, user.id);
    }

    return res.json({
      success: true,
      correct: isCorrect,
      alreadyCompleted: false,
      completed: isCorrect,
      attempts: nextAttempts,
      rewardXp,
      rewardCoins,
      message: isCorrect
        ? `Resposta correta! +${rewardXp} XP e +${rewardCoins} moedas.`
        : 'Resposta incorreta. Revise e tente novamente.',
    });
  });

  app.get('/api/daily-challenge/history', (req, res) => {
    const auth = requireAuth(req, res, "user");
    if (!auth) return;

    const data = getDailyHistoryForUser(Number(auth.sub), new Date(), 7);
    return res.json(data);
  });

  // Rota /api inexistente precisa responder JSON 404, e nao cair no catch-all
  // que devolve o index.html com status 200. Em modo remoto isso e critico: o
  // cliente faria res.json() no HTML e estouraria "Unexpected token '<'",
  // escondendo a causa real (rota errada ou versao de API incompativel).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota de API nao encontrada." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = resolveDistDir();

    // O HTML e servido com a configuracao injetada em vez de ir direto pelo
    // disco: e assim que API_BASE_URL chega ao front sem recompilar o bundle.
    const sendHtmlWithConfig = (res: express.Response, filePath: string) => {
      try {
        const html = fs.readFileSync(filePath, "utf8");
        res.type("html").send(injectRuntimeConfig(html));
      } catch {
        res.sendFile(filePath);
      }
    };

    const indexEntry = path.join(distDir, "index.html");

    // Registrado ANTES do express.static: o static serviria os .html crus,
    // sem a config injetada.
    app.get(["/", "/index.html"], (_req, res) => {
      sendHtmlWithConfig(res, indexEntry);
    });

    app.get(['/teacher.html', '/professores'], (_req, res) => {
      const teacherEntry = path.join(distDir, 'teacher.html');
      if (fs.existsSync(teacherEntry)) {
        return sendHtmlWithConfig(res, teacherEntry);
      }

      return sendHtmlWithConfig(res, indexEntry);
    });

    // index:false para que "/" nao seja capturado aqui e perca a injecao.
    app.use(express.static(distDir, { index: false }));

    app.get("*", (_req, res) => {
      sendHtmlWithConfig(res, indexEntry);
    });
  }

  return await listenWithRetry(app, HOST, PORT);
}

if (process.env.GROWING_MATH_AUTOSTART !== "false") {
  startServer();
}
