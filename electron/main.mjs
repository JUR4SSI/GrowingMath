import { app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import dotenv from "dotenv";

let mainWindow = null;
let localServer = null;

function writeRuntimeLog(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "runtime.log");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Ignore logging failures.
  }
}

function loadRuntimeSecrets() {
  const candidates = [
    path.join(path.dirname(process.execPath), ".env"),
    path.join(app.getPath("userData"), "growing-math.env"),
    path.join(process.cwd(), ".env"),
  ];

  let loadedAny = false;

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
      // API_BASE_URL: quando preenchido, o app passa a consumir a API hospedada
      // (AWS) em vez do servidor local. Vazio mantem o modo local de hoje.
      const keys = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "AI_PROVIDER", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "API_BASE_URL"];
      let loadedFromThisFile = false;

      for (const key of keys) {
        const raw = parsed[key];
        if (raw === undefined || raw === null) continue;
        const value = String(raw).trim();
        if (!value) continue;
        if (process.env[key]) continue;
        process.env[key] = value;
        loadedFromThisFile = true;
        loadedAny = true;
      }

      if (loadedFromThisFile) {
        writeRuntimeLog(`runtime-secrets-loaded source=${filePath}`);
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      writeRuntimeLog(`gemini-key-load-failed source=${filePath} error=${details}`);
    }
  }

  if (!loadedAny) {
    writeRuntimeLog("runtime-secrets-not-found");
  }
}

async function probeOllama(baseUrl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// O instalador registra o Ollama no autostart, mas o usuario pode ter fechado o
// tray. Sem isto, o app cairia em modo offline sem nenhuma explicacao.
async function ensureOllamaRunning() {
  const provider = String(process.env.AI_PROVIDER || "auto").toLowerCase();
  if (provider === "gemini") return;

  const baseUrl = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/i.test(baseUrl)) return;

  if (await probeOllama(baseUrl, 1500)) {
    writeRuntimeLog("ollama-already-running");
    return;
  }

  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama app.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe"),
  ];
  const exePath = candidates.find((candidate) => candidate && fs.existsSync(candidate));

  if (!exePath) {
    writeRuntimeLog("ollama-not-installed");
    return;
  }

  try {
    const args = exePath.endsWith("ollama.exe") ? ["serve"] : [];
    const child = spawn(exePath, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    writeRuntimeLog(`ollama-spawned path=${exePath}`);
  } catch (error) {
    writeRuntimeLog(`ollama-spawn-failed ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await probeOllama(baseUrl, 1500)) {
      writeRuntimeLog(`ollama-ready after=${attempt + 1}s`);
      return;
    }
  }

  writeRuntimeLog("ollama-start-timeout");
}

async function startBackendServer() {
  process.env.NODE_ENV = "production";
  process.env.GROWING_MATH_AUTOSTART = "false";
  process.env.GROWING_MATH_DEMO = process.env.GROWING_MATH_DEMO || "true";
  process.env.GROWING_MATH_DB_PATH = path.join(app.getPath("userData"), "growing_math.db");
  loadRuntimeSecrets();
  await ensureOllamaRunning();

  const { startServer } = await import("../build/server.mjs");
  // Use an ephemeral port to avoid startup failures when 3000 is already occupied.
  localServer = await startServer({ port: 0, host: "127.0.0.1" });

  const addressInfo = localServer.address();
  if (!addressInfo || typeof addressInfo === "string") {
    throw new Error("Nao foi possivel determinar a porta local do servidor.");
  }

  return addressInfo.port;
}

function createWindow(serverPort) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    writeRuntimeLog(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    writeRuntimeLog(`renderer-console level=${level} source=${sourceId}:${line} message=${message}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeRuntimeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const serverPort = await startBackendServer();
    writeRuntimeLog(`server-started port=${serverPort}`);
    createWindow(serverPort);
  } catch (error) {
    const details = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
    writeRuntimeLog(`startup-error ${details}`);
    dialog.showErrorBox("Falha ao iniciar o Growing Math", details);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const addressInfo = localServer?.address();
      if (addressInfo && typeof addressInfo !== "string") {
        createWindow(addressInfo.port);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
  }
});
