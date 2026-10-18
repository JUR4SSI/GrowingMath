/**
 * Resolucao da base da API em tempo de EXECUCAO.
 *
 * Hoje o Express local serve o front e a API na mesma origem, entao a base e
 * uma string vazia e todo fetch continua relativo - exatamente o comportamento
 * atual. Quando a API for hospedada (AWS), basta definir API_BASE_URL no .env:
 * o servidor local injeta o valor em window.__GROWING_MATH_CONFIG__ ao servir o
 * HTML e as mesmas chamadas passam a apontar para a nuvem.
 *
 * A resolucao e de runtime, e nao de build, de proposito: trocar de servidor
 * nao pode exigir recompilar e redistribuir o instalador.
 */

declare global {
  interface Window {
    __GROWING_MATH_CONFIG__?: { apiBaseUrl?: string };
  }
}

function readRuntimeBase(): string {
  if (typeof window === "undefined") return "";
  const value = window.__GROWING_MATH_CONFIG__?.apiBaseUrl;
  return typeof value === "string" ? value.trim() : "";
}

// Fallback para `npm run dev`, onde quem serve o front e o Vite e nao o Express.
function readBuildBase(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    const value = env?.VITE_API_BASE_URL;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

let cachedBase: string | null = null;

export function getApiBaseUrl(): string {
  if (cachedBase !== null) return cachedBase;
  const base = readRuntimeBase() || readBuildBase();
  cachedBase = base ? base.replace(/\/+$/, "") : "";
  return cachedBase;
}

/** true quando o app esta consumindo uma API remota em vez do servidor local. */
export function isRemoteApi(): boolean {
  return getApiBaseUrl() !== "";
}

/** Converte um caminho de API em URL absoluta quando ha servidor remoto. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
