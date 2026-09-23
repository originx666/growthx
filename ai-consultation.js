/* Unified AI consultation: project conversations, learning interpretation and personal chats. */
(() => {
  const CONFIG_KEY = "geruosi-ai-api-config-v1";
  const uid = (prefix = "ai") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let pendingAttachments = [];
  let sending = false;
  let draggingChatId = "";
  let chatDragGhost = null;

  function openFolderNameDialog(folder = null) {
    const dialog = document.querySelector("[data-folder-dialog]");
    if (!dialog) return;
    const input = dialog.querySelector("input");
    dialog.dataset.editFolderId = folder?.id || "";
    dialog.querySelector("h3").textContent = folder ? "重命名文件夹" : "新建文件夹";
    dialog.querySelector("p").textContent = folder ? "修改文件夹名称，已有对话归类不会改变。" : "输入文件夹名称，用来归集相关对话。";
    dialog.querySelector("[data-folder-confirm]").textContent = folder ? "保存" : "创建";
    input.value = folder?.name || "";
    dialog.hidden = false;
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function config() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch (_) { return {}; }
  }
  function configured() {
    const current = config();
    return Boolean(current.endpoint && current.apiKey && current.model);
  }
  function openAiSettings() {
    document.getElementById("profileButton")?.click();
    requestAnimationFrame(() => {
      document.querySelector('[data-settings-tab="ai"]')?.click();
      if (!configured()) setTimeout(() => window.openAiConfigurationTutorial?.(), 80);
    });
  }
  function ensureStore() {
    state.aiConsultation ||= { chats: [], folders: [], activeChatId: "" };
    const store = state.aiConsultation;
    store.chats = Array.isArray(store.chats) ? store.chats : [];
    store.folders = Array.isArray(store.folders) ? store.folders : [];
    state.aiChats = state.aiChats && typeof state.aiChats === "object" ? state.aiChats : {};
    const projects = Array.isArray(state.projects) ? state.projects : [];
    projects.forEach((project) => {
      const id = `project:${project.id}`;
      const projectMessages = Array.isArray(state.aiChats[project.id]) ? state.aiChats[project.id] : [];
      let chat = store.chats.find((entry) => entry.id === id);
      if (!projectMessages.length) {
        if (chat) store.chats = store.chats.filter((entry) => entry.id !== id);
        return;
      }
      if (!chat) {
        chat = { id, title: project.name || "项目对话", sourceType: "project", sourceId: project.id, folderId: "", pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
        store.chats.push(chat);
      }
      chat.title = project.name || chat.title || "项目对话";
      chat.messages = projectMessages;
      const latestMessageTime = projectMessages.at(-1)?.createdAt;
      if (latestMessageTime) chat.updatedAt = latestMessageTime;
    });
    store.chats.forEach((chat) => {
      chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
      if (chat.sourceType === "project" && chat.sourceId) state.aiChats[chat.sourceId] = chat.messages;
    });
    if (!store.chats.some((chat) => chat.id === store.activeChatId)) store.activeChatId = store.chats[0]?.id || "";
    return store;
  }
  function currentChat() {
    const store = ensureStore();
    return store.chats.find((chat) => chat.id === store.activeChatId) || null;
  }
  function persist() {
    try { saveState(); } catch (_) {}
  }
  function petSvg(className = "pet-large") {
    return `<svg class="${className}" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="aiPetBody" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff9147"/><stop offset="1" stop-color="#ffb779"/></linearGradient></defs><path class="pet-leaf" d="M48 25c-2-13 8-20 23-18 0 13-9 20-23 18Z"/><path class="pet-leaf" d="M46 25C45 14 36 8 24 10c1 11 9 17 22 15Z"/><path class="pet-body" d="M13 62c0-22 15-39 35-39s35 17 35 39c0 18-13 27-35 27S13 80 13 62Z"/><ellipse class="pet-eye" cx="37" cy="58" rx="4" ry="8"/><ellipse class="pet-eye" cx="59" cy="58" rx="4" ry="8"/></svg>`;
  }
  function ensureView() {
    let view = document.getElementById("aiView");
    if (view) return view;
    view = document.createElement("section");
    view.id = "aiView";
    view.className = "view ai-consultation-view";
    view.innerHTML = `
      <aside class="ai-consult-sidebar">
        <header class="ai-consult-brand"><strong>AI 咨询</strong><button class="ai-consult-icon-button" type="button" data-new-folder title="新建文件夹" aria-label="新建文件夹"><svg viewBox="0 0 24 24"><path d="M3.5 7.5h6.2l2.1 2.2h8.7v9.2h-17V7.5Z"/><path d="M15.7 12.1v4.4m-2.2-2.2h4.4"/></svg></button></header>
        <button class="ai-consult-new" type="button" data-new-chat><svg viewBox="0 0 24 24"><path d="M5 5h14v12H9l-4 3V5Z"/><path d="M12 8v6m-3-3h6"/></svg><span>新建对话</span></button>
        <div class="ai-consult-nav-scroll" data-chat-nav></div>
        <footer class="ai-consult-account" data-ai-account></footer>
      </aside>
      <main class="ai-consult-main">
        <header class="ai-consult-header"><div><h2 data-chat-title>新对话</h2><small data-chat-source>个人咨询</small></div><span class="ai-consult-model"><i></i><b data-ai-model>尚未配置</b></span></header>
        <section class="ai-consult-messages" data-ai-messages aria-live="polite"></section>
        <footer class="ai-composer-zone">
          <div class="ai-attachment-tray" data-attachment-tray></div>
          <div class="ai-composer"><button class="ai-attach-button" data-attach type="button" title="上传文件" aria-label="上传文件"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><textarea data-ai-input rows="2" placeholder="给 origin 发送信息"></textarea><button class="ai-send-button" data-ai-send type="button" aria-label="发送"><svg viewBox="0 0 24 24"><path d="M12 18V6m-5 5 5-5 5 5"/></svg></button><input data-file-input type="file" multiple hidden></div>
          <p class="ai-composer-note">AI 可能会出错，请结合原始记录判断。</p>
        </footer>
      </main>
      <div class="ai-folder-dialog" data-folder-dialog hidden>
        <section role="dialog" aria-modal="true" aria-labelledby="aiFolderDialogTitle">
          <header><div><h3 id="aiFolderDialogTitle">新建文件夹</h3><p>输入文件夹名称，用来归集相关对话。</p></div></header>
          <label><span>文件夹名称</span><input maxlength="20" placeholder="请输入文件夹名称"></label>
          <footer><button type="button" data-folder-cancel>取消</button><button type="button" data-folder-confirm>创建</button></footer>
        </section>
      </div>`;
    document.querySelector("main.workspace")?.append(view);
    const folderDialog = view.querySelector("[data-folder-dialog]");
    if (folderDialog) document.body.append(folderDialog);
    bindView(view);
    return view;
  }
  function newChat(options = {}) {
    const store = ensureStore();
    const chat = {
      id: uid("chat"), title: options.title || "新对话", sourceType: options.sourceType || "personal", sourceId: options.sourceId || "",
      folderId: options.folderId || "", pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: []
    };
    store.chats.unshift(chat); store.activeChatId = chat.id; persist(); return chat;
  }
  function chatMessages(chat) {
    if (!chat) return [];
    if (chat.sourceType === "project" && chat.sourceId) {
      state.aiChats[chat.sourceId] = Array.isArray(state.aiChats[chat.sourceId]) ? state.aiChats[chat.sourceId] : chat.messages;
      chat.messages = state.aiChats[chat.sourceId];
    }
    return chat.messages;
  }
  function sortChats(items) {
    return [...items].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  function closeChatContextMenu() {
    document.querySelectorAll(".ai-chat-context-menu").forEach((menu) => menu.remove());
  }
  function openChatContextMenu(event, chat, store) {
    event.preventDefault();
    event.stopPropagation();
    closeChatContextMenu();
    const menu = document.createElement("div");
    menu.className = "ai-chat-context-menu";
    menu.innerHTML = `<button type="button" data-pin><svg viewBox="0 0 24 24"><path d="m9 4 6 0 1 6 3 3H5l3-3 1-6Zm3 9v7"/></svg><span>${chat.pinned ? "取消置顶" : "置顶对话"}</span></button><button type="button" class="danger" data-delete><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>删除对话</span></button>`;
    document.body.append(menu);
    const width = 188;
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 142))}px`;
    menu.querySelector("[data-pin]").onclick = () => { chat.pinned = !chat.pinned; chat.updatedAt = new Date().toISOString(); closeChatContextMenu(); persist(); render(); };
    menu.querySelector("[data-delete]").onclick = () => { store.chats = store.chats.filter((entry) => entry.id !== chat.id); if (chat.sourceType === "project" && chat.sourceId) state.aiChats[chat.sourceId] = []; if (store.activeChatId === chat.id) store.activeChatId = store.chats[0]?.id || ""; closeChatContextMenu(); persist(); render(); };
  }
  function chatRow(chat, store) {
    const row = document.createElement("div"); row.className = `ai-chat-row${chat.id === store.activeChatId ? " active" : ""}`; row.dataset.chatId = chat.id;
    row.draggable = true;
    row.innerHTML = `<button class="ai-chat-open" type="button"><span>${esc(chat.title || "新对话")}</span></button>`;
    row.querySelector(".ai-chat-open").onclick = () => { store.activeChatId = chat.id; persist(); render(); };
    row.oncontextmenu = (event) => openChatContextMenu(event, chat, store);
    row.ondragstart = (event) => { draggingChatId = chat.id; row.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", chat.id); closeChatContextMenu(); chatDragGhost?.remove(); chatDragGhost = document.createElement("div"); chatDragGhost.className = "ai-chat-drag-ghost"; chatDragGhost.textContent = chat.title || "新对话"; document.body.append(chatDragGhost); event.dataTransfer.setDragImage(chatDragGhost, 26, 20); };
    row.ondragend = () => { draggingChatId = ""; row.classList.remove("dragging"); chatDragGhost?.remove(); chatDragGhost = null; document.querySelectorAll(".ai-consult-section.drop-target").forEach((target) => target.classList.remove("drop-target")); };
    return row;
  }
  function section(title, chats, store, options = {}) {
    if (!chats.length && !options.always) return null;
    const block = document.createElement("section"); block.className = "ai-consult-section";
    if (options.folderId) block.classList.add("ai-folder-section");
    block.innerHTML = options.folderId
      ? `<header class="ai-consult-section-head ai-folder-heading"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6.2l2.1 2.2h8.7v9.2h-17V7.5Z"/></svg><b>${esc(title)}</b></span></header><div class="ai-consult-list"></div>`
      : `<header class="ai-consult-section-head"><span>${esc(title)}</span></header><div class="ai-consult-list"></div>`;
    const list = block.querySelector(".ai-consult-list"); sortChats(chats).forEach((chat) => list.append(chatRow(chat, store)));
    if (options.folderId) block.querySelector("header").oncontextmenu = (event) => {
      event.preventDefault(); event.stopPropagation(); closeChatContextMenu();
      const menu = document.createElement("div"); menu.className = "ai-chat-context-menu ai-folder-context-menu";
      menu.innerHTML = `<button type="button" data-rename-folder><svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4"/></svg><span>重命名文件夹</span></button><button type="button" class="danger" data-delete-folder><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>删除文件夹</span></button>`;
      document.body.append(menu); menu.style.left = `${Math.max(10, Math.min(event.clientX, window.innerWidth - 198))}px`; menu.style.top = `${Math.max(10, Math.min(event.clientY, window.innerHeight - 58))}px`;
      menu.querySelector("[data-rename-folder]").onclick = () => { const folder = store.folders.find((entry) => entry.id === options.folderId); closeChatContextMenu(); if (folder) openFolderNameDialog(folder); };
      menu.querySelector("[data-delete-folder]").onclick = () => { store.folders = store.folders.filter((folder) => folder.id !== options.folderId); store.chats.forEach((chat) => { if (chat.folderId === options.folderId) chat.folderId = ""; }); closeChatContextMenu(); persist(); render(); };
    };
    if (options.folderId || options.dropRoot) {
      const targetFolderId = options.folderId || "";
      block.ondragover = (event) => { if (!draggingChatId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; block.classList.add("drop-target"); };
      block.ondragleave = (event) => { if (!block.contains(event.relatedTarget)) block.classList.remove("drop-target"); };
      block.ondrop = (event) => { event.preventDefault(); block.classList.remove("drop-target"); const chatId = draggingChatId || event.dataTransfer.getData("text/plain"); const moved = store.chats.find((entry) => entry.id === chatId); if (!moved) return; moved.folderId = targetFolderId; moved.pinned = false; moved.updatedAt = new Date().toISOString(); draggingChatId = ""; persist(); render(); };
    }
    return block;
  }
  function richText(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n"); const output = []; let list = "";
    const close = () => { if (list) output.push(`</${list}>`); list = ""; };
    const inline = (value) => esc(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    lines.forEach((raw) => { const line = raw.trim(); if (!line) { close(); return; } const bullet = line.match(/^[-*]\s+(.+)/); const numbered = line.match(/^\d+[.)、]\s*(.+)/); if (bullet || numbered) { const next = bullet ? "ul" : "ol"; if (next !== list) { close(); list = next; output.push(`<${list}>`); } output.push(`<li>${inline((bullet || numbered)[1])}</li>`); return; } close(); const heading = line.match(/^#{1,4}\s+(.+)/); output.push(heading ? `<h4>${inline(heading[1])}</h4>` : `<p>${inline(line)}</p>`); }); close(); return output.join("");
  }
  function suggestedFollowUps(content = "") {
    const text = String(content);
    if (/API|密钥|模型|配置|额度|请求失败|繁忙/.test(text)) return ["帮我逐项检查当前配置", "推荐一个更稳定的低价模型", "告诉我现在最该做哪一步"];
    if (/职业|兴趣|能力|性格|价值观|分析/.test(text)) return ["继续深入分析", "结合我的资料给出行动建议", "帮我找出最值得验证的方向"];
    if (/项目|计划|任务|进度|目标/.test(text)) return ["整理成具体行动步骤", "帮我确定下一步优先级", "指出这个计划可能遗漏什么"];
    return ["继续深入分析", "给我三个具体行动建议", "用更简单的话总结一下"];
  }

  async function copyAssistantAnswer(content, button) {
    const text = String(content || "");
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const fallback = document.createElement("textarea");
      fallback.value = text; fallback.setAttribute("readonly", ""); fallback.style.position = "fixed"; fallback.style.opacity = "0";
      document.body.append(fallback); fallback.select(); document.execCommand("copy"); fallback.remove();
    }
    button.classList.add("copied");
    button.title = "已复制";
    setTimeout(() => { button.classList.remove("copied"); button.title = "复制回答"; }, 1400);
  }

  function actionIcon(label, svg, onClick, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ai-answer-icon ${extraClass}`.trim();
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = svg;
    button.onclick = onClick;
    return button;
  }

  function createAssistantActions(message, chat, messageIndex) {
    const wrap = document.createElement("div");
    wrap.className = "ai-answer-action-wrap";
    const inferredFailure = message.status === "failed" ? null : window.geruosiInferFailureFromText?.(message.content);
    const recoveryMessage = inferredFailure ? { ...message, ...inferredFailure, status: "failed" } : message;
    if (message.status === "failed" || inferredFailure) {
      wrap.classList.add("ai-failure-actions");
      if (recoveryMessage.retryable !== false) {
        const retry = document.createElement("button");
        retry.type = "button"; retry.className = "ai-recovery-primary"; retry.textContent = "重新发送"; retry.disabled = sending;
        retry.onclick = () => { if (!sending) sendMessage({ retryMessageIndex: messageIndex }); };
        wrap.append(retry);
      }
      const settings = document.createElement("button");
      settings.type = "button"; settings.className = "ai-recovery-secondary"; settings.textContent = "检查 AI 配置";
      settings.onclick = openAiSettings;
      const doubao = document.createElement("button");
      const guideLabels = { network: "无法连接服务", endpoint: "API 地址错误", auth: "密钥或权限失败", model: "模型不可用", quota: "额度或余额不足", busy: "服务繁忙或限流", request: "请求格式不兼容", response: "返回内容不兼容", local: "本地 AI 未启动", unknown: "其他未知问题" };
      doubao.type = "button";
      doubao.className = "ai-recovery-doubao ai-recovery-guide-link";
      doubao.innerHTML = `<span>建议排查：${esc(guideLabels[recoveryMessage.errorKind] || guideLabels.unknown)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;
      doubao.onclick = () => window.openAiTroubleshootingWithDoubao?.(recoveryMessage);
      wrap.append(settings, doubao);
      return wrap;
    }
    if (message.status === "retrying") return wrap;

    const tools = document.createElement("div");
    tools.className = "ai-answer-actions";
    const copy = actionIcon("复制回答", '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>', () => copyAssistantAnswer(message.content, copy), "ai-answer-copy");
    tools.append(copy);
    const feedback = (value) => {
      message.feedback = message.feedback === value ? "" : value;
      persist(); render();
    };
    const up = actionIcon("回答有帮助", '<svg viewBox="0 0 24 24"><path d="M7.5 10.5 11 4c.7 0 1.4.5 1.5 1.3l-.3 4.2H18a2 2 0 0 1 2 2.4l-1.1 5.5A2 2 0 0 1 17 19H7.5V10.5Z"></path><path d="M4 10.5h3.5V19H4z"></path></svg>', () => feedback("up"), message.feedback === "up" ? "active" : "");
    const down = actionIcon("回答需要改进", '<svg viewBox="0 0 24 24"><path d="M7.5 13.5 11 20c.7 0 1.4-.5 1.5-1.3l-.3-4.2H18a2 2 0 0 0 2-2.4l-1.1-5.5A2 2 0 0 0 17 5H7.5v8.5Z"></path><path d="M4 5h3.5v8.5H4z"></path></svg>', () => feedback("down"), message.feedback === "down" ? "active" : "");
    tools.append(up, down);
    const branch = actionIcon("从这里生成支线对话", '<svg viewBox="0 0 24 24"><path d="M7 4v8a4 4 0 0 0 4 4h6"></path><path d="M13 8h4a3 3 0 0 1 3 3v7"></path><circle cx="7" cy="4" r="2"></circle><circle cx="20" cy="19" r="2"></circle><circle cx="17" cy="8" r="2"></circle></svg>', () => {
      const fork = newChat({ title: `${chat?.title || "对话"} · 支线` });
      fork.messages = JSON.parse(JSON.stringify(chatMessages(chat).slice(0, messageIndex + 1)));
      fork.updatedAt = new Date().toISOString();
      persist(); render();
    });
    tools.append(branch);
    const time = document.createElement("span");
    time.className = "ai-answer-time";
    time.title = "回答时间";
    const stamp = message.createdAt ? new Date(message.createdAt) : new Date();
    time.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg><span>${Number.isNaN(stamp.getTime()) ? "" : stamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>`;
    tools.append(time);
    wrap.append(tools);
    const suggestions = document.createElement("div"); suggestions.className = "ai-answer-suggestions";
    suggestedFollowUps(message.content).forEach((prompt) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = prompt; button.title = "点击后直接发送"; button.disabled = sending;
      button.onclick = () => { if (!sending) sendMessage({ text: prompt }); };
      suggestions.append(button);
    });
    wrap.append(suggestions);
    return wrap;
  }

  function renderMessages(view, chat) {
    const box = view.querySelector("[data-ai-messages]"); box.replaceChildren();
    if (!chat || !chatMessages(chat).length) { box.innerHTML = `<div class="ai-consult-empty">${petSvg()}<h3>今天想聊些什么？</h3><p>可以讨论项目、学习记录、自我探索，也可以上传文件开始一次新的个人咨询。</p></div>`; return; }
    chatMessages(chat).forEach((message, messageIndex) => {
      const row = document.createElement("article"); row.className = `ai-message-row ${message.role === "user" ? "user" : "assistant"}`;
      const content = document.createElement("div"); content.className = message.role === "user" ? "ai-message-user" : "ai-message-assistant";
      if (message.role === "user") {
        if (message.card) content.insertAdjacentHTML("beforeend", `<div class="ai-message-card"><small>${esc(message.card.type || "学习资料")}</small><strong>${esc(message.card.title || "待解读内容")}</strong><p>${esc(message.card.summary || "已附上完整记录，请结合资料解读。")}</p></div>`);
        if (message.attachments?.length) content.insertAdjacentHTML("beforeend", `<div class="ai-message-files">${message.attachments.map((file) => `<span class="ai-message-file">${esc(file.name)}</span>`).join("")}</div>`);
        content.insertAdjacentHTML("beforeend", `<span>${esc(message.content)}</span>`);
      } else if (message.status === "failed") {
        content.classList.add("ai-message-failure");
        content.innerHTML = `<span class="ai-failure-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 17h.01"></path><path d="M10.3 4.6 3.4 17a2 2 0 0 0 1.8 3h13.6a2 2 0 0 0 1.8-3L13.7 4.6a2 2 0 0 0-3.4 0Z"></path></svg></span><div><strong>${esc(message.errorTitle || "AI 请求没有完成")}</strong><p>${esc(message.content)}</p>${message.errorDetail ? `<small>${esc(message.errorDetail)}</small>` : ""}</div>`;
      } else if (message.status === "retrying") {
        content.classList.add("ai-message-retrying");
        content.innerHTML = '<span class="ai-thinking"><i></i><i></i><i></i></span><span data-ai-thinking-status>正在重新连接并核对原问题…</span>';
      } else if (message.status === "streaming") {
        content.classList.add("ai-message-streaming");
        content.dataset.aiStreamId = message.streamId || "";
        content.innerHTML = '<span class="ai-stream-text"></span><i class="ai-stream-caret" aria-hidden="true"></i>';
      } else content.innerHTML = richText(message.content);
      row.append(content);
      if (message.role !== "user" && !["retrying", "streaming"].includes(message.status)) row.append(createAssistantActions(message, chat, messageIndex));
      box.append(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  async function revealAssistantAnswer(view, answer) {
    const target = view.querySelector(`[data-ai-stream-id="${answer.streamId}"] .ai-stream-text`);
    const row = target?.closest("[data-ai-stream-id]");
    const box = view.querySelector("[data-ai-messages]");
    if (!target || !row || !box) return;
    const characters = Array.from(String(answer.content || ""));
    const chunkSize = characters.length > 1400 ? 4 : characters.length > 700 ? 3 : 2;
    for (let index = 0; index < characters.length; index += chunkSize) {
      if (!target.isConnected || answer.status !== "streaming") return;
      target.textContent += characters.slice(index, index + chunkSize).join("");
      if (index % (chunkSize * 5) === 0) box.scrollTop = box.scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    box.scrollTop = box.scrollHeight;
  }
  function renderAttachments(view) {
    const tray = view.querySelector("[data-attachment-tray]"); tray.innerHTML = pendingAttachments.map((file, index) => `<span class="ai-attachment-chip">${esc(file.name)}<button type="button" data-remove-file="${index}">×</button></span>`).join("");
    tray.querySelectorAll("[data-remove-file]").forEach((button) => button.onclick = () => { pendingAttachments.splice(Number(button.dataset.removeFile), 1); renderAttachments(view); });
  }
  function render() {
    const view = ensureView(); const store = ensureStore(); const nav = view.querySelector("[data-chat-nav]"); nav.replaceChildren();
    const pinned = store.chats.filter((chat) => chat.pinned); const pinnedSection = section("已置顶", pinned, store); if (pinnedSection) nav.append(pinnedSection);
    store.folders.forEach((folder) => { const block = section(folder.name, store.chats.filter((chat) => !chat.pinned && chat.folderId === folder.id), store, { folderId: folder.id, always: true }); nav.append(block); });
    const others = store.chats.filter((chat) => !chat.pinned && !chat.folderId); const otherSection = section("对话", others, store, { always: true, dropRoot: true }); nav.append(otherSection);
    const chat = currentChat(); view.querySelector("[data-chat-title]").textContent = chat?.title || "新对话"; view.querySelector("[data-chat-source]").textContent = chat?.sourceType === "project" ? "项目制学习对话" : chat?.sourceType === "career" ? "学习生涯 AI 解读" : chat?.sourceType === "canvas" ? "画布 AI 咨询" : "个人咨询";
    const cfg = config(); view.querySelector("[data-ai-model]").textContent = configured() ? cfg.model : "尚未配置";
    const profile = state.userProfile || {}; const email = profile.email || state.accountOwnerEmail || "本地账户"; const name = profile.name || "创想家"; view.querySelector("[data-ai-account]").innerHTML = `<i>${esc(Array.from(name)[0] || "创")}</i><span><b>${esc(name)}</b><small>${esc(email)}</small></span>`;
    renderMessages(view, chat); renderAttachments(view); view.querySelector("[data-ai-send]").disabled = sending;
  }
  function contextualData(chat) {
    const cfg = config();
    if (cfg.includeAppContext === true && typeof geruosiFullLearningAiContext === "function") {
      const project = chat?.sourceType === "project" ? (state.projects || []).find((item) => item.id === chat.sourceId) : null;
      return geruosiFullLearningAiContext(project);
    }
    if (chat?.sourceType === "project" && typeof geruosiLearningAiContext === "function") return geruosiLearningAiContext((state.projects || []).find((item) => item.id === chat.sourceId));
    return "这是一次歌若思中的个人咨询。只依据用户在本次对话主动提供的内容回答；信息不足时先询问，不要编造记录。";
  }
  async function sendMessage(options = {}) {
    if (sending) return;
    await window.geruosiAiConfigReady;
    const view = ensureView();
    const input = view.querySelector("[data-ai-input]");
    let chat = currentChat();
    const retryMessageIndex = Number.isInteger(options.retryMessageIndex) ? options.retryMessageIndex : -1;
    const isRetry = retryMessageIndex >= 0;
    let user;
    let text;
    let attachments;

    if (isRetry) {
      if (!chat) return;
      const messages = chatMessages(chat);
      user = messages[retryMessageIndex - 1];
      if (!user || user.role !== "user") return;
      text = String(user.content || "").trim();
      attachments = Array.isArray(user.attachments) ? user.attachments : [];
      messages[retryMessageIndex] = { ...messages[retryMessageIndex], role: "assistant", status: "retrying", content: "正在重新发送…" };
    } else {
      text = String(options.text ?? input.value).trim();
      if (!text) return;
      if (!configured()) { openAiSettings(); return; }
      if (!chat) chat = newChat({ title: text.slice(0, 18) || "新对话" });
      attachments = options.attachments || pendingAttachments.map((file) => ({ ...file }));
      user = { role: "user", content: text, createdAt: new Date().toISOString(), attachments, card: options.card || null, contextPrompt: options.contextPrompt || "" };
      chatMessages(chat).push(user);
      if (chat.title === "新对话") chat.title = text.slice(0, 18);
      chat.updatedAt = user.createdAt;
      input.value = ""; pendingAttachments = [];
    }

    sending = true; persist(); render();
    const messages = chatMessages(chat);
    const userIndex = messages.indexOf(user);
    const history = messages.slice(Math.max(0, userIndex - 12), userIndex)
      .filter((item) => item.status !== "failed" && item.status !== "retrying")
      .map((item) => `${item.role === "user" ? "用户" : "AI"}：${item.content}`).join("\n\n");
    const fileText = attachments.filter((file) => file.text).map((file) => `【附件：${file.name}】\n${file.text}`).join("\n\n");
    const request = [options.contextPrompt || user.contextPrompt, fileText, history ? `【最近对话】\n${history}` : "", `【当前问题】\n${text}`].filter(Boolean).join("\n\n");

    let thinkingTimer = 0;
    if (!isRetry) {
      const box = view.querySelector("[data-ai-messages]");
      const thinking = document.createElement("article"); thinking.className = "ai-message-row assistant";
      thinking.innerHTML = '<div class="ai-message-assistant ai-message-thinking"><span class="ai-thinking"><i></i><i></i><i></i></span><span data-ai-thinking-status>正在读取你的问题…</span></div>';
      box.append(thinking); box.scrollTop = box.scrollHeight;
    }

    const thinkingPhases = ["正在读取你的问题…", "正在结合相关资料分析…", "正在梳理重点…", "正在组织回答…"];
    let thinkingPhaseIndex = 0;
    const advanceThinkingPhase = () => {
      const label = view.querySelector("[data-ai-thinking-status]");
      if (!label) return;
      thinkingPhaseIndex = Math.min(thinkingPhaseIndex + 1, thinkingPhases.length - 1);
      label.textContent = thinkingPhases[thinkingPhaseIndex];
    };
    thinkingTimer = window.setInterval(advanceThinkingPhase, 1800);

    try {
      const reply = await geruosiAskAi(request, contextualData(chat), { throwOnFailure: true, images: attachments.filter((file) => file.dataUrl).map((file) => file.dataUrl) });
      window.clearInterval(thinkingTimer);
      const answer = { role: "assistant", content: reply, status: "streaming", streamId: uid("response"), createdAt: new Date().toISOString() };
      if (isRetry) messages.splice(retryMessageIndex, 1, answer); else messages.push(answer);
      chat.updatedAt = answer.createdAt;
      render();
      await revealAssistantAnswer(view, answer);
      answer.status = "";
      delete answer.streamId;
    } catch (error) {
      window.clearInterval(thinkingTimer);
      const failure = error?.geruosiFailure || window.geruosiClassifyAiFailure?.(error, true) || { title: "AI 请求没有完成", message: "当前问题已经保留，可以重新发送或检查配置。", retryable: true, detail: "" };
      const failed = { role: "assistant", status: "failed", errorKind: failure.kind || "unknown", errorTitle: failure.title, content: failure.message, errorDetail: failure.detail || "", retryable: failure.retryable !== false, createdAt: new Date().toISOString() };
      if (isRetry) messages.splice(retryMessageIndex, 1, failed); else messages.push(failed);
      chat.updatedAt = failed.createdAt;
    }
    sending = false; persist(); render();
  }
  function bindView(view) {
    view.querySelector("[data-new-chat]").onclick = () => { newChat(); render(); view.querySelector("[data-ai-input]").focus(); };
    const folderDialog = document.querySelector("[data-folder-dialog]");
    const folderInput = folderDialog.querySelector("input");
    const closeFolderDialog = () => { folderDialog.hidden = true; folderDialog.dataset.editFolderId = ""; folderInput.value = ""; };
    const createFolder = () => { const name = folderInput.value.trim(); if (!name) { folderInput.focus(); return; } const store = ensureStore(); const editing = store.folders.find((folder) => folder.id === folderDialog.dataset.editFolderId); if (editing) editing.name = name; else store.folders.push({ id: uid("folder"), name }); closeFolderDialog(); persist(); render(); };
    view.querySelector("[data-new-folder]").onclick = () => openFolderNameDialog();
    folderDialog.querySelector("[data-folder-cancel]").onclick = closeFolderDialog;
    folderDialog.querySelector("[data-folder-confirm]").onclick = createFolder;
    folderInput.onkeydown = (event) => { if (event.key === "Enter") createFolder(); if (event.key === "Escape") closeFolderDialog(); };
    folderDialog.onclick = (event) => { if (event.target === folderDialog) closeFolderDialog(); };
    view.querySelector("[data-ai-send]").onclick = () => sendMessage(); view.querySelector("[data-ai-input]").onkeydown = (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); } };
    const fileInput = view.querySelector("[data-file-input]"); view.querySelector("[data-attach]").onclick = () => fileInput.click(); fileInput.onchange = async () => { const files = [...fileInput.files]; for (const file of files) { const record = { name: file.name, size: file.size, type: file.type || "文件" }; if (file.size <= 220000 && (/^(text\/|application\/(json|xml))/.test(file.type) || /\.(txt|md|csv|json|xml|log)$/i.test(file.name))) { try { record.text = (await file.text()).slice(0, 160000); } catch (_) {} } pendingAttachments.push(record); } fileInput.value = ""; renderAttachments(view); };
    document.addEventListener("click", (event) => { if (!event.target.closest(".ai-chat-context-menu")) closeChatContextMenu(); });
    document.addEventListener("contextmenu", (event) => { if (!event.target.closest(".ai-chat-row")) closeChatContextMenu(); });
  }
  function openView(chatId = "") {
    const store = ensureStore(); if (chatId && store.chats.some((chat) => chat.id === chatId)) store.activeChatId = chatId; applyActiveView("ai"); render(); requestAnimationFrame(() => ensureView().querySelector("[data-ai-input]")?.focus());
  }
  async function openWithPrompt(options = {}) {
    await window.geruosiAiConfigReady;
    if (!configured()) { openAiSettings(); return false; }
    const chat = newChat({ title: options.title || "学习生涯 AI 解读", sourceType: options.sourceType || "career", sourceId: options.sourceId || "" }); openView(chat.id);
    await sendMessage({ text: options.message || "请结合这份记录进行完整解读。", contextPrompt: options.prompt || "", card: options.card || { type: "学习生涯资料", title: options.title || "待解读记录", summary: "已附上完整记录，请结合原始数据分析。" } }); return true;
  }
  function ensureSourceChat(options = {}) {
    const store = ensureStore();
    const sourceType = options.sourceType || "personal";
    const sourceId = options.sourceId || "";
    let chat = store.chats.find((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId);
    if (!chat) chat = newChat({ title: options.title || "新对话", sourceType, sourceId });
    if (options.title && (!chat.title || chat.title === "新对话")) chat.title = options.title;
    persist();
    return chat.id;
  }
  function findSourceChat(options = {}) {
    const sourceType = options.sourceType || "personal";
    const sourceId = options.sourceId || "";
    return ensureStore().chats.find((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId)?.id || "";
  }
  function createSourceChat(options = {}) {
    return newChat({ title: options.title || "新对话", sourceType: options.sourceType || "personal", sourceId: options.sourceId || "" }).id;
  }
  function forkFromMessages(messages = [], title = "支线对话") {
    const fork = newChat({ title, sourceType: "personal", sourceId: "" });
    fork.messages = JSON.parse(JSON.stringify(Array.isArray(messages) ? messages : []));
    fork.updatedAt = new Date().toISOString();
    persist();
    openView(fork.id);
    return fork.id;
  }
  function getChatSnapshot(chatId) {
    const chat = ensureStore().chats.find((entry) => entry.id === chatId);
    return chat ? JSON.parse(JSON.stringify(chat)) : null;
  }
  async function sendToChat(chatId, text, options = {}) {
    const store = ensureStore();
    const chat = store.chats.find((entry) => entry.id === chatId);
    if (!chat) return null;
    store.activeChatId = chat.id;
    persist();
    await sendMessage({ text, contextPrompt: options.contextPrompt || "", attachments: options.attachments || [] });
    return getChatSnapshot(chat.id);
  }
  window.GeruosiAIConsultation = { open: openView, openWithPrompt, openSettings: openAiSettings, isConfigured: configured, render, ensureSourceChat, findSourceChat, createSourceChat, forkFromMessages, getChatSnapshot, sendToChat };
  ensureView(); ensureStore();
  const rail = document.querySelector('.rail-icon[data-view="ai"]'); if (rail) rail.onclick = () => openView();
})();

