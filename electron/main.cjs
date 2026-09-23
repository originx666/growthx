const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require("electron");
const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");

const APP_NAME = "歌若思";
app.setName(APP_NAME);


function aiConfigPath() {
  return path.join(app.getPath("userData"), "ai-config.json");
}

function normalizeAiConfig(input = {}) {
  return {
    endpoint: String(input.endpoint || "").trim(),
    apiKey: String(input.apiKey || "").trim(),
    model: String(input.model || "").trim(),
    includeAppContext: input.includeAppContext === true
  };
}

function readPersistentAiConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(aiConfigPath(), "utf8"));
    let apiKey = "";
    if (stored.keyProtection === "safeStorage" && stored.apiKeyCipher && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(stored.apiKeyCipher, "base64"));
    } else if (stored.keyProtection === "plain" && typeof stored.apiKey === "string") {
      apiKey = stored.apiKey;
    }
    return normalizeAiConfig({ ...stored, apiKey });
  } catch (_) {
    return normalizeAiConfig();
  }
}

function writePersistentAiConfig(input = {}) {
  const config = normalizeAiConfig(input);
  const target = aiConfigPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stored = {
    version: 1,
    endpoint: config.endpoint,
    model: config.model,
    includeAppContext: config.includeAppContext,
    updatedAt: new Date().toISOString()
  };
  if (safeStorage.isEncryptionAvailable()) {
    stored.keyProtection = "safeStorage";
    stored.apiKeyCipher = safeStorage.encryptString(config.apiKey).toString("base64");
  } else {
    stored.keyProtection = "plain";
    stored.apiKey = config.apiKey;
  }
  fs.writeFileSync(target, JSON.stringify(stored), "utf8");
  return config;
}

ipcMain.handle("geruosi:get-ai-config", () => readPersistentAiConfig());
ipcMain.handle("geruosi:save-ai-config", (_event, config = {}) => writePersistentAiConfig(config));

function getWindowsFonts() {
  try {
    const script = [
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
      "$p='HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
      "$names=if(Test-Path $p){(Get-ItemProperty -LiteralPath $p).PSObject.Properties|Where-Object{$_.MemberType -eq 'NoteProperty' -and $_.Name -notlike 'PS*' -and [string]$_.Value -match '\\.(ttf|otf|ttc|fon)$'}|ForEach-Object{$_.Name -replace '\\s*\\((TrueType|OpenType|All res)\\)\\s*$',''}}",
      "$names|Where-Object{$_}|Sort-Object -Unique|ConvertTo-Json -Compress"
    ].join("; ");
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
    const parsed = JSON.parse(output.trim() || "[]");
    return (Array.isArray(parsed) ? parsed : [parsed]).map((name) => String(name).trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

ipcMain.handle("geruosi:get-system-fonts", () => getWindowsFonts());
ipcMain.handle("geruosi:save-data-package", async (event, payload = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const content = String(payload.content || "");
  if (!content || Buffer.byteLength(content, "utf8") > 512 * 1024 * 1024) throw new Error("导出数据为空或超过 512 MB。");
  const safeName = String(payload.filename || "歌若思-个人数据.growthx").replace(/[<>:"/\|?*]/g, "-");
  const result = await dialog.showSaveDialog(win, { title: "导出个人数据", defaultPath: safeName, filters: [{ name: "GrowthX 用户数据", extensions: ["growthx"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, content, "utf8");
  return { canceled: false, filePath: result.filePath };
});
ipcMain.handle("geruosi:capture-canvas-preview", async (event, rect = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) throw new Error("窗口不可用");
  const bounds = win.getContentBounds();
  const x = Math.max(0, Math.round(Number(rect.x) || 0));
  const y = Math.max(0, Math.round(Number(rect.y) || 0));
  const width = Math.max(1, Math.min(Math.round(Number(rect.width) || 1), bounds.width - x));
  const height = Math.max(1, Math.min(Math.round(Number(rect.height) || 1), bounds.height - y));
  const image = await win.webContents.capturePage({ x, y, width, height });
  const preview = image.resize({ width: 960, quality: "good" });
  return preview.toDataURL();
});
ipcMain.handle("geruosi:render-office-preview", (_event, payload = {}) => {
  const input=String(payload.path||""),kind=String(payload.kind||"");
  if(!fs.existsSync(input)||!["word","ppt"].includes(kind))throw new Error("文件不存在或格式不支持");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"geruosi-review-")),output=path.join(dir,"preview.pdf"),q=value=>`'${String(value).replace(/'/g,"''")}'`;
  const script=kind==="word"
    ? `$ErrorActionPreference='Stop';$app=New-Object -ComObject Word.Application;$app.Visible=$false;try{$doc=$app.Documents.Open(${q(input)},$false,$true);$pages=$doc.ComputeStatistics(2);$doc.ExportAsFixedFormat(${q(output)},17);$doc.Close($false);[Console]::Write($pages)}finally{$app.Quit()}`
    : `$ErrorActionPreference='Stop';$app=New-Object -ComObject PowerPoint.Application;try{$deck=$app.Presentations.Open(${q(input)},$true,$true,$false);$pages=$deck.Slides.Count;$deck.SaveAs(${q(output)},32);$deck.Close();[Console]::Write($pages)}finally{$app.Quit()}`;
  try{const pages=Number(execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{encoding:"utf8",windowsHide:true,maxBuffer:16*1024*1024}).trim())||1;const base64=fs.readFileSync(output).toString("base64");return{src:`data:application/pdf;base64,${base64}`,pages};}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: "#ffffff",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#43544f",
      height: 30
    },
    icon: path.join(__dirname, "..", "assets", "app-icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  let startupShown = false;
  const showLoadedWindow = async () => {
    if (startupShown || mainWindow.isDestroyed()) return;
    try {
      await mainWindow.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        true
      );
    } catch (_) {
      return;
    }
    if (startupShown || mainWindow.isDestroyed()) return;
    startupShown = true;
    mainWindow.show();
  };
  mainWindow.webContents.once("did-finish-load", showLoadedWindow);
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || mainWindow.isDestroyed()) return;
    console.error("Main page failed to load", { errorCode, errorDescription, validatedURL });
    dialog.showErrorBox("歌若思启动失败", `主页面加载失败（${errorCode}）：${errorDescription}`);
    mainWindow.destroy();
  });
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

ipcMain.handle("geruosi:ask-ai", async (_event, payload = {}) => {
  const message = String(payload.message || "").trim();
  const context = String(payload.context || "").slice(0, 12000);
  if (!message) return { reply: "请先输入问题。" };
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GERUOSI_OLLAMA_MODEL || "qwen2.5:7b",
        stream: false,
        messages: [
          { role: "system", content: "你是歌若思的本地学习顾问。只根据用户提供的项目和学习生涯数据给出具体建议；数据不足时明确说明，不得编造。使用自然中文并合理分段。" },
          { role: "user", content: `本地学习数据：\n${context}\n\n用户问题：${message}` }
        ]
      }),
      signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return { reply: data?.message?.content || "本地模型没有返回内容。" };
  } catch (error) {
    return { reply: "本地 AI 尚未就绪。请安装 Ollama，执行 `ollama pull qwen2.5:7b`，并保持 Ollama 运行后重试。", error: error.message };
  }
});

ipcMain.handle("geruosi:ask-configured-ai", async (_event, payload = {}) => {
  const endpointInput = String(payload.endpoint || "").trim();
  const apiKey = String(payload.apiKey || "").trim();
  const model = String(payload.model || "").trim();
  const prompt = String(payload.prompt || "").trim();
  const images = Array.isArray(payload.images) ? payload.images.filter((value) => /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(String(value))).slice(0, 4) : [];
  if (!endpointInput || !apiKey || !model || !prompt) throw new Error("API 地址、密钥、模型和提示词不能为空。");
  let endpoint;
  try {
    const url = new URL(endpointInput);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    endpoint = url.toString().replace(/\/$/, "");
  } catch (_) {
    throw new Error("API 地址格式不正确，请填写 http:// 或 https:// 开头的地址。");
  }
  if (!/\/chat\/completions$/i.test(endpoint)) endpoint += "/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是一名严谨、非决定论的生涯探索助手。请使用自然中文，区分兴趣偏好、能力与职业适配，不做诊断或保证。" },
        { role: "user", content: images.length ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : prompt }
      ],
      temperature: 0.6
    }),
    signal: AbortSignal.timeout(30000)
  });
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch (_) {}
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || raw.slice(0, 240) || "服务商未返回错误说明";
    const code = body?.error?.code || body?.code || "";
    throw new Error(`AI 服务商返回 HTTP ${response.status}${code ? ` / ${code}` : ""}：${detail}`);
  }
  const reply = body?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("API 已响应，但没有返回可读取的文本内容。");
  return { reply: String(reply) };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("geruosi:check-updates",async()=>{
 const currentVersion=app.getVersion();
 const source=require("../package.json").geruosiUpdateUrl;
 if(!source)return {currentVersion,status:"unconfigured"};
 try{
  const url=new URL(source);if(url.protocol!=="https:")throw Error("更新地址必须使用 HTTPS");
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("更新服务暂时不可用（"+response.status+"）");
  const data=await response.json(),latestVersion=String(data.version||data.tag_name||"").replace(/^v/,"");
  if(!/^\d+\.\d+\.\d+$/.test(latestVersion))throw Error("更新服务返回的版本格式不正确");
  const parts=v=>v.split(".").map(Number),a=parts(latestVersion),b=parts(currentVersion);
  let newer=false;for(let i=0;i<3;i++){if(a[i]!==b[i]){newer=a[i]>b[i];break;}}
  return {currentVersion,latestVersion,status:newer?"available":"latest",notes:String(data.notes||data.body||"暂无更新说明")};
 }catch(error){return {currentVersion,status:"error",message:error.message};}
});
