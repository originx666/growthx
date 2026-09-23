/* 歌若思本地项目画布 - AGPL-3.0-only */
(() => {
  const CURATED_CHINESE_FONTS = ["思源黑体 CN", "思源宋体 CN", "霞鹜文楷", "阿里巴巴普惠体 3.0", "HarmonyOS Sans SC", "MiSans", "得意黑", "站酷快乐体"];
  const PDF_DOCUMENTS = new Map();
  let pdfJsPromise=null;
  const C = {
    project: null,
    canvas: null,
    draft: null,
    selected: new Set(),
    tool: "select",
    dirty: false,
    history: [],
    future: [],
    isNew: false,
    connectingFrom: "",
    drag: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    pendingPoint: null,
    pendingFileType: "other",
    shapePreset: "square",
    connectorPreset: { type: "curve", dash: "solid", arrow: true },
    replaceImageId: "",
    selectedConnection: "",
    spacePressed: false,
    systemFonts: [...CURATED_CHINESE_FONTS],
    sidePanel: "properties",
    canvasChatId: "",
    canvasAiSending: false,
    canvasAiAttachments: []
  };

  const deepCopy = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const roundTwo = (value) => Math.round(Number(value) * 100) / 100;
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const effectiveCanvasFont = (font) => C.systemFonts.includes(font) ? font : C.systemFonts[0];
  function loadPdfDocument(src=""){
    if(PDF_DOCUMENTS.has(src))return PDF_DOCUMENTS.get(src);
    pdfJsPromise ||= import("./node_modules/pdfjs-dist/build/pdf.min.mjs").then(pdfjs=>{pdfjs.GlobalWorkerOptions.workerSrc=new URL("./node_modules/pdfjs-dist/build/pdf.worker.min.mjs",document.baseURI).href;return pdfjs;});
    const promise=pdfJsPromise.then(pdfjs=>{const base64=src.slice(src.indexOf(",")+1),bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));return pdfjs.getDocument({data:bytes}).promise;});PDF_DOCUMENTS.set(src,promise);return promise;
  }
  async function renderNativePdfReview(review){
    const item=C.draft?.elements.find(entry=>entry.id===review.dataset.reviewId),canvas=review.querySelector("[data-pdf-canvas]"),status=review.querySelector(".review-pdf-status");if(!item||!canvas||!item.reviewSrc)return;
    try{const pdf=await loadPdfDocument(item.reviewSrc);if(!canvas.isConnected)return;item.reviewTotal=pdf.numPages;review.querySelector("[data-review-total]")&&(review.querySelector("[data-review-total]").textContent=`/${pdf.numPages}`);const pageNumber=clamp(Number(item.reviewPage||1),1,pdf.numPages),page=await pdf.getPage(pageNumber),scale=4/3*clamp(Number(item.reviewZoom||100),50,220)/100,viewport=page.getViewport({scale}),ratio=Math.min(2,window.devicePixelRatio||1),context=canvas.getContext("2d",{alpha:false});canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=`${Math.ceil(viewport.width)}px`;canvas.style.height=`${Math.ceil(viewport.height)}px`;context.setTransform(ratio,0,0,ratio,0,0);await page.render({canvasContext:context,viewport}).promise;status?.remove();}
    catch(error){if(status){status.textContent=`文件页面渲染失败：${error.message}`;status.classList.add("error");}}
  }

  window.geruosiDesktop?.getSystemFonts?.().then((fonts) => {
    if (!Array.isArray(fonts) || !fonts.length) return;
    C.systemFonts = [...new Set([...CURATED_CHINESE_FONTS, ...fonts])];
    if (C.draft && C.selected.size) renderInspector();
  }).catch(() => {});

  function normalizeProject(project) {
    if (!project) return;
    if (!Array.isArray(project.canvases)) project.canvases = [];
    project.canvases.forEach((canvas) => {
      canvas.elements = Array.isArray(canvas.elements) ? canvas.elements : [];
      canvas.connections = Array.isArray(canvas.connections) ? canvas.connections : [];
      canvas.viewport = canvas.viewport || { x: 0, y: 0, zoom: 1 };
    });
  }

  function canvasPreview(canvas) {
    if (canvas.preview && canvas.previewVersion === 2) return `<img class="canvas-thumb-image" src="${esc(canvas.preview)}" alt="${esc(canvas.title || "画布")}的真实内容预览">`;
    const nodes = canvas.elements || [];
    if (!nodes.length) return `<div class="canvas-thumb-empty"><span>＋</span><small>空白画布</small></div>`;
    const bounds = contentBounds(nodes);
    const scale = Math.max((bounds.maxX-bounds.minX+80)/1800,(bounds.maxY-bounds.minY+80)/840,.01);
    const viewWidth=1800*scale,viewHeight=840*scale;
    const viewX=(bounds.minX+bounds.maxX-viewWidth)/2,viewY=(bounds.minY+bounds.maxY-viewHeight)/2;
    const sx = 100 / viewWidth, sy = 100 / viewHeight;
    const previewNodes = nodes.map((item) => {
      const left = (item.x - viewX) * sx, top = (item.y - viewY) * sy;
      const width = item.w * sx, height = item.h * sy;
      if (left + width < -3 || top + height < -3 || left > 103 || top > 103) return "";
      const fill = item.type === "text" && item.bgEnabled === false ? "transparent" : item.fill || (item.type === "text" ? "transparent" : "#dff8ee");
      const radius = item.type === "ellipse" ? "50%" : `${Math.max(0, Number(item.radius ?? 12) * sx)}%`;
      const style = `left:${left}%;top:${top}%;width:${width}%;height:${height}%;background:${fill};border-radius:${radius};color:${item.color || "#07382d"};transform:rotate(${Number(item.rotation || 0)}deg)`;
      let content = `<div class="canvas-thumb-text">${esc(item.text || item.name || item.url || "").replace(/\n/g,"<br>")}</div>`;
      if (item.type === "image" && item.src) content = `<img src="${esc(item.src)}" alt="">`;
      if (item.type === "note") content = `<div class="canvas-thumb-note"><b>${esc(item.text || "未命名主题")}</b><p>${esc(item.content || "").replace(/\n/g,"<br>")}</p></div>`;
      if (item.type === "link") content = `<div class="canvas-thumb-link"><b>↗</b><div><strong>${esc(item.text || "网页卡片")}</strong><small>${esc(item.url || "https://")}</small></div></div>`;
      if (item.type === "file") content = `<div class="canvas-thumb-file"><b>${esc(fileIcon(item.name))}</b><span>${esc(item.name || "文件")}</span></div>`;
      if (item.type === "file-review") {
        const kind = item.reviewKind || "other", page = Math.max(1, Number(item.reviewPage || 1));
        if ((kind === "pdf" || item.nativeOfficePreview) && item.reviewSrc) content = `<canvas class="canvas-thumb-pdf" data-thumb-document="${esc(item.id)}"></canvas>`;
        else if (kind === "excel") content = `<div class="canvas-thumb-document">${item.reviewSheets?.[Number(item.reviewSheet || 0)]?.html || item.reviewTable || item.reviewPages?.[0] || ""}</div>`;
        else content = `<div class="canvas-thumb-document">${item.reviewPages?.[page - 1] || item.reviewPages?.[0] || esc(item.name || "文件")}</div>`;
      }
      return `<div class="canvas-thumb-node thumb-${esc(item.type)}" data-thumb-id="${esc(item.id)}" style="${style}">${content}</div>`;
    }).join("");
    const connections = (canvas.connections || []).map((line) => {
      const from = nodes.find((item) => item.id === line.from), to = nodes.find((item) => item.id === line.to);
      if (!from || !to) return "";
      const x1 = (from.x + from.w / 2 - viewX) * sx, y1 = (from.y + from.h / 2 - viewY) * sy;
      const x2 = (to.x + to.w / 2 - viewX) * sx, y2 = (to.y + to.h / 2 - viewY) * sy;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(line.color || "#0caa7d")}" stroke-width=".7" stroke-dasharray="${line.dash === "dash" ? "2 1.5" : line.dash === "dot" ? ".4 1.4" : ""}"></line>`;
    }).join("");
    return `<div class="canvas-thumb-stage"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${connections}</svg>${previewNodes}</div>`;
  }

  async function renderLibraryDocumentPreviews(root, canvases) {
    const documents = [...root.querySelectorAll("canvas[data-thumb-document]")];
    await Promise.all(documents.map(async (target) => {
      const card = target.closest("[data-canvas-open]");
      const canvas = canvases.find((entry) => entry.id === card?.dataset.canvasOpen);
      const item = canvas?.elements?.find((entry) => entry.id === target.dataset.thumbDocument);
      if (!item?.reviewSrc || !target.isConnected) return;
      try {
        const pdf = await loadPdfDocument(item.reviewSrc), page = await pdf.getPage(clamp(Number(item.reviewPage || 1), 1, pdf.numPages));
        const base = page.getViewport({ scale: 1 }), box = target.getBoundingClientRect();
        const scale = Math.max(.1, Math.min(Math.max(1, box.width) / base.width, Math.max(1, box.height) / base.height));
        const pageView = page.getViewport({ scale }), ratio = Math.min(2, window.devicePixelRatio || 1);
        target.width = Math.max(1, Math.round(pageView.width * ratio)); target.height = Math.max(1, Math.round(pageView.height * ratio));
        const context = target.getContext("2d", { alpha: false }); context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({ canvasContext: context, viewport: pageView }).promise;
      } catch (error) { console.warn("画布卡片文件预览失败", error); }
    }));
  }

  function closeCanvasLibraryMenu() {
    document.querySelectorAll(".canvas-library-context-menu").forEach((menu) => menu.remove());
  }

  function openCanvasLibraryMenu(event, project, canvasId) {
    event.preventDefault();
    event.stopPropagation();
    closeCanvasLibraryMenu();
    const menu = document.createElement("div");
    menu.className = "canvas-library-context-menu";
    menu.innerHTML = `<button type="button" data-delete-canvas><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.8h6V7M7 7l.8 12h8.4L17 7M10 10.5v5M14 10.5v5"/></svg><span>删除画布</span></button>`;
    document.body.append(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(10, Math.min(event.clientX, window.innerWidth - rect.width - 10))}px`;
    menu.style.top = `${Math.max(10, Math.min(event.clientY, window.innerHeight - rect.height - 10))}px`;
    menu.querySelector("[data-delete-canvas]").onclick = () => {
      closeCanvasLibraryMenu();
      if (!confirm("确定删除这张画布吗？此操作无法撤销。")) return;
      project.canvases = project.canvases.filter((item) => item.id !== canvasId);
      saveState();
      renderLibrary();
    };
    setTimeout(() => document.addEventListener("click", closeCanvasLibraryMenu, { once: true }), 0);
  }

  function renderLibrary() {
    const root = document.getElementById("projectCanvasLibrary");
    const project = typeof selectedProject === "function" ? selectedProject() : null;
    if (!root || !project) return;
    normalizeProject(project);
    const items = project.canvases;
    root.innerHTML = `
      <div class="canvas-card-grid">${items.map((canvas) => `
        <article class="canvas-card" data-canvas-open="${canvas.id}" tabindex="0">
          <div class="canvas-card-preview">${canvasPreview(canvas)}</div>
          <div class="canvas-card-meta"><div><strong>${esc(canvas.title || "未命名画布")}</strong><small>${formatTime(canvas.updatedAt)}</small></div></div>
        </article>`).join("")}
        <button type="button" class="canvas-card canvas-create-card" data-canvas-new title="新建画布" aria-label="新建画布"><span>＋</span></button>
      </div>`;
    renderLibraryDocumentPreviews(root, items);
    root.querySelectorAll("[data-canvas-new]").forEach((button) => button.onclick = createCanvas);
    root.querySelectorAll("[data-canvas-open]").forEach((card) => {
      card.onclick = () => openCanvas(card.dataset.canvasOpen);
      card.onkeydown = (event) => { if (event.key === "Enter") openCanvas(card.dataset.canvasOpen); };
      card.oncontextmenu = (event) => openCanvasLibraryMenu(event, project, card.dataset.canvasOpen);
    });
  }

  function formatTime(value) {
    if (!value) return "尚未保存";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function createCanvas() {
    const project = selectedProject();
    if (!project) return;
    normalizeProject(project);
    const canvas = { id: makeId("cv"), title: `画布 ${project.canvases.length + 1}`, createdAt: new Date().toISOString(), updatedAt: "", viewport: { x: 0, y: 0, zoom: 1 }, elements: [], connections: [] };
    project.canvases.unshift(canvas);
    openCanvas(canvas.id, true);
  }

  function openCanvas(id, isNew = false) {
    const project = selectedProject();
    normalizeProject(project);
    const canvas = project?.canvases.find((item) => item.id === id);
    if (!canvas) return;
    C.project = project;
    C.canvas = canvas;
    C.draft = deepCopy(canvas);
    upgradeMindMapStyles();
    C.viewport = { ...canvas.viewport };
    C.selected.clear();
    C.selectedConnection = "";
    C.dirty = false;
    C.history = [];
    C.future = [];
    C.isNew = isNew;
    C.tool = "select";
    C.sidePanel = "properties";
    C.canvasChatId = "";
    C.canvasAiSending = false;
    C.canvasAiAttachments = [];
    mountEditor();
    renderEditor();
  }

  function mountEditor() {
    document.getElementById("canvasEditor")?.remove();
    const editor = document.createElement("section");
    editor.id = "canvasEditor";
    editor.className = "canvas-editor";
    editor.innerHTML = `
      <header class="canvas-editor-topbar">
        <div class="canvas-editor-nav"><button data-editor-exit title="返回画布列表" aria-label="返回画布列表">${canvasIcon("back")}</button><button class="canvas-menu-button" data-toolbox-toggle title="展开或收起工具栏" aria-label="展开或收起工具栏">${canvasIcon("menu")}</button><div class="canvas-title-wrap">${canvasIcon("edit")}<input id="canvasTitle" maxlength="40" value="${esc(C.draft.title)}"></div><small id="canvasSaveState"><span>✓</span> 已保存</small></div>
        <div class="canvas-editor-actions"><div class="canvas-history-actions"><button data-action="undo" title="撤销 Ctrl+Z" aria-label="撤销">${canvasIcon("undo")}</button><button data-action="redo" title="重做 Ctrl+Y" aria-label="重做">${canvasIcon("redo")}</button></div><button class="canvas-fit-button" data-action="fit">${canvasIcon("fit")}<span>适应内容</span></button><button class="canvas-fit-button canvas-panel-button" data-side-panel="ai">${canvasIcon("chat")}<span>AI 咨询</span></button><button class="canvas-fit-button canvas-panel-button" data-side-panel="properties">${canvasIcon("sliders")}<span>属性</span></button><button class="canvas-save-button" data-editor-save>保存</button></div>
      </header>
      <div class="canvas-editor-body">
        <aside class="canvas-toolbox" aria-label="画布工具">
          ${toolButton("select", "↖", "选择")}${toolButton("hand", "✋", "拖动画布")}
          <i></i>${toolButton("text", "T", "文字")}${toolButton("note", "▰", "卡片")}${toolButton("shape", "□", "图形")}${toolButton("mind", "⑂", "思维节点")}
          <i></i>${toolButton("image", "▧", "图片")}${toolButton("file", "▤", "文件")}${toolButton("link", "⌁", "网页")}${toolButton("connector", "↗", "连线")}
        </aside>
        <main id="canvasViewport" class="canvas-viewport"><div id="canvasWorld" class="canvas-world"><svg id="canvasConnections" class="canvas-connections"></svg><div id="canvasElements"></div></div><div class="canvas-zoom"><button data-zoom="out">−</button><span id="canvasZoomLabel">100%</span><button data-zoom="in">＋</button></div><div class="canvas-help">空格拖动 · 滚轮缩放 · Delete 删除 · 双击编辑</div></main>
        <aside id="canvasSidePanel" class="canvas-side-panel"><section id="canvasAiPanel" class="canvas-ai-panel" hidden></section><section id="canvasInspector" class="canvas-inspector"></section></aside>
      </div>
      <div id="canvasToolFlyout" class="canvas-tool-flyout hidden"></div>
      <input id="canvasImageInput" type="file" accept="image/*" hidden><input id="canvasFileInput" type="file" hidden>
      <div id="canvasFileTypeDialog" class="canvas-file-type-dialog hidden"><div><header><b>选择文件类型</b><button type="button" data-file-type-close aria-label="关闭">×</button></header><p>选择后将打开对应文件，支持的格式会作为审阅窗口插入画布。</p><section>${[["video","视频","▶"],["word","Word","W"],["excel","Excel","X"],["ppt","PPT","P"],["pdf","PDF","PDF"],["other","其他","…"]].map(([key,name,icon])=>`<button type="button" data-file-type="${key}"><i>${icon}</i><span>${name}</span></button>`).join("")}</section></div></div>
      <div id="canvasExitDialog" class="canvas-exit-dialog hidden"><div><span>UNSAVED CHANGES</span><h3>要保存这次编辑吗？</h3><p>如果不保存，退出后本次更改将会丢失。</p><footer><button data-exit-cancel>继续编辑</button><button data-exit-discard>不保存</button><button class="canvas-save-button" data-exit-save>保存并退出</button></footer></div></div>`;
    document.body.append(editor);
    bindEditor();
  }

  function toolButton(tool, iconText, label) {
    const insertable = ["text", "note", "shape", "mind", "image", "file", "link"].includes(tool);
    return `<button class="canvas-tool ${tool === "select" ? "active" : ""}" data-tool="${tool}" ${insertable ? 'draggable="true"' : ""} title="${insertable ? `拖动到画布插入${label}` : label}"><b>${canvasIcon(tool)}</b><span>${label}</span></button>`;
  }

  function canvasIcon(name) {
    const icons = {
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      back: '<path d="m10 6-6 6 6 6M4 12h16"/>',
      edit: '<path d="m4 20 4.2-1 10.7-10.7-3.2-3.2L5 15.8 4 20ZM14.5 6.3l3.2 3.2"/>',
      select: '<path d="m5 3 12 9-6 1.5L8.5 19 5 3Z"/><path d="m12 14 4 5"/>',
      hand: '<path d="M7.5 12V6.5a1.5 1.5 0 0 1 3 0V11M10.5 11V4.5a1.5 1.5 0 0 1 3 0V11M13.5 11V5.5a1.5 1.5 0 0 1 3 0V12M16.5 12V8.5a1.5 1.5 0 0 1 3 0v5.8c0 4.1-2.7 6.7-6.5 6.7h-1.2c-2.1 0-3.8-.9-5.1-2.6L3.5 14a1.6 1.6 0 0 1 2.4-2l1.6 1.6V12Z"/>',
      text: '<path d="M5 5h14M12 5v14M8.5 19h7"/>',
      note: '<path d="M5 4h14v11l-5 5H5V4Z"/><path d="M14 20v-5h5"/>',
      rect: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
      ellipse: '<ellipse cx="12" cy="12" rx="8" ry="7"/>',
      shape: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="17" cy="17" r="4" fill="white"/>',
      mind: '<path d="M7 5h10M7 12h10M7 19h10M7 5v14"/><rect x="3" y="3" width="4" height="4" rx=".6"/><rect x="17" y="10" width="4" height="4" rx=".6"/><rect x="17" y="17" width="4" height="4" rx=".6"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="16.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 3.5 3 2.5-2 5 4"/>',
      file: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-12Z"/>',
      link: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
      connector: '<path d="M5 5h4a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3h4M16 9l3 3-3 3"/>',
      container: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8H5v8h2M17 8h2v8h-2"/>',
      undo: '<path d="M9 7 5 11l4 4M5 11h7a6 6 0 0 1 6 6"/>',
      redo: '<path d="m15 7 4 4-4 4M19 11h-7a6 6 0 0 0-6 6"/>',
      fit: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
      chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
      sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
      rocket: '<path d="M14 5c2.7-1.4 5-1 5-1s.4 2.3-1 5l-5.5 5.5-3-3L14 5Z"/><path d="m9.5 8.5-3.2.4L4 11.2l4.2.6M15.5 14.5l-.4 3.2-2.3 2.3-.6-4.2M8 16l-2 2"/><circle cx="15.5" cy="7.5" r="1"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.rect}</svg>`;
  }

  function bindEditor() {
    const editor = document.getElementById("canvasEditor");
    editor.querySelector("[data-toolbox-toggle]").onclick = () => editor.classList.toggle("toolbox-collapsed");
    editor.querySelector("[data-editor-exit]").onclick = requestExit;
    editor.querySelector("[data-editor-save]").onclick = saveCanvas;
    editor.querySelector("[data-exit-save]").onclick = async () => { await saveCanvas(); closeEditor(); };
    editor.querySelector("[data-exit-discard]").onclick = closeEditor;
    editor.querySelector("[data-exit-cancel]").onclick = () => document.getElementById("canvasExitDialog").classList.add("hidden");
    document.getElementById("canvasTitle").oninput = (event) => { snapshot(); C.draft.title = event.target.value; markDirty(); };
    editor.querySelectorAll("[data-tool]").forEach((button) => button.onclick = () => {
      if(button.draggable){
        if(button.dataset.tool==="shape"||button.dataset.tool==="file") showToolFlyout(button.dataset.tool,button); else hideToolFlyout();
        C.tool="select";document.querySelectorAll(".canvas-tool").forEach(entry=>entry.classList.toggle("active",entry.dataset.tool===(button.dataset.tool==="shape"||button.dataset.tool==="file"?button.dataset.tool:"select")));return;
      }
      selectTool(button.dataset.tool, button);
    });
    editor.querySelectorAll('.canvas-tool[draggable="true"]').forEach((button) => {
      button.ondragstart = (event) => {
        event.dataTransfer.setData("application/x-geruosi-canvas-tool", button.dataset.tool);
        event.dataTransfer.effectAllowed = "copy";
        editor.classList.add("is-tool-dragging");
      };
      button.ondragend = () => {
        editor.classList.remove("is-tool-dragging");
        document.getElementById("canvasDropPreview")?.remove();
      };
    });
    editor.querySelector('[data-action="undo"]').onclick = undo;
    editor.querySelector('[data-action="redo"]').onclick = redo;
    editor.querySelector('[data-action="fit"]').onclick = fitContent;
    editor.querySelectorAll('[data-side-panel]').forEach((button) => button.onclick = () => toggleCanvasSidePanel(button.dataset.sidePanel));
    syncCanvasSidePanel();
    editor.querySelectorAll("[data-zoom]").forEach((button) => button.onclick = () => setZoom(C.viewport.zoom + (button.dataset.zoom === "in" ? .1 : -.1)));
    document.getElementById("canvasImageInput").onchange = insertImage;
    document.getElementById("canvasFileInput").onchange = insertFile;
    editor.querySelector("[data-file-type-close]").onclick=()=>document.getElementById("canvasFileTypeDialog").classList.add("hidden");
    editor.querySelectorAll("[data-file-type]").forEach(button=>button.onclick=()=>chooseCanvasFileType(button.dataset.fileType));
    const viewport = document.getElementById("canvasViewport");
    viewport.onpointerdown = viewportPointerDown;
    viewport.onwheel = viewportWheel;
    viewport.ondragover = canvasDragOver;
    viewport.ondrop = canvasDrop;
    viewport.ondragleave = (event) => {
      if (!viewport.contains(event.relatedTarget)) document.getElementById("canvasDropPreview")?.remove();
    };
    viewport.ondblclick = () => {};
    document.addEventListener("keydown", editorKeydown, true);
    document.addEventListener("keyup", editorKeyup, true);
    document.addEventListener("pointermove", editorPointerMove);
    document.addEventListener("pointerup", editorPointerUp);
  }

  function ensureCanvasChat() {
    if (C.canvasChatId) return C.canvasChatId;
    const api = window.GeruosiAIConsultation;
    if (!api?.ensureSourceChat || !C.canvas) return "";
    C.canvasChatId = api.ensureSourceChat({ sourceType: "canvas", sourceId: C.canvas.id, title: (C.draft?.title || "画布") + " · AI 咨询" });
    return C.canvasChatId;
  }

  function canvasAiContext() {
    const elements = (C.draft?.elements || []).map((item) => item.text || item.name || item.content || item.url).filter(Boolean).slice(0, 80).join("；");
    return [
      "你正在回答歌若思画布中的问题。",
      "项目：" + (C.project?.name || "未命名项目"),
      "画布：" + (C.draft?.title || "未命名画布"),
      elements ? "画布内容：" + elements : "画布当前还没有文字内容。"
    ].join("\n");
  }

  function renderCanvasAiPanel() {
    const panel = document.getElementById("canvasAiPanel");
    if (!panel || C.sidePanel !== "ai") return;
    const api = window.GeruosiAIConsultation;
    if (!C.canvasChatId && C.canvas) C.canvasChatId = api?.findSourceChat?.({ sourceType: "canvas", sourceId: C.canvas.id }) || "";
    const chat = C.canvasChatId ? api?.getChatSnapshot?.(C.canvasChatId) : null;
    const messages = chat?.messages || [];
    const attachments = Array.isArray(C.canvasAiAttachments) ? C.canvasAiAttachments : (C.canvasAiAttachments = []);
    panel.innerHTML = `
      <header><div><h2>AI 问答</h2><p>这是「${esc(C.draft?.title || "画布")}」的独立 AI 对话。我会结合这张画布和你的学习生涯数据回答问题。</p></div></header>
      <div class="canvas-ai-messages">${messages.map((message) => `<article class="${message.role === "user" ? "user" : "assistant"}"><div>${esc(message.content || "").replace(/\n/g,"<br>")}</div></article>`).join("")}</div>
      <footer>
        <div class="canvas-ai-attachments">${attachments.map((file, index) => `<span>${esc(file.name)}<button type="button" data-canvas-ai-remove="${index}" aria-label="移除附件">×</button></span>`).join("")}</div>
        <textarea rows="3" placeholder="输入内容"></textarea>
        <button type="button" data-canvas-ai-attach aria-label="插入文件" title="插入文件"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <input type="file" data-canvas-ai-file accept="image/*,.txt,.md,.csv,.json,.xml,.log" multiple hidden>
        <button type="button" data-canvas-ai-send aria-label="发送"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6m-5 5 5-5 5 5"/></svg></button>
      </footer>`;
    const messageBox = panel.querySelector('.canvas-ai-messages');
    messageBox.scrollTop = messageBox.scrollHeight;
    const input = panel.querySelector('textarea');
    const send = async () => {
      const text = input.value.trim() || (attachments.length ? "请分析我插入的文件。" : "");
      if (!text || C.canvasAiSending || !api?.sendToChat) return;
      const outgoingAttachments = attachments.map((file) => ({ ...file }));
      C.canvasAiSending = true; input.disabled = true; panel.querySelector('[data-canvas-ai-send]').disabled = true;
      await api.sendToChat(ensureCanvasChat(), text, { contextPrompt: canvasAiContext(), attachments: outgoingAttachments });
      C.canvasAiAttachments = [];
      C.canvasAiSending = false; renderCanvasAiPanel();
    };
    const fileInput = panel.querySelector('[data-canvas-ai-file]');
    panel.querySelector('[data-canvas-ai-attach]').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const files = [...fileInput.files].slice(0, Math.max(0, 6 - attachments.length));
      for (const file of files) {
        const record = { name: file.name, type: file.type || "文件", size: file.size };
        if (file.type.startsWith("image/") && file.size <= 6 * 1024 * 1024) {
          record.dataUrl = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => resolve(""); reader.readAsDataURL(file); });
        } else if (file.size <= 220000) {
          try { record.text = (await file.text()).slice(0, 160000); } catch (_) {}
        }
        attachments.push(record);
      }
      renderCanvasAiPanel();
    };
    panel.querySelectorAll('[data-canvas-ai-remove]').forEach((button) => button.onclick = () => {
      attachments.splice(Number(button.dataset.canvasAiRemove), 1);
      renderCanvasAiPanel();
    });
    panel.querySelector('[data-canvas-ai-send]').onclick = send;
    input.onkeydown = (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } };
  }

  function syncCanvasSidePanel() {
    const editor = document.getElementById("canvasEditor");
    const inspector = document.getElementById("canvasInspector");
    const ai = document.getElementById("canvasAiPanel");
    if (!editor || !inspector || !ai) return;
    editor.dataset.sidePanel = C.sidePanel || "none";
    inspector.hidden = C.sidePanel !== "properties";
    ai.hidden = C.sidePanel !== "ai";
    editor.querySelectorAll('[data-side-panel]').forEach((button) => button.classList.toggle('active', button.dataset.sidePanel === C.sidePanel));
    if (C.sidePanel === "ai") renderCanvasAiPanel();
  }

  function toggleCanvasSidePanel(panel) {
    C.sidePanel = C.sidePanel === panel ? "" : panel;
    syncCanvasSidePanel();
  }

  function selectTool(tool) {
    const button = arguments[1] || document.querySelector(`.canvas-tool[data-tool="${tool}"]`);
    if (tool === "shape" || tool === "connector") {
      C.tool = tool;
      document.querySelectorAll(".canvas-tool").forEach((entry) => entry.classList.toggle("active", entry.dataset.tool === tool));
      showToolFlyout(tool, button);
      return;
    }
    hideToolFlyout();
    C.tool = tool;
    document.querySelectorAll(".canvas-tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  }

  const shapeGroups = [
    ["基础", [["square","正方形"],["rounded","圆角矩形"],["soft-rounded","柔角矩形"],["circle","圆形"],["pie","饼形"],["triangle","三角形"],["diamond","菱形"],["parallelogram","平行四边形"],["star","五角星"],["semicircle","半圆"],["capsule","胶囊形"],["pentagon","五边形"],["trapezoid","梯形"],["hexagon","六边形"],["cross","十字形"]]],
    ["注释", [["comment","注释框"],["speech","对话气泡"],["brackets","方括号"],["brace","花括号"],["underline-note","下划线注释"],["overline-note","上划线注释"],["side-brace","侧边注释"]]],
    ["方向", [["arrow-right","右箭头"],["arrow-left","左箭头"],["arrow-both","双向箭头"],["arrow-turn","转向箭头"],["block-left","左向标签"],["block-right","右向标签"]]],
    ["多边形", [["chevron-right","右燕尾"],["chevron-left","左燕尾"]]],
    ["直线", [["line-horizontal","水平直线"],["line-vertical","垂直直线"]]]
  ];

  function showToolFlyout(kind, anchor) {
    const flyout = document.getElementById("canvasToolFlyout");
    if (!flyout || !anchor) return;
    const bodyBox = document.querySelector(".canvas-editor-body").getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    const flyoutTop = Math.max(10, anchorBox.top - bodyBox.top - 8);
    flyout.style.top = `${flyoutTop}px`;
    flyout.style.maxHeight = `${Math.max(220, bodyBox.height - flyoutTop - 12)}px`;
    flyout.className = `canvas-tool-flyout ${kind}-flyout`;
    if (kind === "shape") {
      flyout.innerHTML = shapeGroups.map(([group, items]) => `<section><h4>${group}</h4><div class="canvas-shape-options">${items.map(([id, name]) => `<button type="button" draggable="true" class="canvas-preset-option ${C.shapePreset === id ? "active" : ""}" data-shape-preset="${id}" title="拖动到画布插入${name}" aria-label="${name}">${shapeSvg(id)}</button>`).join("")}</div></section>`).join("");
      flyout.querySelectorAll("[data-shape-preset]").forEach((option) => option.onclick = (event) => {
        event.stopPropagation();
        C.shapePreset = option.dataset.shapePreset;
        C.tool = "select";
        flyout.querySelectorAll("[data-shape-preset]").forEach((entry) => entry.classList.toggle("active", entry === option));
      });
      flyout.querySelectorAll("[data-shape-preset]").forEach(option=>{
        option.ondragstart=event=>{C.shapePreset=option.dataset.shapePreset;event.dataTransfer.setData("application/x-geruosi-canvas-tool","shape");event.dataTransfer.effectAllowed="copy";document.getElementById("canvasEditor")?.classList.add("is-tool-dragging");};
        option.ondragend=()=>{document.getElementById("canvasEditor")?.classList.remove("is-tool-dragging");document.getElementById("canvasDropPreview")?.remove();};
      });
    } else if(kind==="file"){
      const types=[["video","视频",'<path d="M9 7.5v9l7-4.5z"/>'],["word","Word",'<path d="m6 6 2.2 12L12 9l3.8 9L18 6"/>'],["excel","Excel",'<path d="m7 7 10 10m0-10L7 17"/>'],["ppt","PPT",'<path d="M8 18V6h4.7a4 4 0 0 1 0 8H8m0-8v8"/>'],["pdf","PDF",'<path d="M6 18V6h4a3.5 3.5 0 0 1 0 7H6m9-7v12m0-12h3.5M15 12h3"/>'],["other","其他",'<circle cx="7" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="17" cy="12" r="1"/>']];
      flyout.innerHTML=`<section><h4>文件类型</h4><div class="canvas-file-type-options">${types.map(([key,name,drawing])=>`<button type="button" draggable="true" data-file-flyout-type="${key}" class="${C.pendingFileType===key?"active":""}" title="选择或拖动${name}"><i><svg viewBox="0 0 24 24" aria-hidden="true">${drawing}</svg></i><span>${name}</span></button>`).join("")}</div></section>`;
      flyout.querySelectorAll("[data-file-flyout-type]").forEach(option=>{option.onclick=event=>{event.stopPropagation();C.pendingFileType=option.dataset.fileFlyoutType;showToolFlyout("file",anchor);};option.ondragstart=event=>{C.pendingFileType=option.dataset.fileFlyoutType;event.dataTransfer.setData("application/x-geruosi-canvas-tool","file");event.dataTransfer.setData("application/x-geruosi-file-type",C.pendingFileType);event.dataTransfer.effectAllowed="copy";document.getElementById("canvasEditor")?.classList.add("is-tool-dragging");};option.ondragend=()=>{document.getElementById("canvasEditor")?.classList.remove("is-tool-dragging");document.getElementById("canvasDropPreview")?.remove();};});
    } else {
      const geometry = [["straight",false,"直线"],["straight",true,"箭头直线"],["elbow",true,"折线箭头"],["curve",false,"贝塞尔曲线"],["curve",true,"贝塞尔箭头"]];
      const segments = [["solid","实线"],["dash","短划线"],["dot","圆点线"]];
      flyout.innerHTML = `<section><h4>线条类型</h4><div class="canvas-connector-options">${geometry.map(([type,arrow,name]) => `<button type="button" class="canvas-preset-option ${C.connectorPreset.type === type && C.connectorPreset.arrow === arrow ? "active" : ""}" data-line-type="${type}" data-line-arrow="${arrow}" title="${name}" aria-label="${name}">${connectorSvg(type, arrow, "solid")}</button>`).join("")}</div></section><section><h4>线段类型</h4><div class="canvas-connector-options">${segments.map(([dash,name]) => `<button type="button" class="canvas-preset-option ${C.connectorPreset.dash === dash ? "active" : ""}" data-line-dash="${dash}" title="${name}" aria-label="${name}">${connectorSvg("straight", false, dash)}</button>`).join("")}</div></section>`;
      flyout.querySelectorAll("[data-line-type]").forEach((option) => option.onclick = (event) => {
        event.stopPropagation();
        C.connectorPreset.type = option.dataset.lineType;
        C.connectorPreset.arrow = option.dataset.lineArrow === "true";
        showToolFlyout("connector", anchor);
      });
      flyout.querySelectorAll("[data-line-dash]").forEach((option) => option.onclick = (event) => {
        event.stopPropagation();
        C.connectorPreset.dash = option.dataset.lineDash;
        showToolFlyout("connector", anchor);
      });
    }
  }

  function hideToolFlyout() {
    const flyout = document.getElementById("canvasToolFlyout");
    if (flyout) flyout.className = "canvas-tool-flyout hidden";
  }

  function connectorSvg(type, arrow, dash) {
    const dashAttr = dash === "dash" ? 'stroke-dasharray="7 5"' : dash === "dot" ? 'stroke-dasharray="1 5" stroke-linecap="round"' : "";
    const path = type === "elbow" ? "M4 20V10h10V4" : type === "curve" ? "M4 19C7 7 17 17 20 5" : "M4 19 20 5";
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" ${dashAttr}/>${arrow ? '<path d="m15 5 5 0 0 5"/>' : ""}</svg>`;
  }

  function shapeSvg(shape) {
    const map = {
      square:'<rect x="5" y="5" width="14" height="14"/>', rounded:'<rect x="4" y="5" width="16" height="14" rx="3"/>', 'soft-rounded':'<rect x="4" y="5" width="16" height="14" rx="5"/>', circle:'<circle cx="12" cy="12" r="7"/>', pie:'<path d="M12 5a7 7 0 1 0 7 7h-7V5Z"/><path d="M14 5v5h5A7 7 0 0 0 14 5Z"/>', triangle:'<path d="m12 4 8 15H4L12 4Z"/>', diamond:'<path d="m12 4 8 8-8 8-8-8 8-8Z"/>', parallelogram:'<path d="M7 5h13l-3 14H4L7 5Z"/>', star:'<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3Z"/>', semicircle:'<path d="M4 17a8 8 0 0 1 16 0H4Z"/>', capsule:'<rect x="3" y="7" width="18" height="10" rx="5"/>', pentagon:'<path d="m12 3 8 6-3 10H7L4 9l8-6Z"/>', trapezoid:'<path d="M6 5h12l3 14H3L6 5Z"/>', hexagon:'<path d="m7 4 10 0 5 8-5 8H7l-5-8 5-8Z"/>', cross:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>', comment:'<path d="M4 5h16v12H9l-4 3v-3H4V5Z"/>', speech:'<path d="M4 11c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7H9l-4 2 1-4c-1.2-1.3-2-3-2-5Z"/>', brackets:'<path d="M9 4H6v16h3M15 4h3v16h-3"/>', brace:'<path d="M9 3c-2 0-2 2-2 4v2c0 2-1 3-3 3 2 0 3 1 3 3v2c0 2 0 4 2 4M15 3c2 0 2 2 2 4v2c0 2 1 3 3 3-2 0-3 1-3 3v2c0 2 0 4-2 4"/>', 'underline-note':'<path d="M5 8c2 1 2 5 4 5s2-5 4-5 2 5 4 5M5 18h14"/>', 'overline-note':'<path d="M5 6h14M5 11c2 1 2 5 4 5s2-5 4-5 2 5 4 5"/>', 'side-brace':'<path d="M5 4c3 0 2 5 5 5h9M5 20c3 0 2-5 5-5h9"/>', 'arrow-right':'<path d="M3 9h11V5l7 7-7 7v-4H3V9Z"/>', 'arrow-left':'<path d="M21 9H10V5l-7 7 7 7v-4h11V9Z"/>', 'arrow-both':'<path d="m3 12 5-5v3h8V7l5 5-5 5v-3H8v3l-5-5Z"/>', 'arrow-turn':'<path d="M4 18c0-7 4-11 11-11h2V4l4 5-4 5v-3h-2c-5 0-7 2-7 7H4Z"/>', 'block-left':'<path d="m3 12 6-6h12v12H9l-6-6Z"/>', 'block-right':'<path d="M3 6h12l6 6-6 6H3V6Z"/>', 'chevron-right':'<path d="M3 6h11l7 6-7 6H3l6-6-6-6Z"/>', 'chevron-left':'<path d="M21 6H10l-7 6 7 6h11l-6-6 6-6Z"/>', 'line-horizontal':'<path d="M3 12h18"/>', 'line-vertical':'<path d="M12 3v18"/>'
    };
    return `<svg viewBox="0 0 24 24" preserveAspectRatio="none" aria-hidden="true">${map[shape] || map.square}</svg>`;
  }

  function shapeDisplayName(shape = "square") {
    const names = { square:"矩形", rounded:"圆角矩形", "soft-rounded":"柔角矩形", circle:"圆形", pie:"饼形", triangle:"三角形", diamond:"菱形", parallelogram:"平行四边形", star:"五角星", semicircle:"半圆", capsule:"胶囊形", pentagon:"五边形", trapezoid:"梯形", hexagon:"六边形", cross:"十字形", comment:"注释框", speech:"对话气泡", brackets:"方括号", brace:"花括号", "underline-note":"下划线注释", "overline-note":"上划线注释", "side-brace":"侧边注释", "arrow-right":"右箭头", "arrow-left":"左箭头", "arrow-both":"双向箭头", "arrow-turn":"转向箭头", "block-left":"左向标签", "block-right":"右向标签", "chevron-right":"右燕尾", "chevron-left":"左燕尾", "line-horizontal":"水平直线", "line-vertical":"垂直直线" };
    return names[shape] || "图形";
  }

  const RECTANGLE_SHAPES = ["square", "rounded", "soft-rounded"];
  const POLYGON_SHAPES = ["triangle", "diamond", "parallelogram", "pentagon", "trapezoid", "hexagon"];
  const STAR_SHAPES = ["star"];
  const OPEN_SHAPES = ["brackets", "brace", "underline-note", "overline-note", "side-brace", "line-horizontal", "line-vertical"];
  function regularPolygonPoints(sides = 5) {
    const count = clamp(Math.round(Number(sides) || 5), 3, 16);
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      return { x: 50 + Math.cos(angle) * 46, y: 50 + Math.sin(angle) * 46 };
    });
  }
  function defaultPolygonPoints(shape) {
    const presets={
      triangle:[{x:50,y:3},{x:98,y:97},{x:2,y:97}],
      diamond:[{x:50,y:2},{x:98,y:50},{x:50,y:98},{x:2,y:50}],
      parallelogram:[{x:23,y:3},{x:98,y:3},{x:77,y:97},{x:2,y:97}],
      trapezoid:[{x:20,y:3},{x:80,y:3},{x:98,y:97},{x:2,y:97}],
      pentagon:regularPolygonPoints(5),hexagon:regularPolygonPoints(6)
    };
    return presets[shape]||regularPolygonPoints(5);
  }
  function starShapePoints(points = 5, innerRadius = 46) {
    const count = clamp(Math.round(Number(points) || 5), 3, 16);
    const inner = clamp(Number(innerRadius) || 46, 10, 90) / 100;
    return Array.from({length:count*2},(_,index)=>{const angle=-Math.PI/2+index*Math.PI/count,r=index%2?46*inner:46;return{x:50+Math.cos(angle)*r,y:50+Math.sin(angle)*r};});
  }
  function editableShapePoints(item) {
    if (Array.isArray(item.pathPoints) && item.pathPoints.length >= 3) return item.pathPoints;
    if (Array.isArray(item.booleanContours) && item.booleanContours[0]?.length >= 3) return item.booleanContours[0];
    const shape = item.shape || "square";
    if (RECTANGLE_SHAPES.includes(shape)) return [{x:2,y:2},{x:98,y:2},{x:98,y:98},{x:2,y:98}];
    if (shape === "circle" || shape === "semicircle" || shape === "capsule" || shape === "pie") return regularPolygonPoints(12);
    if (shape === "star") return starShapePoints(item.starPoints || 5, item.starInnerRadius || 46);
    return item.polygonSides ? regularPolygonPoints(item.polygonSides) : defaultPolygonPoints(shape);
  }
  function roundedPolygonPath(points, radius = 0) {
    if (!points?.length) return "";
    const amount = clamp(Number(radius) || 0, 0, 40) / 100;
    if (!amount) return `M${points.map(point=>`${point.x},${point.y}`).join(" L")} Z`;
    const segments = points.map((point,index)=>{
      const before=points[(index-1+points.length)%points.length],after=points[(index+1)%points.length];
      const inX=point.x+(before.x-point.x)*amount,inY=point.y+(before.y-point.y)*amount;
      const outX=point.x+(after.x-point.x)*amount,outY=point.y+(after.y-point.y)*amount;
      return {point,inX,inY,outX,outY};
    });
    return `M${segments[0].outX},${segments[0].outY} ${segments.slice(1).map(segment=>`L${segment.inX},${segment.inY} Q${segment.point.x},${segment.point.y} ${segment.outX},${segment.outY}`).join(" ")} L${segments[0].inX},${segments[0].inY} Q${segments[0].point.x},${segments[0].point.y} ${segments[0].outX},${segments[0].outY} Z`;
  }
  function convexHull(points) {
    const sorted=[...points].sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
    if(sorted.length<=3) return sorted;
    const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];
    sorted.forEach(point=>{while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],point)<=0)lower.pop();lower.push(point);});
    [...sorted].reverse().forEach(point=>{while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],point)<=0)upper.pop();upper.push(point);});
    lower.pop();upper.pop();return lower.concat(upper);
  }

  function viewportPointerDown(event) {
    const viewport = document.getElementById("canvasViewport");
    const elementNode = event.target.closest(".canvas-element");
    hideToolFlyout();
    if (C.tool === "hand" || event.button === 1 || event.shiftKey || C.spacePressed) {
      event.preventDefault();
      C.drag = { kind: "pan", sx: event.clientX, sy: event.clientY, ox: C.viewport.x, oy: C.viewport.y };
      viewport.classList.add("is-panning");
      viewport.setPointerCapture?.(event.pointerId);
      return;
    }
    if (elementNode) return elementPointerDown(event, elementNode);
    if(C.connectingFrom||C.tool==="connector"){
      C.connectingFrom="";selectTool("select");renderElements();renderConnections();return;
    }
    const start=canvasPoint(event),previous=new Set((event.ctrlKey||event.metaKey)?C.selected:[]);
    if(!event.ctrlKey&&!event.metaKey)C.selected.clear();
    const hadSelectedConnection=!!C.selectedConnection;
    C.selectedConnection = "";
    C.drag={kind:"marquee",sx:event.clientX,sy:event.clientY,start,previous};
    renderElements(); if(hadSelectedConnection)renderConnections(); renderInspector();
  }

  function canvasDragOver(event) {
    if (!event.dataTransfer.types.includes("application/x-geruosi-canvas-tool")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const point = canvasPoint(event);
    let preview = document.getElementById("canvasDropPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "canvasDropPreview";
      preview.className = "canvas-drop-preview";
      document.getElementById("canvasWorld").append(preview);
    }
    preview.style.left = `${point.x}px`;
    preview.style.top = `${point.y}px`;
  }

  function canvasDrop(event) {
    const type = event.dataTransfer.getData("application/x-geruosi-canvas-tool");
    if (!type) return;
    event.preventDefault();
    const point = canvasPoint(event);
    document.getElementById("canvasDropPreview")?.remove();
    document.getElementById("canvasEditor")?.classList.remove("is-tool-dragging");
    if (type === "image") {
      C.pendingPoint = point;
      document.getElementById("canvasImageInput").click();
      return;
    }
    if (type === "file") {
      C.pendingPoint = point;
      chooseCanvasFileType(event.dataTransfer.getData("application/x-geruosi-file-type")||C.pendingFileType||"other");
      return;
    }
    if (type === "link") {
      addElement("link", point, { url: "https://", text: "新的网页", w: 280, h: 110, fill: "#ffffff", radius: 14 });
      return;
    }
    addElement(type, point, type === "shape" ? { shape: C.shapePreset } : {});
    selectTool("select");
  }

  function elementPointerDown(event, node) {
    event.stopPropagation();
    const id = node.dataset.id;
    if (event.target.closest('[contenteditable="true"]')) return;
    const reviewItem=node.classList.contains("type-file-review");
    const reviewHeader=event.target.closest(".canvas-file-review>header");
    const reviewControl=event.target.closest(".canvas-file-review button,.canvas-file-review input,.canvas-file-review video");
    const elementHandle=event.target.closest(".canvas-resize,.canvas-rotate,.canvas-connect-handle");
    if(reviewItem&&reviewControl)return;
    if(reviewItem&&!reviewHeader&&!elementHandle){
      const wasSelected=C.selected.has(id),hadSelectedConnection=!!C.selectedConnection;C.selectedConnection="";if(!event.ctrlKey&&!event.metaKey&&!wasSelected)C.selected.clear();C.selected.add(id);
      if(!wasSelected)renderElements();if(hadSelectedConnection)renderConnections();renderInspector();return;
    }
    if(event.target.closest(".canvas-connect-handle")){
      C.connectingFrom=id;C.tool="connector";hideToolFlyout();renderElements();return;
    }
    if (C.tool === "connector") {
      if (!C.connectingFrom) { C.connectingFrom = id; node.classList.add("connection-source"); }
      else if (C.connectingFrom !== id) {
        snapshot();
        C.draft.connections.push({ id: makeId("cn"), from: C.connectingFrom, to: id, color: "#0caa7d", ...C.connectorPreset });
        C.connectingFrom = "";
        markDirty(); renderEditor(); selectTool("select");
      }
      return;
    }
    const wasSelected = C.selected.has(id);
    const hadSelectedConnection=!!C.selectedConnection;
    C.selectedConnection = "";
    if(hadSelectedConnection)renderConnections();
    if (!event.ctrlKey && !event.metaKey && !C.selected.has(id)) C.selected.clear();
    C.selected.add(id);
    const item = C.draft.elements.find((entry) => entry.id === id);
    if (!item) return;
    snapshot();
    const penPoint = event.target.closest(".canvas-pen-point");
    if (penPoint && item.type === "shape") {
      C.drag = { kind:"pen", id:item.id, index:Number(penPoint.dataset.penPoint), sx:event.clientX, sy:event.clientY, points:editableShapePoints(item).map(point=>({...point})) };
      return;
    }
    const resize = event.target.closest(".canvas-resize");
    const rotate = event.target.closest(".canvas-rotate");
    const bounds = node.getBoundingClientRect();
    const dragIds=new Set(C.selected);
    C.selected.forEach(selectedId=>{const selected=C.draft.elements.find(entry=>entry.id===selectedId);if(selected?.type==="mind"&&mindNodeDepth(selected)===0)C.draft.elements.forEach(entry=>{if(entry.type==="mind"&&mindRootNode(entry).id===selected.id)dragIds.add(entry.id);});});
    C.drag = { kind: rotate ? "rotate" : resize ? "resize" : "move", direction: resize?.dataset.resize || "se", sx: event.clientX, sy: event.clientY,
      centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2,
      startAngle: Math.atan2(event.clientY - (bounds.top + bounds.height / 2), event.clientX - (bounds.left + bounds.width / 2)),
      items: [...dragIds].map((selectedId) => {
      const selected = C.draft.elements.find((entry) => entry.id === selectedId);
      return { id: selectedId, x: selected.x, y: selected.y, w: selected.w, h: selected.h, rotation: Number(selected.rotation || 0) };
    }) };
    if (!wasSelected || event.ctrlKey || event.metaKey) renderElements();
    renderInspector();
  }

  function editorPointerMove(event) {
    if (!document.getElementById("canvasEditor")) return;
    if(C.connectingFrom) renderConnectionPreview(event);
    if (!C.drag) return;
    const dx = event.clientX - C.drag.sx;
    const dy = event.clientY - C.drag.sy;
    if (C.drag.kind === "pan") {
      C.viewport.x = C.drag.ox + dx; C.viewport.y = C.drag.oy + dy; applyViewport(); return;
    }
    if(C.drag.kind==="marquee"){
      const point=canvasPoint(event),left=Math.min(C.drag.start.x,point.x),top=Math.min(C.drag.start.y,point.y),right=Math.max(C.drag.start.x,point.x),bottom=Math.max(C.drag.start.y,point.y);
      let box=document.getElementById("canvasMarquee");if(!box){box=document.createElement("div");box.id="canvasMarquee";box.className="canvas-marquee";document.getElementById("canvasWorld")?.append(box);}
      Object.assign(box.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
      C.selected=new Set(C.drag.previous);C.draft.elements.forEach(item=>{if(item.x>=left&&item.y>=top&&item.x+item.w<=right&&item.y+item.h<=bottom)C.selected.add(item.id);});
      renderElements();renderInspector();return;
    }
    if (C.drag.kind === "pen") {
      const item = C.draft.elements.find(entry => entry.id === C.drag.id);
      if (!item) return;
      item.pathPoints = C.drag.points.map(point=>({...point}));
      const point = item.pathPoints[C.drag.index];
      point.x = clamp(point.x + dx / C.viewport.zoom / item.w * 100, 0, 100);
      point.y = clamp(point.y + dy / C.viewport.zoom / item.h * 100, 0, 100);
      markDirty(); renderElements(); renderInspector(); return;
    }
    if (C.drag.kind === "rotate") {
      const angle = Math.atan2(event.clientY - C.drag.centerY, event.clientX - C.drag.centerX);
      const delta = (angle - C.drag.startAngle) * 180 / Math.PI;
      C.drag.items.forEach((start) => {
        const item = C.draft.elements.find((entry) => entry.id === start.id);
        if (!item) return;
        const next = start.rotation + delta;
        item.rotation = Math.round((event.shiftKey ? Math.round(next / 45) * 45 : next) * 10) / 10;
      });
      markDirty(); renderElements(); renderConnections(); renderInspector(); return;
    }
    const moveDelta=C.drag.kind==="move"?snapMoveDelta(dx/C.viewport.zoom,dy/C.viewport.zoom):null;
    C.drag.items.forEach((start) => {
      const item = C.draft.elements.find((entry) => entry.id === start.id);
      if (!item) return;
      if (C.drag.kind === "move") { item.x = Math.round(start.x + moveDelta.dx); item.y = Math.round(start.y + moveDelta.dy); }
      else {
        const direction = C.drag.direction;
        const radians = -Number(start.rotation || 0) * Math.PI / 180;
        const scaledX = (dx * Math.cos(radians) - dy * Math.sin(radians)) / C.viewport.zoom;
        const scaledY = (dx * Math.sin(radians) + dy * Math.cos(radians)) / C.viewport.zoom;
        const isCorner = direction.length === 2;
        if (isCorner && item.lockAspect !== false) {
          const scaleX = direction.includes("e") ? 1 + scaledX / start.w : 1 - scaledX / start.w;
          const scaleY = direction.includes("s") ? 1 + scaledY / start.h : 1 - scaledY / start.h;
          const requestedScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
          const scale = Math.max(60 / start.w, 38 / start.h, requestedScale);
          const nextW = Math.round(start.w * scale);
          const nextH = Math.round(start.h * scale);
          item.w = nextW; item.h = nextH;
          if (direction.includes("w")) item.x = Math.round(start.x + start.w - nextW);
          if (direction.includes("n")) item.y = Math.round(start.y + start.h - nextH);
        } else if (!isCorner) {
          if (direction === "e") item.w = Math.max(60, Math.round(start.w + scaledX));
          if (direction === "s") item.h = Math.max(38, Math.round(start.h + scaledY));
          if (direction === "w") {
            const nextW = Math.max(60, Math.round(start.w - scaledX));
            item.x = Math.round(start.x + start.w - nextW); item.w = nextW;
          }
        } else {
          const nextW = Math.max(60, Math.round(start.w + (direction.includes("e") ? scaledX : -scaledX)));
          const nextH = Math.max(38, Math.round(start.h + (direction.includes("s") ? scaledY : -scaledY)));
          item.w = nextW; item.h = nextH;
          if (direction.includes("w")) item.x = Math.round(start.x + start.w - nextW);
          if (direction.includes("n")) item.y = Math.round(start.y + start.h - nextH);
          if (direction === "n") {
            const nextH = Math.max(38, Math.round(start.h - scaledY));
            item.y = Math.round(start.y + start.h - nextH); item.h = nextH;
          }
        }
      }
    });
    markDirty(); renderElements(); renderConnections();
  }

  function editorPointerUp() {
    if (!C.drag) return;
    document.getElementById("canvasViewport")?.classList.remove("is-panning");
    clearSnapGuides();
    document.getElementById("canvasMarquee")?.remove();
    C.drag = null;
  }

  function clearSnapGuides(){document.querySelectorAll(".canvas-snap-guide").forEach(node=>node.remove());}
  function showSnapGuides(vertical,horizontal){
    clearSnapGuides(); const world=document.getElementById("canvasWorld"); if(!world)return;
    if(Number.isFinite(vertical)){const guide=document.createElement("i");guide.className="canvas-snap-guide vertical";guide.style.left=`${vertical}px`;world.append(guide);}
    if(Number.isFinite(horizontal)){const guide=document.createElement("i");guide.className="canvas-snap-guide horizontal";guide.style.top=`${horizontal}px`;world.append(guide);}
  }
  function snapMoveDelta(dx,dy){
    const selected=new Set(C.drag.items.map(item=>item.id)),stationary=C.draft.elements.filter(item=>!selected.has(item.id));
    if(!stationary.length){clearSnapGuides();return{dx,dy};}
    const left=Math.min(...C.drag.items.map(item=>item.x))+dx,top=Math.min(...C.drag.items.map(item=>item.y))+dy;
    const right=Math.max(...C.drag.items.map(item=>item.x+item.w))+dx,bottom=Math.max(...C.drag.items.map(item=>item.y+item.h))+dy;
    const movingX=[left,(left+right)/2,right],movingY=[top,(top+bottom)/2,bottom];
    const targetX=stationary.flatMap(item=>[item.x,item.x+item.w/2,item.x+item.w]);
    const targetY=stationary.flatMap(item=>[item.y,item.y+item.h/2,item.y+item.h]);
    const threshold=5/Math.max(.25,C.viewport.zoom);let bestX=null,bestY=null;
    movingX.forEach(value=>targetX.forEach(target=>{const delta=target-value;if(Math.abs(delta)<=threshold&&(!bestX||Math.abs(delta)<Math.abs(bestX.delta)))bestX={delta,target};}));
    movingY.forEach(value=>targetY.forEach(target=>{const delta=target-value;if(Math.abs(delta)<=threshold&&(!bestY||Math.abs(delta)<Math.abs(bestY.delta)))bestY={delta,target};}));
    showSnapGuides(bestX?.target,bestY?.target);return{dx:dx+(bestX?.delta||0),dy:dy+(bestY?.delta||0)};
  }

  function addElement(type, point, extra = {}) {
    snapshot();
    const defaults = {
      text: { text: "双击输入文字", w: 220, h: 60, fill: "transparent", size: 26 },
      note: { eyebrow: "核心主题", text: "未命名主题", content: "在这里补充卡片内容。", w: 360, h: 240, fill: "#ffffff", size: 28, titleColor: "#1e2925", subtitleColor: "#6c7874", cardBorderColor: "#dfe8e4", cardBorderWidth: 1, cardStyle: "minimal", radius: 10 },
      rect: { text: "矩形", w: 220, h: 120, fill: "#dff8ee", size: 20 },
      ellipse: { text: "椭圆", w: 200, h: 130, fill: "#d9f0ff", size: 20 },
      shape: { text: "", w: 180, h: 140, fill: "#dff8ee", size: 18, shape: "square" },
      mind: { text: "中心主题", w: 220, h: 86, fill: "#05051f", color: "#ffffff", size: 28, radius: 14 },
      container: { text: "容器", w: 440, h: 280, fill: "rgba(225,248,240,.5)", size: 18 }
    };
    const base = defaults[type] || defaults.note;
    const item = { id: makeId("el"), type, x: Math.round(point.x), y: Math.round(point.y), w: base.w, h: base.h, rotation: 0, anchor: "center", lockAspect: true, constraint: "top-left", eyebrow: base.eyebrow || "", text: base.text, content: base.content || "", fill: base.fill, color: base.color || "#07382d", titleColor: base.titleColor || base.color || "#07382d", subtitleColor: base.subtitleColor || "#61736e", cardBorderColor: base.cardBorderColor || "#dfe8e4", cardBorderWidth: base.cardBorderWidth ?? 1, cardStyle: base.cardStyle || "minimal", size: base.size, font: CURATED_CHINESE_FONTS[0], fontWeight: type === "mind" ? 700 : 400, bold: type === "mind", titleBold: false, titleItalic: false, titleUnderline: false, titleStrike: false, italic: false, underline: false, strike: false, align: "left", verticalAlign: "middle", strokeEnabled: type === "shape" || type === "container", stroke: type === "mind" ? "#05051f" : "#07382d", strokeWidth: type === "container" ? 2 : 1.5, radius: base.radius ?? (type === "ellipse" ? 999 : type === "shape" ? 0 : 14), opacity: 100, fit: "contain", mindDepth: type === "mind" ? 0 : undefined, mindShape: "rounded", mindBorderStyle: type === "mind" ? "none" : "solid", mindTopicType: "central", mindDirection: "right", mindBranchType: "curve", mindBranchDash: "solid", mindBranchEndpoint: "round", mindBranchWidth: 2, mindBranchColor: "#0caa7d", ...extra };
    if (type === "mind") { item.align = "center"; item.verticalAlign = "middle"; item.mindStyleVersion = 3; }
    C.draft.elements.push(item);
    C.selected = new Set([item.id]);
    C.selectedConnection = "";
    markDirty(); renderEditor();
  }

  function insertImage(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const replacing = C.draft?.elements.find((item) => item.id === C.replaceImageId);
      if (replacing) {
        snapshot(); replacing.src = reader.result; replacing.name = file.name; markDirty(); renderElements(); renderInspector();
      } else addElement("image", C.pendingPoint || centerPoint(), { src: reader.result, name: file.name, text: "", w: 320, h: 220, fill: "#fff", fit: "contain", opacity: 100, radius: 0 });
      C.replaceImageId = "";
      C.pendingPoint = null;
    };
    reader.readAsDataURL(file); event.target.value = "";
  }

  function chooseCanvasFileType(type){
    C.pendingFileType=type;const accepts={video:"video/*",word:".doc,.docx",excel:".xls,.xlsx",ppt:".ppt,.pptx",pdf:"application/pdf,.pdf",other:"*/*"};
    const input=document.getElementById("canvasFileInput");input.accept=accepts[type]||"*/*";document.getElementById("canvasFileTypeDialog").classList.add("hidden");input.click();
  }

  function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
  function fileAsBuffer(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(file);});}
  async function unzipOfficeFiles(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}if(eocd<0)throw new Error("不是有效的 Office 文件");
    const count=view.getUint16(eocd+10,true),central=view.getUint32(eocd+16,true),decoder=new TextDecoder(),files={};let offset=central;
    for(let index=0;index<count&&offset+46<=bytes.length;index++){
      if(view.getUint32(offset,true)!==0x02014b50)break;const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true),name=decoder.decode(bytes.slice(offset+46,offset+46+nameLength));
      if(local+30<=bytes.length&&view.getUint32(local,true)===0x04034b50){const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),start=local+30+localName+localExtra,compressed=bytes.slice(start,start+size);let output;if(method===0)output=compressed;else if(method===8){const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));output=new Uint8Array(await new Response(stream).arrayBuffer());}if(output)files[name]=decoder.decode(output);}
      offset+=46+nameLength+extraLength+commentLength;
    }return files;
  }
  function xmlDocument(text){return new DOMParser().parseFromString(text||"","application/xml");}
  function excelColumnIndex(reference="A1"){const letters=(reference.match(/[A-Z]+/i)?.[0]||"A").toUpperCase();return [...letters].reduce((value,char)=>value*26+char.charCodeAt(0)-64,0)-1;}
  function excelColumnName(index){let value=index+1,name="";while(value){value--;name=String.fromCharCode(65+value%26)+name;value=Math.floor(value/26);}return name;}
  function excelColor(node){const rgb=node?.getAttribute("rgb");return rgb?`#${rgb.slice(-6)}`:"";}
  function parseExcelWorkbook(files){
    const shared=[...xmlDocument(files["xl/sharedStrings.xml"]).getElementsByTagNameNS("*","si")].map(si=>[...si.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join(""));
    const styles=xmlDocument(files["xl/styles.xml"]),fills=[...(styles.getElementsByTagNameNS("*","fills")[0]?.children||[])].map(fill=>excelColor(fill.getElementsByTagNameNS("*","fgColor")[0])),fonts=[...(styles.getElementsByTagNameNS("*","fonts")[0]?.children||[])].map(font=>({bold:!!font.getElementsByTagNameNS("*","b").length,color:excelColor(font.getElementsByTagNameNS("*","color")[0])})),xfs=[...(styles.getElementsByTagNameNS("*","cellXfs")[0]?.children||[])].map(xf=>({fill:fills[Number(xf.getAttribute("fillId")||0)]||"",font:fonts[Number(xf.getAttribute("fontId")||0)]||{}}));
    const workbook=xmlDocument(files["xl/workbook.xml"]),names=[...workbook.getElementsByTagNameNS("*","sheet")].map((sheet,index)=>sheet.getAttribute("name")||`Sheet${index+1}`),paths=Object.keys(files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a,b)=>(Number(a.match(/sheet(\d+)/)?.[1])||0)-(Number(b.match(/sheet(\d+)/)?.[1])||0));
    const reviewSheets=paths.map((path,index)=>{
      const sheet=xmlDocument(files[path]),cells=new Map(),covered=new Set();let maxRow=19,maxCol=11;
      [...sheet.getElementsByTagNameNS("*","c")].forEach(cell=>{const ref=cell.getAttribute("r")||"A1",row=Math.max(0,Number(ref.match(/\d+/)?.[0]||1)-1),col=excelColumnIndex(ref);if(row>=500||col>=100)return;const raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"",type=cell.getAttribute("t"),value=type==="s"?(shared[Number(raw)]||""):type==="inlineStr"?[...cell.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join(""):raw,style=xfs[Number(cell.getAttribute("s")||0)]||{};cells.set(`${row}:${col}`,{value,style});maxRow=Math.max(maxRow,row);maxCol=Math.max(maxCol,col);});
      [...sheet.getElementsByTagNameNS("*","mergeCell")].forEach(merge=>{const [start,end]=(merge.getAttribute("ref")||"").split(":"),r1=Number(start?.match(/\d+/)?.[0]||1)-1,c1=excelColumnIndex(start),r2=Number(end?.match(/\d+/)?.[0]||r1+1)-1,c2=excelColumnIndex(end||start),cell=cells.get(`${r1}:${c1}`)||{value:"",style:{}};cell.rowspan=r2-r1+1;cell.colspan=c2-c1+1;cells.set(`${r1}:${c1}`,cell);for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)if(r!==r1||c!==c1)covered.add(`${r}:${c}`);maxRow=Math.max(maxRow,r2);maxCol=Math.max(maxCol,c2);});
      const head=`<thead><tr><th></th>${Array.from({length:maxCol+1},(_,col)=>`<th>${excelColumnName(col)}</th>`).join("")}</tr></thead>`,body=Array.from({length:maxRow+1},(_,row)=>`<tr><th>${row+1}</th>${Array.from({length:maxCol+1},(_,col)=>{if(covered.has(`${row}:${col}`))return"";const cell=cells.get(`${row}:${col}`)||{value:"",style:{}},style=[cell.style.fill&&`background:${cell.style.fill}`,cell.style.font?.color&&`color:${cell.style.font.color}`,cell.style.font?.bold&&"font-weight:700"].filter(Boolean).join(";");return`<td ${cell.rowspan?`rowspan="${cell.rowspan}"`:""} ${cell.colspan?`colspan="${cell.colspan}"`:""} style="${style}">${esc(cell.value)}</td>`;}).join("")}</tr>`).join("");
      return{name:names[index]||`Sheet${index+1}`,html:`<table>${head}<tbody>${body}</tbody></table>`};
    });
    return{reviewSheets,reviewSheet:0,reviewTable:reviewSheets[0]?.html||"<table><tbody><tr><td></td></tr></tbody></table>",reviewPages:[],reviewPage:1};
  }
  async function parseReviewFile(file,kind){
    if(kind==="video"||kind==="pdf")return{reviewSrc:await fileAsDataUrl(file),reviewPages:[],reviewPage:1};
    if(["word","ppt"].includes(kind)&&window.geruosiDesktop?.renderOfficePreview){
      try{const localPath=window.geruosiDesktop.getPathForFile(file),native=await window.geruosiDesktop.renderOfficePreview({path:localPath,kind});if(native?.src)return{reviewSrc:native.src,reviewTotal:native.pages||1,reviewPages:[],reviewPage:1,nativeOfficePreview:true};}catch(error){console.warn("Office 原生预览失败，使用内置解析",error);}
    }
    if(!/\.(docx|xlsx|pptx)$/i.test(file.name))return{reviewPages:[`<div class="review-unsupported">此旧版格式暂不支持内嵌解析，请转换为 ${kind==="word"?"DOCX":kind==="excel"?"XLSX":"PPTX"} 后重新导入。</div>`],reviewPage:1};
    const files=await unzipOfficeFiles(await fileAsBuffer(file));
    if(kind==="word"){
      const doc=xmlDocument(files["word/document.xml"]),paragraphs=[...doc.getElementsByTagNameNS("*","p")].map(p=>[...p.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join("")).filter(Boolean),pages=[];for(let i=0;i<paragraphs.length;i+=36)pages.push(`<article class="review-word-page">${paragraphs.slice(i,i+36).map((text,index)=>index===0&&i===0?`<h2>${esc(text)}</h2>`:`<p>${esc(text)}</p>`).join("")}</article>`);return{reviewPages:pages.length?pages:["<article class=\"review-word-page\"><p>文档没有可显示的文字。</p></article>"],reviewPage:1};
    }
    if(kind==="ppt"){
      const names=Object.keys(files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>(Number(a.match(/\d+/)?.[0])||0)-(Number(b.match(/\d+/)?.[0])||0)),pages=names.map((name,index)=>{const texts=[...xmlDocument(files[name]).getElementsByTagNameNS("*","t")].map(node=>node.textContent).filter(Boolean);return `<article class="review-ppt-slide"><small>${index+1}</small>${texts.map((text,i)=>i===0?`<h2>${esc(text)}</h2>`:`<p>${esc(text)}</p>`).join("")}</article>`;});return{reviewPages:pages.length?pages:["<article class=\"review-ppt-slide\"><p>幻灯片没有可显示的文字。</p></article>"],reviewPage:1};
    }
    if(kind==="excel")return parseExcelWorkbook(files);
    const shared=[...xmlDocument(files["xl/sharedStrings.xml"]).getElementsByTagNameNS("*","si")].map(si=>[...si.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join("")),sheetName=Object.keys(files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0],sheet=xmlDocument(files[sheetName]),styles=xmlDocument(files["xl/styles.xml"]),fills=[...(styles.getElementsByTagNameNS("*","fills")[0]?.children||[])].map(fill=>excelColor(fill.getElementsByTagNameNS("*","fgColor")[0])),fonts=[...(styles.getElementsByTagNameNS("*","fonts")[0]?.children||[])].map(font=>({bold:!!font.getElementsByTagNameNS("*","b").length,color:excelColor(font.getElementsByTagNameNS("*","color")[0])})),xfs=[...(styles.getElementsByTagNameNS("*","cellXfs")[0]?.children||[])].map(xf=>({fill:fills[Number(xf.getAttribute("fillId")||0)]||"",font:fonts[Number(xf.getAttribute("fontId")||0)]||{}})),cells=new Map();let maxRow=0,maxCol=0;
    [...sheet.getElementsByTagNameNS("*","c")].forEach(cell=>{const ref=cell.getAttribute("r")||"A1",row=Math.max(0,Number(ref.match(/\d+/)?.[0]||1)-1),col=excelColumnIndex(ref);if(row>=500||col>=100)return;const raw=cell.getElementsByTagNameNS("*","v")[0]?.textContent||"",type=cell.getAttribute("t"),value=type==="s"?(shared[Number(raw)]||""):type==="inlineStr"?[...cell.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join(""):raw,style=xfs[Number(cell.getAttribute("s")||0)]||{};cells.set(`${row}:${col}`,{value,style});maxRow=Math.max(maxRow,row);maxCol=Math.max(maxCol,col);});
    const covered=new Set();[...sheet.getElementsByTagNameNS("*","mergeCell")].forEach(merge=>{const [start,end]=(merge.getAttribute("ref")||"").split(":"),r1=Number(start?.match(/\d+/)?.[0]||1)-1,c1=excelColumnIndex(start),r2=Number(end?.match(/\d+/)?.[0]||r1+1)-1,c2=excelColumnIndex(end||start),cell=cells.get(`${r1}:${c1}`)||{value:"",style:{}};cell.rowspan=r2-r1+1;cell.colspan=c2-c1+1;cells.set(`${r1}:${c1}`,cell);for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)if(r!==r1||c!==c1)covered.add(`${r}:${c}`);maxRow=Math.max(maxRow,r2);maxCol=Math.max(maxCol,c2);});
    const head=`<thead><tr><th></th>${Array.from({length:maxCol+1},(_,col)=>`<th>${excelColumnName(col)}</th>`).join("")}</tr></thead>`,body=Array.from({length:maxRow+1},(_,row)=>`<tr><th>${row+1}</th>${Array.from({length:maxCol+1},(_,col)=>{if(covered.has(`${row}:${col}`))return"";const cell=cells.get(`${row}:${col}`)||{value:"",style:{}},style=[cell.style.fill&&`background:${cell.style.fill}`,cell.style.font?.color&&`color:${cell.style.font.color}`,cell.style.font?.bold&&"font-weight:700"].filter(Boolean).join(";");return`<td ${cell.rowspan?`rowspan="${cell.rowspan}"`:""} ${cell.colspan?`colspan="${cell.colspan}"`:""} style="${style}">${esc(cell.value)}</td>`;}).join("")}</tr>`).join("");return{reviewTable:`<table>${head}<tbody>${body}</tbody></table>`,reviewPages:[],reviewPage:1};
  }

  async function insertFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const kind=C.pendingFileType||"other",point=C.pendingPoint||centerPoint();
    if(kind==="other")addElement("file",point,{name:file.name,text:file.name,meta:`${Math.ceil(file.size/1024)} KB`,w:260,h:100,fill:"#fff"});
    else{try{const review=await parseReviewFile(file,kind);addElement("file-review",point,{name:file.name,text:file.name,reviewKind:kind,reviewZoom:100,lockAspect:false,w:kind==="video"?520:kind==="excel"?620:kind==="ppt"?560:480,h:kind==="video"?340:kind==="excel"?400:kind==="ppt"?380:620,fill:"#fff",radius:12,...review});}catch(error){addElement("file-review",point,{name:file.name,text:file.name,reviewKind:kind,reviewZoom:100,lockAspect:false,w:480,h:300,fill:"#fff",radius:12,reviewPages:[`<div class="review-unsupported">无法解析文件：${esc(error.message)}</div>`],reviewPage:1});}}
    C.pendingPoint = null;
    C.pendingFileType="other";
    event.target.value = "";
  }

  function renderEditor() { applyViewport(); renderElements(); renderConnections(); renderInspector(); updateSaveState(); }

  function renderElements() {
    const root = document.getElementById("canvasElements"); if (!root) return;
    const retainedReviews=new Map([...root.querySelectorAll(".canvas-file-review")].map(review=>[review.dataset.reviewId,review]));
    root.innerHTML = C.draft.elements.map((item) => elementHtml(item)).join("");
    root.querySelectorAll(".canvas-file-review").forEach(review=>{const retained=retainedReviews.get(review.dataset.reviewId);if(retained&&retained.dataset.renderKey===review.dataset.renderKey)review.replaceWith(retained);});
    root.querySelectorAll(".canvas-element").forEach((node) => {
      node.onpointerdown = (event) => elementPointerDown(event, node);
      node.ondblclick = (event) => {
        event.stopPropagation();
        const item = C.draft.elements.find(entry => entry.id === node.dataset.id);
        if (item?.type === "shape") return togglePenEditing(item);
        editElement(node.dataset.id, event);
      };
    });
    root.querySelectorAll(".canvas-file-review").forEach(review=>{
      if(review.dataset.reviewBound==="1")return;
      review.dataset.reviewBound="1";
      if(review.querySelector("[data-pdf-canvas]"))renderNativePdfReview(review);
      review.querySelectorAll("[data-review-step]").forEach(button=>button.onclick=event=>{event.stopPropagation();const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!item)return;const total=Math.max(1,Number(item.reviewTotal||item.reviewPages?.length||9999));item.reviewPage=clamp(Number(item.reviewPage||1)+Number(button.dataset.reviewStep),1,total);markDirty();renderElements();});
      review.querySelector("[data-review-page]")?.addEventListener("change",event=>{const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!item)return;item.reviewPage=clamp(Number(event.target.value||1),1,Math.max(1,Number(item.reviewTotal||item.reviewPages?.length||9999)));markDirty();renderElements();});
      review.querySelectorAll("[data-review-zoom]").forEach(button=>button.onclick=event=>{event.stopPropagation();const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!item)return;item.reviewZoom=clamp(Number(item.reviewZoom||100)+Number(button.dataset.reviewZoom),50,220);markDirty();renderElements();});
      review.querySelectorAll("[data-review-sheet]").forEach(button=>button.onclick=event=>{event.stopPropagation();const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!item)return;item.reviewSheet=Number(button.dataset.reviewSheet||0);markDirty();renderElements();});
      review.querySelector("[data-review-fit]")?.addEventListener("click",event=>{event.stopPropagation();const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId),body=review.querySelector("main");if(!item||!body)return;const base={word:[680,900],pdf:[680,900],ppt:[720,405],excel:[900,560]}[item.reviewKind]||[body.clientWidth,body.clientHeight];item.reviewZoom=clamp(Math.floor(Math.min(body.clientWidth/base[0],body.clientHeight/base[1])*100),50,220);item.reviewFitted=true;markDirty();renderElements();});
      const body=review.querySelector("main"),scroll=review.querySelector(".canvas-review-interactive")||body;
      if(body){
        body.addEventListener("wheel",event=>{const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!item||!C.selected.has(review.dataset.reviewId))return;event.stopPropagation();if(event.ctrlKey){event.preventDefault();item.reviewZoom=clamp(Number(item.reviewZoom||100)+(event.deltaY<0?10:-10),50,220);markDirty();renderElements();}},{passive:false});
        const pointers=new Map();let pan=null,pinch=null;
        body.onpointerdown=event=>{if(event.target.closest("video,button,input"))return;if(event.pointerType==="mouse"&&event.button!==0)return;event.stopPropagation();const item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(!C.selected.has(review.dataset.reviewId)){C.selected.clear();C.selected.add(review.dataset.reviewId);renderElements();renderInspector();return;}body.setPointerCapture?.(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===1)pan={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};if(pointers.size===2){const p=[...pointers.values()];pinch={distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),zoom:Number(item?.reviewZoom||100)};pan=null;}};
        body.onpointermove=event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2&&pinch){event.preventDefault();const p=[...pointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),item=C.draft.elements.find(entry=>entry.id===review.dataset.reviewId);if(item){item.reviewZoom=clamp(Math.round(pinch.zoom*distance/Math.max(1,pinch.distance)),50,220);review.style.setProperty("--live-review-zoom",item.reviewZoom/100);review.style.setProperty("--live-native-zoom",item.reviewZoom/Math.max(1,pinch.zoom));}}else if(pan){event.preventDefault();scroll.scrollLeft=pan.left-(event.clientX-pan.x);scroll.scrollTop=pan.top-(event.clientY-pan.y);body.classList.add("is-review-panning");}};
        const finish=event=>{if(!pointers.has(event.pointerId))return;pointers.delete(event.pointerId);body.releasePointerCapture?.(event.pointerId);body.classList.remove("is-review-panning");if(!pointers.size){if(pinch){markDirty();renderElements();}pan=pinch=null;}};body.onpointerup=finish;body.onpointercancel=finish;
      }
    });
    if(C.selected.size>1){
      const items=C.draft.elements.filter(item=>C.selected.has(item.id));
      if(items.length){const left=Math.min(...items.map(item=>item.x)),top=Math.min(...items.map(item=>item.y)),right=Math.max(...items.map(item=>item.x+item.w)),bottom=Math.max(...items.map(item=>item.y+item.h));const frame=document.createElement("div");frame.className="canvas-selection-frame";Object.assign(frame.style,{left:`${left-6}px`,top:`${top-6}px`,width:`${right-left+12}px`,height:`${bottom-top+12}px`});frame.onpointerdown=event=>{event.stopPropagation();snapshot();C.drag={kind:"move",sx:event.clientX,sy:event.clientY,items:items.map(item=>({id:item.id,x:item.x,y:item.y,w:item.w,h:item.h,rotation:Number(item.rotation||0)}))};};root.append(frame);}
    }
  }

  function elementHtml(item) {
    const selected = C.selected.has(item.id);
    const elementBackground = item.type === "shape" || (item.type === "text" && item.bgEnabled === false) ? "transparent" : item.type === "text" ? hexToRgba(item.fill || "#ffffff", Number(item.bgOpacity ?? 0)) : item.fill;
    const mindRadius = item.mindShape === "rect" ? 0 : item.mindShape === "capsule" ? 999 : Number(item.radius ?? 14);
    const cornerRadius = item.type === "ellipse" && Number(item.radius ?? 999) >= 100 ? "50%" : item.type === "mind" && mindRadius >= 999 ? "999px" : `${item.type === "mind" ? mindRadius : Number(item.radius ?? 14)}px`;
    const textColor = item.type === "text" ? hexToRgba(item.color || "#07382d", Number(item.textOpacity ?? 100)) : item.color;
    const verticalAlign = item.verticalAlign === "bottom" ? "flex-end" : item.verticalAlign === "middle" ? "center" : "flex-start";
    const cardBorderStyles = item.type === "note" ? `--card-border-color:${toHex(item.cardBorderColor || "#dfe8e4")};--card-border-width:${clamp(Number(item.cardBorderWidth ?? 1),0,12)}px;` : "";
    const mindBorderStyles = item.type === "mind" ? item.mindShape === "underline" ? `border:0 !important;border-bottom:${Number(item.strokeWidth || 2)}px solid ${item.stroke || "#0caa7d"} !important;` : `border:${item.mindBorderStyle === "none" ? 0 : Number(item.strokeWidth || 1.5)}px ${item.mindBorderStyle || "solid"} ${item.stroke || "#0caa7d"} !important;` : "";
    const styles = `left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px;transform:rotate(${Number(item.rotation || 0)}deg);transform-origin:${anchorOrigin(item.anchor)};background:${item.type === "mind" && item.mindShape === "underline" ? "transparent" : elementBackground};color:${textColor};font-size:${item.size}px;font-family:${esc(effectiveCanvasFont(item.font))};font-weight:${Number(item.fontWeight || (item.bold ? 700 : 400))};font-style:${item.italic ? "italic" : "normal"};text-decoration:${item.underline ? "underline" : item.strike ? "line-through" : "none"};text-align:${item.align};--canvas-text-vertical:${verticalAlign};${cardBorderStyles}${mindBorderStyles}border-radius:${cornerRadius};opacity:${item.type === "shape" ? 1 : clamp(Number(item.opacity ?? 100), 0, 100) / 100};${item.type === "container" ? `border:${item.strokeEnabled === false ? 0 : Number(item.strokeWidth || 2)}px dashed ${item.stroke || "#92d9c1"}` : ""}`;
    let content = `<div class="canvas-element-text">${esc(item.text || "").replace(/\n/g, "<br>")}</div>`;
    if (item.type === "note") {
      const cardScale = clamp(Math.sqrt((Number(item.w || 360) * Number(item.h || 240)) / (360 * 240)), .62, 1.5);
      const titleDecoration = `${item.titleUnderline ? "underline" : ""} ${item.titleStrike ? "line-through" : ""}`.trim() || "none";
      content = `<div class="canvas-card-content card-${esc(item.cardStyle || "minimal")}" style="--card-scale:${cardScale};--card-title-size:${Number(item.size || 28) * cardScale}px;--card-body-size:${Math.max(11, Number(item.size || 28) * .56 * cardScale)}px;--card-title-color:${toHex(item.titleColor || item.color || "#14231f")};--card-subtitle-color:${toHex(item.subtitleColor || "#51645e")};--card-border-color:${toHex(item.cardBorderColor || "#dfe8e4")};--card-border-width:${clamp(Number(item.cardBorderWidth ?? 1),0,12)}px;--card-title-weight:${item.titleBold || item.bold ? 700 : 400};--card-title-style:${item.titleItalic ? "italic" : "normal"};--card-title-decoration:${titleDecoration};font-family:${esc(effectiveCanvasFont(item.font))}"><div class="canvas-card-kicker"><span></span><b data-card-field="eyebrow">${esc(item.eyebrow || "核心主题")}</b></div><div class="canvas-card-title" data-card-field="text">${esc(item.text || "未命名主题")}</div><div class="canvas-card-description" data-card-field="content">${esc(item.content || "在这里补充卡片内容。").replace(/\n/g, "<br>")}</div><div class="canvas-card-footer"><i></i><span>PROJECT CARD</span></div></div>`;
    }
    if (item.type === "shape") {
      const svgRadius = clamp(Number(item.radius || 0) / Math.max(item.w, item.h) * 24, 0, 10);
      const opacity = clamp(Number(item.opacity ?? 100), 0, 100) / 100;
      const rectangle = ["square", "rounded", "soft-rounded"].includes(item.shape || "square");
      const fallbackRadius = Number(item.radius || ((item.shape === "rounded") ? 18 : (item.shape === "soft-rounded") ? 28 : 0));
      const corners = [item.radiusTL, item.radiusTR, item.radiusBR, item.radiusBL].map(value => `${Math.max(0, Number(value ?? fallbackRadius))}px`).join(" ");
      const polygon = POLYGON_SHAPES.includes(item.shape) || STAR_SHAPES.includes(item.shape) || item.penEditing || Array.isArray(item.pathPoints);
      const polygonPoints = item.penEditing || Array.isArray(item.pathPoints) ? editableShapePoints(item) : STAR_SHAPES.includes(item.shape) ? starShapePoints(item.starPoints || 5,item.starInnerRadius || 46) : item.polygonSides ? regularPolygonPoints(item.polygonSides) : defaultPolygonPoints(item.shape);
      content = Array.isArray(item.booleanContours)
        ? `<div class="canvas-shape-art" style="--shape-fill:${toHex(item.fill || "#dff8ee")};color:${item.strokeEnabled === false ? "transparent" : toHex(item.stroke || "#07382d")};--shape-stroke-width:${Number(item.strokeWidth || 1.5)};opacity:${opacity}">${booleanShapeSvg(item)}</div>`
        : rectangle && !item.penEditing && !Array.isArray(item.pathPoints)
        ? `<div class="canvas-shape-art canvas-rectangle-art" style="background:${toHex(item.fill || "#dff8ee")};box-shadow:${item.strokeEnabled === false ? "none" : `inset 0 0 0 ${Number(item.strokeWidth || 1.5)}px ${item.stroke || item.color}`};border-radius:${corners};opacity:${opacity}"></div>`
        : polygon
        ? `<div class="canvas-shape-art" style="color:${item.strokeEnabled === false ? "transparent" : (item.stroke || item.color)};--shape-fill:${toHex(item.fill || "#dff8ee")};--shape-stroke-width:${Number(item.strokeWidth || 1.5)};opacity:${opacity}"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${roundedPolygonPath(polygonPoints,item.polygonRadius || 0)}"></path></svg></div>`
        : `<div class="canvas-shape-art" style="color:${item.strokeEnabled === false ? "transparent" : (item.stroke || item.color)};--shape-fill:${toHex(item.fill || "#dff8ee")};--shape-stroke-width:${Number(item.strokeWidth || 1.5)};--shape-radius:${svgRadius}px;opacity:${opacity}">${shapeSvg(item.shape || "square")}</div>`;
    }
    if (item.type === "image") content = `<img src="${item.src}" alt="${esc(item.name || "画布图片")}" style="object-fit:${item.fit || "contain"}">`;
    if (item.type === "file") content = `<div class="canvas-file-icon">${fileIcon(item.name)}</div><div><strong>${esc(item.name)}</strong><small>${esc(item.meta || "本地文件")}</small></div>`;
    if (item.type === "file-review") content = reviewFileHtml(item);
    if (item.type === "link") content = `<div class="canvas-web-card"><div class="canvas-link-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></div><div><strong>${esc(item.text || "网页卡片")}</strong><small>${esc(item.url || "https://")}</small><em>网页链接</em></div></div>`;
    const penPoints = selected && item.type === "shape" && item.penEditing ? editableShapePoints(item).map((point,index)=>`<button class="canvas-pen-point" data-pen-point="${index}" style="left:${point.x}%;top:${point.y}%" title="拖动节点；双击图形退出钢笔编辑" aria-label="钢笔节点 ${index+1}"></button>`).join("") : "";
    const handles = selected && !item.penEditing ? ["nw","n","ne","e","se","s","sw","w"].map((direction) => `<button class="canvas-resize canvas-resize-${direction}" data-resize="${direction}" title="拖动边缘调整大小" aria-label="调整元素大小"></button>`).join("") + `<button class="canvas-rotate" title="自由旋转；按住 Shift 每次吸附 45°" aria-label="旋转元素">↻</button>` : "";
    const connectHandle=selected&&C.selected.size===1&&!item.penEditing?`<button class="canvas-connect-handle ${C.connectingFrom===item.id?"active":""}" title="连接到其他元素" aria-label="创建连线">+</button>`:"";
    return `<article class="canvas-element type-${item.type} shape-${item.shape || ""} ${selected ? "selected" : ""} ${C.connectingFrom===item.id?"connection-source":""} ${item.penEditing ? "pen-editing" : ""}" data-id="${item.id}" style="${styles}">${content}${penPoints}${handles}${connectHandle}</article>`;
  }

  function reviewFileHtml(item){
    const kind=item.reviewKind||"other",page=Math.max(1,Number(item.reviewPage||1)),total=Math.max(1,Number(item.reviewTotal||item.reviewPages?.length||1)),zoom=clamp(Number(item.reviewZoom||100),50,220),labels={video:"视频",word:"Word",excel:"Excel",ppt:"PPT",pdf:"PDF"};
    const icon=(path)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    const paging=["word","ppt","pdf"].includes(kind)?`<div class="review-paging"><button type="button" data-review-step="-1" title="上一页">${icon('<path d="m14.5 6-6 6 6 6"/>')}</button><input data-review-page type="number" min="1" max="${total}" value="${page}"><span data-review-total>/${total}</span><button type="button" data-review-step="1" title="下一页">${icon('<path d="m9.5 6 6 6-6 6"/>')}</button></div>`:"";
    const zoomControls=kind==="video"?"":`<div class="review-zoom"><button type="button" data-review-zoom="-10" title="缩小">${icon('<path d="M6 12h12"/>')}</button><em>${zoom}%</em><button type="button" data-review-zoom="10" title="放大">${icon('<path d="M6 12h12M12 6v12"/>')}</button></div><button type="button" class="review-fit" data-review-fit title="适应窗口并左上对齐">${icon('<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/><path d="m4 9 5-5m6 0 5 5M4 15l5 5m6 0 5-5"/>')}</button>`,toolbar=`<header><b>${labels[kind]||"文件"}</b><span title="${esc(item.name)}">${esc(item.name)}</span>${paging}${zoomControls}</header>`;
    let body="";
    if(kind==="video")body=`<video controls preload="metadata" src="${item.reviewSrc||""}"></video>`;
    else if(kind==="pdf"||item.nativeOfficePreview)body=`<div class="review-native-scroll canvas-review-interactive"><div class="review-pdf-stage"><canvas data-pdf-canvas aria-label="${labels[kind]} 第 ${page} 页"></canvas><div class="review-pdf-status">正在渲染第 ${page} 页…</div></div></div>`;
    else if(kind==="excel")body=`<div class="review-excel-workbook"><div class="review-excel-scroll canvas-review-interactive" style="--review-zoom:${zoom/100}">${item.reviewSheets?.[Number(item.reviewSheet||0)]?.html||item.reviewTable||item.reviewPages?.[0]||""}</div>${item.reviewSheets?.length?`<nav class="review-excel-tabs">${item.reviewSheets.map((sheet,index)=>`<button type="button" data-review-sheet="${index}" class="${Number(item.reviewSheet||0)===index?"active":""}">${esc(sheet.name)}</button>`).join("")}</nav>`:""}</div>`;
    else body=`<div class="review-page-scroll canvas-review-interactive" style="--review-zoom:${zoom/100}">${item.reviewPages?.[page-1]||item.reviewPages?.[0]||""}</div>`;
    const renderKey=[kind,page,zoom,Number(item.reviewSheet||0),String(item.reviewSrc||"").length,item.reviewSheets?.length||0].join(":");
    return `<div class="canvas-file-review review-${kind} ${item.reviewFitted?"is-review-fitted":""}" data-review-id="${item.id}" data-render-key="${renderKey}">${toolbar}<main>${body}</main></div>`;
  }

  function togglePenEditing(item) {
    snapshot();
    item.pathPoints = editableShapePoints(item).map(point => ({...point}));
    if (Array.isArray(item.booleanContours)) { item.booleanContours = null; item.booleanOperation = ""; }
    item.penEditing = !item.penEditing;
    C.selected = new Set([item.id]);
    markDirty(); renderEditor();
  }

  function booleanShapeSvg(item) {
    const paths=(item.booleanContours||[]).map(points=>roundedPolygonPath(points,0));
    const fill=toHex(item.fill||"#dff8ee"),stroke=item.strokeEnabled===false?"none":toHex(item.stroke||"#07382d"),width=Number(item.strokeWidth||1.5);
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${paths.join(" ")}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/></svg>`;
  }

  function simplifyContour(points) {
    if(points.length<4) return points;
    const clean=points.filter((point,index)=>{const before=points[(index-1+points.length)%points.length],after=points[(index+1)%points.length];return !((before.x===point.x&&point.x===after.x)||(before.y===point.y&&point.y===after.y));});
    const distance=(point,start,end)=>{const dx=end.x-start.x,dy=end.y-start.y;if(!dx&&!dy)return Math.hypot(point.x-start.x,point.y-start.y);const t=clamp(((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(point.x-(start.x+t*dx),point.y-(start.y+t*dy));};
    const rdp=(list,tolerance)=>{if(list.length<3)return list;let max=0,index=0;for(let i=1;i<list.length-1;i++){const d=distance(list[i],list[0],list[list.length-1]);if(d>max){max=d;index=i;}}if(max<=tolerance)return[list[0],list[list.length-1]];return[...rdp(list.slice(0,index+1),tolerance).slice(0,-1),...rdp(list.slice(index),tolerance)];};
    let split=1,maxDistance=0;for(let index=1;index<clean.length;index++){const d=Math.hypot(clean[index].x-clean[0].x,clean[index].y-clean[0].y);if(d>maxDistance){maxDistance=d;split=index;}}
    const first=rdp(clean.slice(0,split+1),.7),second=rdp([...clean.slice(split),clean[0]],.7);
    return [...first.slice(0,-1),...second.slice(0,-1)];
  }

  function rasterBooleanContours(children,operation) {
    const size=220,canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");
    const draw=(points)=>{ctx.beginPath();points.forEach((point,index)=>(index?ctx.lineTo(point.x/100*size,point.y/100*size):ctx.moveTo(point.x/100*size,point.y/100*size)));ctx.closePath();ctx.fill();};
    ctx.fillStyle="#000";
    children.forEach((points,index)=>{ctx.globalCompositeOperation=index===0?"source-over":operation==="subtract"?"destination-out":operation==="intersect"?"destination-in":operation==="exclude"?"xor":"source-over";draw(points);});
    ctx.globalCompositeOperation="source-over";
    const data=ctx.getImageData(0,0,size,size).data,filled=(x,y)=>x>=0&&y>=0&&x<size&&y<size&&data[(y*size+x)*4+3]>127;
    const edges=[];
    const add=(ax,ay,bx,by)=>edges.push({a:`${ax},${ay}`,b:`${bx},${by}`,ax,ay,bx,by,used:false});
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(filled(x,y)){
      if(!filled(x,y-1))add(x,y,x+1,y); if(!filled(x+1,y))add(x+1,y,x+1,y+1);
      if(!filled(x,y+1))add(x+1,y+1,x,y+1); if(!filled(x-1,y))add(x,y+1,x,y);
    }
    const starts=new Map();edges.forEach(edge=>{if(!starts.has(edge.a))starts.set(edge.a,[]);starts.get(edge.a).push(edge);});
    const contours=[];
    edges.forEach(first=>{if(first.used)return;const points=[],start=first.a;let edge=first,guard=0;while(edge&&!edge.used&&guard++<edges.length+1){edge.used=true;points.push({x:edge.ax/size*100,y:edge.ay/size*100});if(edge.b===start)break;edge=(starts.get(edge.b)||[]).find(next=>!next.used);}if(points.length>=3)contours.push(simplifyContour(points));});
    return contours.filter(points=>points.length>=3);
  }

  function performBooleanOperation(operation) {
    if(!operation) return;
    const items=[...C.selected].map(id=>C.draft.elements.find(entry=>entry.id===id)).filter(entry=>entry?.type==="shape");
    if(items.length<2) return;
    snapshot();
    const left=Math.min(...items.map(item=>item.x)),top=Math.min(...items.map(item=>item.y));
    const right=Math.max(...items.map(item=>item.x+item.w)),bottom=Math.max(...items.map(item=>item.y+item.h));
    const width=Math.max(1,right-left),height=Math.max(1,bottom-top);
    const booleanChildren=items.map(item=>editableShapePoints(item).map(point=>({x:(item.x+point.x/100*item.w-left)/width*100,y:(item.y+point.y/100*item.h-top)/height*100})));
    const booleanContours=rasterBooleanContours(booleanChildren,operation);
    if(!booleanContours.length) return;
    const first=items[0];
    const result={...deepCopy(first),id:makeId("el"),shape:"boolean",x:left,y:top,w:width,h:height,rotation:0,booleanOperation:operation,booleanContours,booleanChildren:null,pathPoints:null,penEditing:false};
    const ids=new Set(items.map(item=>item.id));
    C.draft.elements=C.draft.elements.filter(item=>!ids.has(item.id));
    C.draft.connections=C.draft.connections.filter(line=>!ids.has(line.from)&&!ids.has(line.to));
    C.draft.elements.push(result); C.selected=new Set([result.id]);
    markDirty(); renderEditor();
  }

  function fileIcon(name = "") { const ext = name.split(".").pop().toUpperCase(); return ["DOC", "DOCX"].includes(ext) ? "W" : ["XLS", "XLSX"].includes(ext) ? "X" : ["PPT", "PPTX"].includes(ext) ? "P" : "F"; }

  function fitMindNodeToText(item) {
    if(item.type!=="mind") return;
    const explicitLines=String(item.text||"").split("\n");
    const visualLines=explicitLines.reduce((count,line)=>count+Math.max(1,Math.ceil(Array.from(line).length/20)),0);
    const longest=Math.min(20,Math.max(1,...explicitLines.map(line=>Array.from(line).length)));
    const depth=mindNodeDepth(item),baseWidth=depth===0?220:depth===1?164:150,baseHeight=depth===0?86:depth===1?58:48;
    item.w=Math.round(Math.max(baseWidth,longest*Number(item.size||17)*1.02+34));
    item.h=Math.round(Math.max(baseHeight,visualLines*Number(item.size||17)*1.45+24));
  }

  function editElement(id, event) {
    const item = C.draft.elements.find((entry) => entry.id === id);
    if (!item || ["image", "file"].includes(item.type)) return;
    const node = document.querySelector(`.canvas-element[data-id="${id}"]`);
    const cardTarget = item.type === "note" ? event?.target?.closest?.("[data-card-field]") : null;
    const prop = cardTarget?.dataset.cardField || "text";
    const text = cardTarget || node?.querySelector(".canvas-element-text, strong");
    if (!text) return;
    snapshot();
    node.classList.add("editing");
    text.setAttribute("contenteditable", "true");
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const finish = () => {
      item[prop] = text.innerText.trim() || (prop === "content" ? "在这里补充卡片内容。" : item.type === "link" ? "网页" : "未命名");
      fitMindNodeToText(item);
      if(item.type==="mind" && item.mindParentId){const parent=C.draft.elements.find(entry=>entry.id===item.mindParentId);if(parent)layoutMindChildren(parent);}
      text.removeAttribute("contenteditable");
      node.classList.remove("editing");
      markDirty();
      renderElements();
      renderConnections();
    };
    text.oninput = () => { item[prop] = text.innerText; fitMindNodeToText(item); node.style.width=`${item.w}px`; node.style.height=`${item.h}px`; markDirty(); renderConnections(); };
    text.onkeydown = (event) => {
      if (item.type === "mind" && event.key === "Enter" && event.shiftKey) return;
      if (item.type === "mind" && ["Tab", "Enter"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const mode = event.key === "Tab" ? "child" : "sibling";
        text.blur();
        setTimeout(() => addMindRelative(item, mode), 0);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        text.blur();
      }
    };
    text.onblur = finish;
  }

  function renderConnectionPreview(event){
    const svg=document.getElementById("canvasConnections"),from=C.draft.elements.find(item=>item.id===C.connectingFrom);if(!svg||!from)return;
    const point=canvasPoint(event),center={x:from.x+from.w/2,y:from.y+from.h/2},dx=point.x-center.x,dy=point.y-center.y;
    let x1=center.x,y1=center.y;if(Math.abs(dx)>=Math.abs(dy)){x1=dx>=0?from.x+from.w:from.x;y1=center.y;}else{x1=center.x;y1=dy>=0?from.y+from.h:from.y;}
    const horizontal=Math.abs(point.x-x1)>=Math.abs(point.y-y1),reach=Math.max(35,Math.min(130,(horizontal?Math.abs(point.x-x1):Math.abs(point.y-y1))*.42));
    const d=horizontal?`M${x1},${y1} C${x1+Math.sign(point.x-x1)*reach},${y1} ${point.x-Math.sign(point.x-x1)*reach},${point.y} ${point.x},${point.y}`:`M${x1},${y1} C${x1},${y1+Math.sign(point.y-y1)*reach} ${point.x},${point.y-Math.sign(point.y-y1)*reach} ${point.x},${point.y}`;
    let preview=svg.querySelector("#canvasConnectionPreview");if(!preview){preview=document.createElementNS("http://www.w3.org/2000/svg","path");preview.id="canvasConnectionPreview";preview.setAttribute("class","canvas-connection-preview");svg.append(preview);}preview.setAttribute("d",d);
  }

  function renderConnections() {
    const svg = document.getElementById("canvasConnections"); if (!svg) return;
    svg.setAttribute("viewBox", "0 0 5000 3200");
    svg.innerHTML = `<defs><marker id="canvasArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"></path></marker></defs>` + C.draft.connections.map((line) => {
      const from = C.draft.elements.find((item) => item.id === line.from); const to = C.draft.elements.find((item) => item.id === line.to); if (!from || !to) return "";
      let x1 = from.x + from.w / 2, y1 = from.y + from.h / 2, x2 = to.x + to.w / 2, y2 = to.y + to.h / 2;
      if (line.mind || from.type === "mind" || to.type === "mind") {
        const fromCenter={x:from.x+from.w/2,y:from.y+from.h/2},toCenter={x:to.x+to.w/2,y:to.y+to.h/2};
        const dx=toCenter.x-fromCenter.x,dy=toCenter.y-fromCenter.y;
        if(Math.abs(dx)>=Math.abs(dy)){x1=dx>=0?from.x+from.w:from.x;y1=fromCenter.y;x2=dx>=0?to.x:to.x+to.w;y2=toCenter.y;}
        else{x1=fromCenter.x;y1=dy>=0?from.y+from.h:from.y;x2=toCenter.x;y2=dy>=0?to.y:to.y+to.h;}
      }
      const horizontal=Math.abs(x2-x1)>=Math.abs(y2-y1);
      const curveReach=horizontal?Math.max(48,Math.min(150,Math.abs(x2-x1)*.42)):Math.max(48,Math.min(150,Math.abs(y2-y1)*.42));
      const curve=horizontal?`M${x1},${y1} C${x1+Math.sign(x2-x1)*curveReach},${y1} ${x2-Math.sign(x2-x1)*curveReach},${y2} ${x2},${y2}`:`M${x1},${y1} C${x1},${y1+Math.sign(y2-y1)*curveReach} ${x2},${y2-Math.sign(y2-y1)*curveReach} ${x2},${y2}`;
      const elbow=horizontal?`M${x1},${y1} L${(x1+x2)/2},${y1} L${(x1+x2)/2},${y2} L${x2},${y2}`:`M${x1},${y1} L${x1},${(y1+y2)/2} L${x2},${(y1+y2)/2} L${x2},${y2}`;
      let d = line.type === "straight" ? `M${x1},${y1} L${x2},${y2}` : line.type === "elbow" ? elbow : curve;
      if(line.mind){
        const root=mindRootNode(from),structure=root?.mindStructure||"mindmap",depth=mindNodeDepth(to);
        if(structure==="org"){
          const railY=depth===1?root.y+root.h+52:(y1+y2)/2;
          d=`M${x1},${y1} L${x1},${railY} L${x2},${railY} L${x2},${y2}`;
        } else if(structure==="tree"){
          const railX=depth===1?root.x+root.w/2:(x1+x2)/2;
          d=depth===1?`M${x1},${y1} L${railX},${y2} L${x2},${y2}`:`M${x1},${y1} L${railX},${y1} L${railX},${y2} L${x2},${y2}`;
        } else if(structure==="timeline"&&depth===1){
          const axisY=root.y+root.h/2,targetEdge=y2<axisY?to.y+to.h:to.y;
          d=`M${root.x+root.w},${axisY} L${to.x+to.w/2},${axisY} L${to.x+to.w/2},${targetEdge}`;
        } else if(structure==="fishbone"&&depth===1){
          const axisY=root.y+root.h/2,joinX=to.x-32,targetY=to.y>axisY?to.y:to.y+to.h;
          d=`M${root.x+root.w},${axisY} L${joinX},${axisY} L${to.x},${targetY}`;
        }
      }
      const dash = line.dash === "dash" ? "10 8" : line.dash === "dot" ? "2 8" : "";
      return `<path class="canvas-connection-line ${C.selectedConnection === line.id ? "selected" : ""}" data-connection-id="${line.id}" d="${d}" stroke="${line.color || "#0caa7d"}" stroke-width="${Number(line.width || 3)}" fill="none" stroke-linecap="${line.endpoint === "round" ? "round" : "butt"}" stroke-linejoin="round" stroke-dasharray="${dash}" ${line.arrow ? 'marker-end="url(#canvasArrow)"' : ""}></path>`;
    }).join("");
    svg.querySelectorAll("[data-connection-id]").forEach((path) => path.onpointerdown = (event) => {
      event.stopPropagation();
      C.selected.clear();
      C.selectedConnection = path.dataset.connectionId;
      renderElements(); renderConnections(); renderInspector();
    });
  }

  function renderInspector() {
    const root = document.getElementById("canvasInspector"); if (!root) return;
    const connection = C.draft.connections.find((entry) => entry.id === C.selectedConnection);
    if (connection) {
      root.innerHTML = `<div class="canvas-inspector-head"><b>属性</b><span>连线</span></div><div class="canvas-inspector-fields"><section><h4>连线样式</h4>${connectionIconChoice("路径","type",connection.type||"curve",[["curve","贝塞尔曲线",'<path d="M3 14C8 14 8 4 21 4"/>'],["elbow","折线路径",'<path d="M3 14h9V4h9"/>'],["straight","直线路径",'<path d="M3 14L21 4"/>']])}${connectionIconChoice("线段","dash",connection.dash||"solid",[["solid","实线",'<path d="M3 9h18"/>'],["dash","短划线",'<path d="M3 9h18" stroke-dasharray="5 3"/>'],["dot","圆点线",'<path d="M3 9h18" stroke-dasharray="1 4" stroke-linecap="round"/>']])}${switchField("显示箭头", "arrow", connection.arrow !== false)}${colorField("线条颜色", "color", connection.color || "#0caa7d")}${rangeField("线条粗细", "width", connection.width || 3, 1, 10, 1)}</section></div><button class="canvas-danger" data-delete-connection>删除连线</button>`;
      root.querySelectorAll("[data-prop]").forEach((input) => {
        input.onchange = () => setConnectionProp(input, true);
        if (["color","range"].includes(input.type)) input.oninput = () => setConnectionProp(input, false);
      });
      root.querySelectorAll('input[type="color"][data-prop]').forEach(bindCanvasColorPicker);
      root.querySelectorAll("[data-connection-choice]").forEach(button=>button.onclick=()=>{snapshot();connection[button.dataset.connectionChoice]=button.dataset.value;markDirty();renderConnections();renderInspector();});
      root.querySelector("[data-delete-connection]").onclick = () => { snapshot(); C.draft.connections = C.draft.connections.filter((entry) => entry.id !== connection.id); C.selectedConnection = ""; markDirty(); renderConnections(); renderInspector(); };
      return;
    }
    const item = C.draft.elements.find((entry) => C.selected.has(entry.id));
    if (!item) { root.innerHTML = `<div class="canvas-inspector-empty"><div class="canvas-inspector-title">${canvasIcon("sliders")}<b>属性</b></div><p>选择一个元素后，可在这里设置文字、颜色和样式。</p><hr><div class="canvas-inspector-title canvas-quick-title">${canvasIcon("rocket")}<strong>快速开始</strong></div><small>从左侧按住元素并拖入画布即可插入；选中元素后点击右侧加号可创建连线。</small></div>`; return; }
    root.innerHTML = `<div class="canvas-inspector-head"><b>属性</b><span>${item.type === "shape" ? shapeDisplayName(item.shape) : typeName(item.type)}</span></div>
      <div class="canvas-inspector-fields">${inspectorFields(item)}</div>
      <button class="canvas-danger" data-delete-selected>删除元素</button>`;
    root.querySelectorAll("[data-prop]").forEach((input) => {
      if (input.tagName === "SELECT") input.value = String(item[input.dataset.prop] ?? input.value);
      input.onchange = () => setInspectorProp(input, true);
      if (["color", "range"].includes(input.type)) input.oninput = () => setInspectorProp(input, false);
    });
    root.querySelectorAll('input[type="color"][data-prop]').forEach(bindCanvasColorPicker);
    root.querySelectorAll("[data-toggle]").forEach((button) => button.onclick = () => {
      const prop = button.dataset.toggle; const next = !item[prop];
      if (prop === "bold") return updateSelectedMany({ bold: next, fontWeight: next ? 700 : 400 });
      updateSelected(prop, next);
    });
    root.querySelectorAll("[data-text-align]").forEach((button) => button.onclick = () => updateSelected("align", button.dataset.textAlign));
    root.querySelectorAll("[data-vertical-align]").forEach((button) => button.onclick = () => updateSelected("verticalAlign", button.dataset.verticalAlign));
    root.querySelectorAll("[data-font-step]").forEach((button) => button.onclick = () => updateSelected("size", clamp(Number(item.size || 18) + Number(button.dataset.fontStep), 8, 160)));
    root.querySelectorAll("[data-property-choice]").forEach((button) => button.onclick = (event) => {
      event.preventDefault();
      const prop = button.dataset.propertyChoice;
      const raw = button.dataset.value;
      const value = ["textOpacity", "bgOpacity", "fontWeight"].includes(prop) ? Number(raw) : raw;
      if (item.type === "mind" && (prop === "mindTheme" || prop === "mindStructure" || prop === "mindDirection" || prop.startsWith("mindBranch"))) {
        snapshot();
        if(prop==="mindTheme"){applyMindTheme(item,value);markDirty();renderEditor();return;}
        if(prop==="mindStructure"){applyMindStructure(item,value);markDirty();renderEditor();return;}
        item[prop]=value;
        if(prop==="mindDirection"){
          const children=C.draft.elements.filter(node=>node.type==="mind"&&node.mindParentId===item.id);
          children.forEach((child,index)=>child.mindDirection=value==="both"?(index%2?"left":"right"):value);
          layoutMindChildren(item);
        }
        C.draft.connections.filter(line=>line.mind && line.from===item.id).forEach(line=>{
          if(prop==="mindBranchType") line.type=value;
          if(prop==="mindBranchDash") line.dash=value;
          if(prop==="mindBranchEndpoint"){line.endpoint=value;line.arrow=value==="arrow";}
        });
        markDirty(); renderEditor(); return;
      }
      updateSelected(prop, value);
    });
    root.querySelectorAll("[data-card-style]").forEach((button) => button.onclick = () => applyCardStyle(button.dataset.cardStyle));
    root.querySelectorAll("[data-text-preset]").forEach((button) => button.onclick = () => applyTextPreset(button.dataset.textPreset));
    root.querySelectorAll("[data-anchor]").forEach((button) => button.onclick = () => updateSelected("anchor", button.dataset.anchor));
    root.querySelectorAll("[data-boolean-operation]").forEach(button=>button.addEventListener("click",()=>performBooleanOperation(button.dataset.booleanOperation)));
    root.querySelector("[data-replace-image]")?.addEventListener("click", () => { C.replaceImageId = item.id; document.getElementById("canvasImageInput").click(); });
    root.querySelector("[data-open-link]")?.addEventListener("click", () => { const url = normalizeUrl(item.url); if (url) window.open(url, "_blank", "noopener"); });
    root.querySelector("[data-delete-selected]").onclick = deleteSelected;
  }

  function textFields(item, options = {}) {
    return `${options.label !== false ? textField(options.title || "文字", "text", item.text || "") : ""}
      <div class="canvas-compact-grid">${numberField("字号", "size", item.size || 18, 10, 96)}${selectField("字体", "font", effectiveCanvasFont(item.font), C.systemFonts.map(font => [font,font]))}</div>
      <div class="canvas-format-row"><button data-toggle="bold" class="${item.bold ? "active" : ""}" title="粗体"><b>B</b></button><button data-toggle="italic" class="${item.italic ? "active" : ""}" title="斜体"><i>I</i></button><button data-toggle="underline" class="${item.underline ? "active" : ""}" title="下划线"><u>U</u></button><button data-toggle="strike" class="${item.strike ? "active" : ""}" title="删除线"><s>S</s></button></div>
      ${selectField("对齐", "align", item.align || "left", [["left","左对齐"],["center","居中"],["right","右对齐"]])}${colorField("文字颜色", "color", item.color || "#07382d")}`;
  }

  function inspectorFields(item) {
    if (item.type === "text") return textInspector(item);
    if (item.type === "note") return cardInspector(item);
    if (item.type === "shape") return shapeInspector(item);
    if (item.type === "mind") return mindInspector(item);
    if (item.type === "image") return `<section><h4>图片</h4><button class="canvas-secondary" data-replace-image>替换图片</button>${mindIconChoice("适应方式","fit",item.fit||"contain",[["contain","完整显示",'<rect x="3" y="3" width="18" height="12"/><rect x="7" y="5" width="10" height="8"/>'],["cover","铺满裁切",'<rect x="3" y="3" width="18" height="12"/><path d="M3 7h18M8 3v12"/>'],["fill","拉伸填充",'<rect x="3" y="3" width="18" height="12"/><path d="m6 6-3-3m15 3 3-3M6 12l-3 3m15-3 3 3"/>']])}${rangeField("圆角", "radius", item.radius || 0, 0, 80, 1)}${rangeField("透明度", "opacity", item.opacity ?? 100, 10, 100, 1)}</section>`;
    if (item.type === "link") return `<section class="reference-link-properties"><h4>网页卡片</h4>${textField("标题", "text", item.text || "网页")}${textField("网址", "url", item.url || "https://", "url")}<button class="canvas-secondary" data-open-link>↗ 打开网页</button>${colorField("卡片颜色", "fill", item.fill || "#ffffff")}${rangeField("圆角", "radius", item.radius ?? 14, 0, 40, 1)}</section>`;
    if (item.type === "file") return `<section><h4>文件</h4>${textField("显示名称", "name", item.name || item.text || "文件")}${textField("补充信息", "meta", item.meta || "本地文件")}${colorField("卡片颜色", "fill", item.fill || "#ffffff")}${rangeField("圆角", "radius", item.radius ?? 14, 0, 40, 1)}</section>`;
    if (item.type === "file-review") return `<section><h4>文件审阅</h4><p class="review-inspector-name">${esc(item.name||"文件")}</p><small>可直接在画布窗口中翻页、滚动、缩放或播放；拖动选中框可调整窗口大小。</small></section>`;
    if (item.type === "container") return `<section><h4>容器</h4>${textField("名称", "text", item.text || "容器")}${switchField("显示描边", "strokeEnabled", item.strokeEnabled !== false)}${colorField("描边颜色", "stroke", item.stroke || "#92d9c1")}${rangeField("描边粗细", "strokeWidth", item.strokeWidth || 2, 1, 8, 1)}${colorField("背景颜色", "fill", item.fill || "#e1f8f0")}${rangeField("圆角", "radius", item.radius ?? 14, 0, 60, 1)}${rangeField("透明度", "opacity", item.opacity ?? 100, 10, 100, 1)}</section>`;
    if (["rect", "ellipse"].includes(item.type)) return `<section><h4>${typeName(item.type)}样式</h4>${colorField("背景颜色", "fill", item.fill || "#ffffff")}${rangeField("圆角", "radius", item.radius ?? (item.type === "ellipse" ? 60 : 14), 0, 100, 1)}${rangeField("透明度", "opacity", item.opacity ?? 100, 10, 100, 1)}</section><section><h4>文字</h4>${textFields(item)}</section>`;
    return `<section><h4>文字</h4>${textFields(item)}</section>`;
  }

  function mindIconChoice(label, prop, value, choices) {
    return `<div class="mind-icon-row"><span>${label}</span><div class="mind-icon-choice">${choices.map(([key,title,drawing])=>`<button type="button" data-property-choice="${prop}" data-value="${key}" class="${String(value)===key?"active":""}" title="${title}" aria-label="${title}"><svg viewBox="0 0 24 18" aria-hidden="true">${drawing}</svg></button>`).join("")}</div></div>`;
  }

  function connectionIconChoice(label,prop,value,choices){
    return `<div class="connection-icon-row"><span>${label}</span><div>${choices.map(([key,title,drawing])=>`<button type="button" data-connection-choice="${prop}" data-value="${key}" class="${value===key?"active":""}" title="${title}" aria-label="${title}"><svg viewBox="0 0 24 18">${drawing}</svg></button>`).join("")}</div></div>`;
  }

  function mindStructureChoice(item) {
    const root=mindRootNode(item),stored=root.mindStructure||"mindmap",value=["mindmap","org","tree","timeline","fishbone"].includes(stored)?stored:"mindmap";
    const choices=[
      ["mindmap","思维导图",'<path d="M3 5h3c3 0 2 4 6 4s3-4 6-4h3M3 13h3c3 0 2-4 6-4s3 4 6 4h3M6 3v4M6 11v4M18 3v4M18 11v4"/>'],
      ["org","组织架构图",'<path d="M9 1.5h6v4H9zM12 5.5v4M4 9.5h16M4 9.5v3M12 9.5v3M20 9.5v3M1 12.5h6v4H1zM9 12.5h6v4H9zM17 12.5h6v4h-6z"/>'],
      ["tree","树形图",'<path d="M8 2h8v4H8zM12 6v10M12 9h7M12 14h7M19 7v4M19 12v4"/>'],
      ["timeline","时间轴",'<rect x="2" y="6" width="6" height="6" rx="1"/><path d="M8 9h14M12 6v6M16 6v6M20 6v6"/>'],
      ["fishbone","鱼骨图",'<rect x="2" y="6" width="6" height="6" rx="1"/><path d="M8 9h14M12 9l3-5M15 9l3 5M18 9l3-5"/>']
    ];
    const current=choices.find(([key])=>key===value)||choices[0];
    return `<div class="mind-structure-row"><span>结构类型</span><details class="mind-structure-menu"><summary title="${current[1]}" aria-label="选择结构类型"><svg viewBox="0 0 24 18">${current[2]}</svg><i></i></summary><div>${choices.map(([key,title,drawing])=>`<button type="button" data-property-choice="mindStructure" data-value="${key}" class="${value===key?"active":""}"><b>${value===key?"✓":""}</b><svg viewBox="0 0 24 18">${drawing}</svg><span>${title}</span></button>`).join("")}</div></details></div>`;
  }

  function mindThemeChoice(item){
    const root=mindRootNode(item),value=MIND_THEMES[root.mindTheme]?root.mindTheme:"rainbow";
    const current=MIND_THEMES[value],swatches=theme=>[theme.root,...theme.colors.slice(0,5)].map(color=>`<b style="background:${color}"></b>`).join("");
    return `<details class="mind-theme-menu"><summary><i>${swatches(current)}</i><span>${current.name}</span><em></em></summary><div class="mind-theme-grid">${Object.entries(MIND_THEMES).map(([key,theme])=>`<button type="button" data-property-choice="mindTheme" data-value="${key}" class="${value===key?"active":""}" title="${theme.name}"><span>${theme.name}</span><i>${swatches(theme)}</i></button>`).join("")}</div></details>`;
  }

  function mindInspector(item) {
    const fontOptions = C.systemFonts.map(font => [font,font]);
    const currentFont = effectiveCanvasFont(item.font);
    const menu=(prop,value,options,label)=>`<details class="canvas-property-menu mind-compact-menu"><summary aria-label="${label}"><span>${esc(options.find(([key])=>String(key)===String(value))?.[1]||value)}</span><i aria-hidden="true"></i></summary><div>${options.map(([key,name])=>`<button type="button" data-property-choice="${prop}" data-value="${esc(key)}" class="${String(key)===String(value)?"active":""}" ${prop==="font"?`style="font-family:${esc(key)}"`:""}>${esc(name)}</button>`).join("")}</div></details>`;
    const fontMenu = `<div class="mind-font-row"><span>字体</span>${menu("font",currentFont,fontOptions,"选择字体")}</div>`;
    const weightOptions=[[300,"细体"],[400,"常规"],[500,"中等"],[600,"半粗"],[700,"粗体"]];
    const topicType = mindNodeDepth(item) === 0 ? "中心主题" : mindNodeDepth(item) === 1 ? "分支主题" : "子主题";
    return `<div class="mind-property-panel">
      <details class="canvas-shape-panel mind-theme-panel" open><summary>整体风格</summary><div class="canvas-shape-panel-body">${mindThemeChoice(item)}</div></details>
      <details class="canvas-shape-panel" open><summary>节点</summary><div class="canvas-shape-panel-body">
        <div class="mind-derived-row"><span>主题类型</span><b>${topicType}</b></div>
        ${mindIconChoice("形状","mindShape",item.mindShape||"rounded",[["rounded","圆角矩形",'<rect x="3" y="3" width="18" height="12" rx="4"/>'],["rect","直角矩形",'<rect x="3" y="3" width="18" height="12"/>'],["capsule","胶囊",'<rect x="2" y="4" width="20" height="10" rx="5"/>'],["underline","下划线",'<path d="M4 13.5h16M8 4h8M12 4v7"/>']])}
        ${colorHexField("填充颜色", "fill", item.fill || "#32cf9a")}
        ${rangeNumberField("节点宽度", "w", item.w || 200, 80, 600, 10, "px")}
        ${(item.mindShape || "rounded") === "rounded" ? rangeNumberField("圆角", "radius", item.radius ?? 14, 0, 60, 1) : ""}
      </div></details>
      <details class="canvas-shape-panel" open><summary>边框</summary><div class="canvas-shape-panel-body">
        ${mindIconChoice("边框样式","mindBorderStyle",item.mindBorderStyle||"solid",[["none","无边框",'<path d="M4 14L20 4M5 4h14v10H5z"/>'],["solid","实线",'<rect x="3" y="3" width="18" height="12"/>'],["dashed","虚线",'<rect x="3" y="3" width="18" height="12" stroke-dasharray="4 3"/>'],["dotted","圆点线",'<rect x="3" y="3" width="18" height="12" stroke-dasharray="1 3" stroke-linecap="round"/>']])}
        ${colorHexField("边框颜色", "stroke", item.stroke || "#0caa7d")}
        ${rangeNumberField("边框粗细", "strokeWidth", item.strokeWidth || 1.5, .5, 8, .5)}
      </div></details>
      <details class="canvas-shape-panel" open><summary>文本</summary><div class="canvas-shape-panel-body mind-text-panel">
        ${fontMenu}
        <div class="mind-size-weight-row"><label><span>字号</span><input data-prop="size" type="number" min="10" max="96" value="${Number(item.size||18)}"></label><div><span>字重</span>${menu("fontWeight",Number(item.fontWeight||400),weightOptions,"选择字重")}</div></div>
        <div class="mind-format-row"><span>格式</span><div class="canvas-format-row mind-format-buttons"><button data-toggle="bold" class="${item.bold ? "active" : ""}" title="粗体"><b>B</b></button><button data-toggle="italic" class="${item.italic ? "active" : ""}" title="斜体"><i>I</i></button><button data-toggle="underline" class="${item.underline ? "active" : ""}" title="下划线"><u>U</u></button><button data-toggle="strike" class="${item.strike ? "active" : ""}" title="删除线"><s>S</s></button></div></div>
        ${mindIconChoice("对齐","align",item.align||"center",[["left","左对齐",'<path d="M4 4h15M4 9h10M4 14h13"/>'],["center","居中",'<path d="M4 4h16M7 9h10M5 14h14"/>'],["right","右对齐",'<path d="M5 4h15M10 9h10M7 14h13"/>']])}
        ${colorHexField("文字颜色", "color", item.color || "#07382d")}
      </div></details>
      <details class="canvas-shape-panel" open><summary>结构</summary><div class="canvas-shape-panel-body">
        ${mindStructureChoice(item)}
        ${mindIconChoice("展开方向","mindDirection",item.mindDirection||"right",[["right","下级位于右侧",'<path d="M4 9h15m-5-4 5 4-5 4"/>'],["left","下级位于左侧",'<path d="M20 9H5m5-4L5 9l5 4"/>'],["both","下级位于两侧",'<path d="M4 9h16M8 5 4 9l4 4m8-8 4 4-4 4"/>'],["down","下级位于下方",'<path d="M12 2v13m-4-4 4 4 4-4"/>']])}
      </div></details>
      <details class="canvas-shape-panel" open><summary>分支</summary><div class="canvas-shape-panel-body">
        ${mindIconChoice("路径","mindBranchType",item.mindBranchType||"curve",[["curve","曲线",'<path d="M3 14C8 14 8 4 21 4"/>'],["elbow","折线",'<path d="M3 14h9V4h9"/>'],["straight","直线",'<path d="M3 14L21 4"/>']])}
        ${mindIconChoice("线条","mindBranchDash",item.mindBranchDash||"solid",[["solid","实线",'<path d="M3 9h18"/>'],["dash","短划线",'<path d="M3 9h18" stroke-dasharray="5 3"/>'],["dot","圆点线",'<path d="M3 9h18" stroke-dasharray="1 4" stroke-linecap="round"/>']])}
        ${mindIconChoice("终点","mindBranchEndpoint",item.mindBranchEndpoint||"round",[["none","无端点",'<path d="M3 9h17"/>'],["round","圆形端点",'<path d="M3 9h14"/><circle cx="19" cy="9" r="2"/>'],["arrow","箭头端点",'<path d="M3 9h17m-5-5l5 5-5 5"/>']])}
        ${rangeNumberField("分支粗细", "mindBranchWidth", item.mindBranchWidth || 2, 1, 10, .5)}
        ${colorHexField("分支颜色", "mindBranchColor", item.mindBranchColor || "#0caa7d")}
      </div></details>
    </div>`;
  }

  function shapeInspector(item) {
    const shape = item.shape || "square";
    const rectangle = RECTANGLE_SHAPES.includes(shape);
    const polygon = POLYGON_SHAPES.includes(shape);
    const star = STAR_SHAPES.includes(shape);
    const openShape = OPEN_SHAPES.includes(shape);
    const fallbackRadius = Number(item.radius || (shape === "rounded" ? 18 : shape === "soft-rounded" ? 28 : 0));
    const cornerInput = (label, prop) => `<label><span>${label}</span><input data-prop="${prop}" type="number" min="0" max="160" step="1" value="${Math.max(0,Number(item[prop] ?? fallbackRadius))}"></label>`;
    const corners = rectangle ? `<div class="shape-corner-editor"><b>四角圆角</b><div>${cornerInput("左上","radiusTL")}${cornerInput("右上","radiusTR")}${cornerInput("左下","radiusBL")}${cornerInput("右下","radiusBR")}</div></div>` : "";
    const polygonControls = polygon ? `${rangeNumberField("边数量", "polygonSides", item.polygonSides || ({triangle:3,diamond:4,parallelogram:4,pentagon:5,trapezoid:4,hexagon:6}[shape] || 5), 3, 16, 1)}${rangeNumberField("顶点圆角", "polygonRadius", item.polygonRadius || 0, 0, 40, 1)}` : "";
    const starControls = star ? `${rangeNumberField("角数量", "starPoints", item.starPoints || 5, 3, 16, 1)}${rangeNumberField("内径比例", "starInnerRadius", item.starInnerRadius || 46, 10, 90, 1, "%")}${rangeNumberField("顶点圆角", "polygonRadius", item.polygonRadius || 0, 0, 40, 1)}` : "";
    const shapeCount = [...C.selected].map(id=>C.draft.elements.find(entry=>entry.id===id)).filter(entry=>entry?.type==="shape").length;
    const booleanIcon=(operation,label,path)=>`<button type="button" data-boolean-operation="${operation}" title="${label}" aria-label="${label}"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="${path}"></path></svg><span>${label}</span></button>`;
    const booleanPanel = shapeCount >= 2 ? `<div class="shape-boolean-panel"><b>布尔运算</b><div>${booleanIcon("union","联合","M4 4h13v7h11v9H11v-7H4Z")}${booleanIcon("subtract","相减","M4 4h17v5h-8v11H4ZM21 9h7v11H13v-4h8Z")}${booleanIcon("intersect","相交","M4 4h17v5h7v11H13v-7H4Zm9 5v4h8V9Z")}${booleanIcon("exclude","排除","M4 4h17v5h7v11H13v-7H4Zm9 5v4h8V9Z")}</div></div>` : "";
    const category = rectangle ? "矩形" : polygon ? "多边形" : star ? "星形" : "基础图形";
    return `<details class="canvas-shape-panel" open><summary>${category} · ${shapeDisplayName(shape)}</summary><div class="canvas-shape-panel-body">
      <div class="shape-property-row shape-switch-row">${switchField("显示描边", "strokeEnabled", item.strokeEnabled !== false)}</div>
      ${colorHexField(openShape ? "线条颜色" : "描边颜色", "stroke", item.stroke || "#07382d")}
      ${rangeNumberField(openShape ? "线条粗细" : "描边粗细", "strokeWidth", item.strokeWidth || 1.5, .5, 8, .5)}
      ${corners}
      ${polygonControls}
      ${starControls}
      ${openShape ? "" : colorHexField("背景颜色", "fill", item.fill || "#dff8ee")}
      ${rangeNumberField("内容透明度", "opacity", item.opacity ?? 100, 0, 100, 1, "%")}
    </div></details>${booleanPanel}`;
  }

  function textInspector(item) {
    const alignButton = (value, title) => `<button class="canvas-text-align ${item.align === value ? "active" : ""}" data-text-align="${value}" title="${title}" aria-label="${title}"><b class="align-icon align-${value}"><i></i><i></i><i></i></b></button>`;
    const verticalButton = (value, title) => `<button class="canvas-text-align canvas-vertical-align ${String(item.verticalAlign || "top") === value ? "active" : ""}" data-vertical-align="${value}" title="${title}" aria-label="${title}"><b class="vertical-icon vertical-${value}"><i></i><i></i></b></button>`;
    const preset = (value, label) => `<button class="canvas-text-preset" data-text-preset="${value}">${label}</button>`;
    const currentFont = effectiveCanvasFont(item.font);
    const fontOptions = C.systemFonts.map((font) => [font, font]);
    const weightOptions = [[300,"细体"],[400,"常规"],[500,"中等"],[600,"半粗"],[700,"粗体"]];
    const textColor = toHex(item.color || "#07382d");
    const colorButton = (prop, value, label) => `<label class="canvas-color-picker-button" title="${label}" aria-label="${label}"><input data-prop="${prop}" type="color" value="${value}"><i style="--picker-color:${value}"></i><b aria-hidden="true"></b></label>`;
    const propertyMenu = (prop, value, choices, label) => {
      const current = choices.find(([key]) => String(key) === String(value)) || choices[0];
      return `<details class="canvas-property-menu"><summary aria-label="${label}"><span style="${prop === "font" ? `font-family:${esc(current[0])}` : ""}">${esc(current[1])}</span><i aria-hidden="true"></i></summary><div>${choices.map(([key,name]) => `<button type="button" data-property-choice="${prop}" data-value="${esc(key)}" class="${String(key) === String(value) ? "active" : ""}">${esc(name)}</button>`).join("")}</div></details>`;
    };
    return `<section class="canvas-text-properties reference-text-properties">
      <div class="canvas-text-row canvas-font-only-row"><span>字体</span>${propertyMenu("font", currentFont, fontOptions, "选择字体")}</div>
      <div class="canvas-text-row canvas-size-weight-row"><span>字号</span><div class="canvas-font-stepper"><button type="button" data-font-step="-1" aria-label="减小字号">−</button><input class="canvas-font-size" data-prop="size" type="number" min="8" max="160" value="${Number(item.size || 18)}"><button type="button" data-font-step="1" aria-label="增大字号">＋</button></div><span>字重</span>${propertyMenu("fontWeight", Number(item.fontWeight || (item.bold ? 700 : 400)), weightOptions, "选择字重")}</div>
      <div class="canvas-text-row canvas-format-only-row"><span>格式</span><div class="canvas-format-row"><button data-toggle="bold" class="${item.bold ? "active" : ""}" title="粗体"><b>B</b></button><button data-toggle="italic" class="${item.italic ? "active" : ""}" title="斜体"><i>I</i></button><button data-toggle="underline" class="${item.underline ? "active" : ""}" title="下划线"><u>U</u></button><button data-toggle="strike" class="${item.strike ? "active" : ""}" title="删除线"><s>S</s></button></div></div>
      <div class="canvas-text-row canvas-color-opacity"><span>文字颜色</span>${colorButton("color", textColor, "选择文字颜色")}<input class="canvas-color-hex" data-prop="color" type="text" value="${textColor.slice(1).toUpperCase()}">${propertyMenu("textOpacity", Number(item.textOpacity ?? 100), [[25,"25%"],[50,"50%"],[75,"75%"],[100,"100%"]], "文字透明度")}</div>
      <div class="canvas-text-row canvas-align-row"><span>对齐</span><div class="canvas-align-groups"><div class="canvas-align-group">${alignButton("left","左对齐")}${alignButton("center","居中")}${alignButton("right","右对齐")}</div><div class="canvas-align-group">${verticalButton("top","上对齐")}${verticalButton("middle","垂直居中")}${verticalButton("bottom","下对齐")}</div></div></div>
    </section>`;
  }

  function cardInspector(item) {
    const currentFont = effectiveCanvasFont(item.font);
    const fonts = C.systemFonts;
    const fontMenu = `<details class="canvas-property-menu card-font-menu"><summary aria-label="选择字体"><span style="font-family:${esc(currentFont)}">${esc(currentFont)}</span><i aria-hidden="true"></i></summary><div>${fonts.map(font => `<button type="button" data-property-choice="font" data-value="${esc(font)}" class="${font === currentFont ? "active" : ""}" style="font-family:${esc(font)}">${esc(font)}</button>`).join("")}</div></details>`;
    const templates = [["minimal","极简"],["fresh","清新"],["tech","科技"],["traditional","传统"],["archive","档案"],["gradient","渐变"]];
    return `<section class="reference-card-properties">
      <div class="card-template-block"><h4>卡片形式</h4><div class="card-template-grid">${templates.map(([value,label]) => `<button type="button" data-card-style="${value}" class="${(item.cardStyle || "minimal") === value ? "active" : ""}"><i class="card-template-preview preview-${value}"><b></b><em></em><u></u></i><span>${label}</span></button>`).join("")}</div></div>
      <div class="card-property-block"><h4>卡片样式</h4>
        <div class="card-property-row"><span>字体类型</span>${fontMenu}</div>
        <div class="card-property-row card-size-row"><span>文字大小</span><div class="card-size-stepper"><button type="button" data-font-step="-1" aria-label="减小字号">−</button><input data-prop="size" type="number" min="12" max="64" value="${Number(item.size || 28)}"><button type="button" data-font-step="1" aria-label="增大字号">＋</button></div></div>
        <div class="card-property-row card-title-format-row"><span>主标题格式</span><div class="card-title-format"><button type="button" class="${item.titleBold || item.bold ? "active" : ""}" data-toggle="titleBold" title="加粗"><b>B</b></button><button type="button" class="${item.titleItalic ? "active" : ""}" data-toggle="titleItalic" title="斜体"><i>I</i></button><button type="button" class="${item.titleUnderline ? "active" : ""}" data-toggle="titleUnderline" title="下划线"><u>U</u></button><button type="button" class="${item.titleStrike ? "active" : ""}" data-toggle="titleStrike" title="删除线"><s>S</s></button></div></div>
        ${colorHexField("主标题颜色", "titleColor", item.titleColor || item.color || "#14231f")}
        ${colorHexField("内容颜色", "subtitleColor", item.subtitleColor || "#51645e")}
        ${colorHexField("背景颜色", "fill", item.fill || "#fffdf8")}
        ${colorHexField("边框颜色", "cardBorderColor", item.cardBorderColor || "#dfe8e4")}
        ${rangeNumberField("边框粗细", "cardBorderWidth", item.cardBorderWidth ?? 1, 0, 12, .5)}
        ${rangeNumberField("圆角程度", "radius", item.radius ?? 0, 0, 60, 1)}
      </div>
    </section>`;
  }

  function applyCardStyle(style) {
    const values = {
      traditional: { cardStyle:"traditional", fill:"#fbfaf6", titleColor:"#18201d", subtitleColor:"#59635f", radius:2, font:"思源宋体 CN" },
      fresh: { cardStyle:"fresh", fill:"#edf8f3", titleColor:"#125d49", subtitleColor:"#557069", radius:18, font:"思源黑体 CN" },
      tech: { cardStyle:"tech", fill:"#132a2c", titleColor:"#d9fff1", subtitleColor:"#a9c9c0", radius:12, font:"思源黑体 CN" },
      minimal: { cardStyle:"minimal", fill:"#ffffff", titleColor:"#1e2925", subtitleColor:"#6c7874", radius:10, font:"思源黑体 CN" },
      archive: { cardStyle:"archive", fill:"#f5f0e8", titleColor:"#403a32", subtitleColor:"#746d63", radius:5, font:"霞鹜文楷" },
      gradient: { cardStyle:"gradient", fill:"#e9f2ef", titleColor:"#253c36", subtitleColor:"#60746e", radius:20, font:"思源黑体 CN" }
    }[style];
    if (values) updateSelectedMany(values);
  }

  function textLayoutPanel(item) {
    const anchors = ["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right"];
    return `<details class="canvas-text-layout-panel" open><summary>位置、尺寸与角度</summary><div class="text-layout-body">
      <div class="text-layout-line"><span>位置</span>${numberField("X", "x", item.x, -5000, 5000)}${numberField("Y", "y", item.y, -5000, 5000)}</div>
      <div class="text-layout-line"><span>尺寸</span>${numberField("宽", "w", item.w, 60, 3000)}${numberField("高", "h", item.h, 38, 3000)}</div>
      <div class="text-layout-line rotation-anchor"><span>旋转</span>${numberField("°", "rotation", Number(item.rotation || 0), -360, 360)}<b>锚点</b><div class="anchor-grid">${anchors.map(name=>`<button data-anchor="${name}" class="${(item.anchor||"center")===name?"active":""}" aria-label="锚点 ${name}"></button>`).join("")}</div></div>
      <div class="text-layout-line constraint-line"><span>约束</span>${selectField("", "constraint", item.constraint || "top-left", [["top-left","左上"],["top","顶部"],["center","居中"],["stretch","拉伸"]])}${switchField("锁定比例", "lockAspect", item.lockAspect !== false)}</div>
    </div></details>`;
  }

  function applyTextPreset(name) {
    const preset = ({ title:{size:32,fontWeight:700}, subtitle:{size:24,fontWeight:600}, body:{size:18,fontWeight:400}, caption:{size:14,fontWeight:400} })[name];
    if (!preset) return;
    snapshot(); C.draft.elements.filter((entry) => C.selected.has(entry.id)).forEach((entry) => Object.assign(entry, preset, { bold: preset.fontWeight >= 700 })); markDirty(); renderEditor();
  }

  function textField(label, prop, value, type = "text") { return `<label>${label}<input data-prop="${prop}" type="${type}" value="${esc(value)}"></label>`; }
  function textareaField(label, prop, value) { return `<label>${label}<textarea data-prop="${prop}" rows="3">${esc(value)}</textarea></label>`; }
  function numberField(label, prop, value, min, max) { return `<label>${label}<input data-prop="${prop}" type="number" min="${min}" max="${max}" value="${roundTwo(value)}"></label>`; }
  function colorPickerButton(prop, value, label) { const color = toHex(value); return `<label class="canvas-color-picker-button canvas-field-color-button" title="${esc(label)}" aria-label="${esc(label)}"><input data-prop="${prop}" type="color" value="${color}"><i style="--picker-color:${color}"></i></label>`; }
  function colorField(label, prop, value) { return `<div class="canvas-basic-color-field"><span>${label}</span>${colorPickerButton(prop, value, `选择${label}`)}</div>`; }
  function rangeField(label, prop, value, min, max, step) { const progress = clamp((Number(value) - min) / (max - min) * 100, 0, 100); return `<label class="canvas-range-label"><span>${label}<output>${Number(value)}</output></span><input data-prop="${prop}" type="range" min="${min}" max="${max}" step="${step}" value="${Number(value)}" style="--range-progress:${progress}%"></label>`; }
  function colorHexField(label, prop, value, hint = "") { return `<div class="shape-property-row shape-color-row"><span>${label}</span><div>${colorPickerButton(prop, value, `选择${label}`)}<input data-prop="${prop}" type="text" value="${toHex(value).slice(1).toUpperCase()}" ${hint ? `placeholder="${hint}"` : ""}></div></div>`; }
  function rangeNumberField(label, prop, value, min, max, step, suffix = "") { const rounded=roundTwo(value),progress=clamp((rounded-min)/(max-min)*100,0,100); return `<div class="shape-property-row shape-range-row"><div><span>${label}</span><input data-prop="${prop}" type="number" min="${min}" max="${max}" step="${step}" value="${rounded}"><em>${suffix}</em></div><input data-prop="${prop}" type="range" min="${min}" max="${max}" step="${step}" value="${rounded}" style="--range-progress:${progress}%"></div>`; }
  function selectField(label, prop, value, options) { return `<label>${label}<select data-prop="${prop}">${options.map(([key,name]) => `<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label>`; }
  function switchField(label, prop, checked) { return `<label class="canvas-switch-label"><span>${label}</span><input data-prop="${prop}" type="checkbox" ${checked ? "checked" : ""}><i></i></label>`; }
  function normalizeUrl(value) { const raw = String(value || "").trim(); return !raw ? "" : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; }

  function bindCanvasColorPicker(input) {
    input.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); openCanvasColorPicker(input); });
    input.addEventListener("click", (event) => event.preventDefault());
  }

  function openCanvasColorPicker(input) {
    document.getElementById("canvasColorPopover")?.remove();
    const initial=colorHexToRgb(input.value||"#ffffff"), hsv=colorRgbToHsv(initial.r,initial.g,initial.b);
    const popover=document.createElement("div"); popover.id="canvasColorPopover"; popover.className="canvas-color-popover";
    popover.innerHTML=`<div class="canvas-color-sv"><i></i></div><div class="canvas-color-hue-row"><span class="canvas-color-preview"></span><input class="canvas-color-hue" type="range" min="0" max="360" value="${Math.round(hsv.h)}"></div><div class="canvas-color-values"><label><input data-channel="r" type="number" min="0" max="255" value="${initial.r}"><span>R</span></label><label><input data-channel="g" type="number" min="0" max="255" value="${initial.g}"><span>G</span></label><label><input data-channel="b" type="number" min="0" max="255" value="${initial.b}"><span>B</span></label><label class="canvas-color-hex-value"><input type="text" value="${toHex(input.value).slice(1).toUpperCase()}"><span>HEX</span></label></div>`;
    document.body.appendChild(popover); const rect=input.getBoundingClientRect(),width=286,height=258;
    popover.style.left=`${Math.max(12,Math.min(innerWidth-width-12,rect.right-width))}px`; popover.style.top=`${Math.max(12,Math.min(innerHeight-height-12,rect.bottom+8))}px`;
    let state={h:hsv.h,s:hsv.s,v:hsv.v}; const sv=popover.querySelector(".canvas-color-sv"),cursor=sv.querySelector("i"),hue=popover.querySelector(".canvas-color-hue"),preview=popover.querySelector(".canvas-color-preview"),channels=[...popover.querySelectorAll("[data-channel]")],hex=popover.querySelector(".canvas-color-hex-value input");
    const paint=(commit=true)=>{const rgb=colorHsvToRgb(state.h,state.s,state.v),value=colorRgbToHex(rgb.r,rgb.g,rgb.b);sv.style.setProperty("--picker-hue",`hsl(${state.h} 100% 50%)`);cursor.style.left=`${state.s*100}%`;cursor.style.top=`${(1-state.v)*100}%`;preview.style.background=value;hex.value=value.slice(1).toUpperCase();channels.forEach((field,index)=>field.value=Math.round([rgb.r,rgb.g,rgb.b][index]*100)/100);if(commit){input.value=value;input.closest(".canvas-color-picker-button")?.querySelector("i")?.style.setProperty("--picker-color",value);input.dispatchEvent(new Event("input",{bubbles:true}));input.closest("section,details")?.querySelectorAll(`input[type="text"][data-prop="${input.dataset.prop}"]`).forEach(field=>field.value=value.slice(1).toUpperCase());}};
    const pickSv=(event)=>{const r=sv.getBoundingClientRect();state.s=clamp((event.clientX-r.left)/r.width,0,1);state.v=1-clamp((event.clientY-r.top)/r.height,0,1);paint();};
    sv.onpointerdown=(event)=>{pickSv(event);sv.setPointerCapture?.(event.pointerId);sv.onpointermove=pickSv;};sv.onpointerup=()=>sv.onpointermove=null;hue.oninput=()=>{state.h=Number(hue.value);paint();};
    channels.forEach(field=>field.onchange=()=>{state=colorRgbToHsv(...channels.map(channel=>clamp(Number(channel.value),0,255)));hue.value=Math.round(state.h);paint();});
    hex.onchange=()=>{const value=`#${hex.value.replace(/[^0-9a-f]/gi,"").slice(0,6).padEnd(6,"0")}`,rgb=colorHexToRgb(value);state=colorRgbToHsv(rgb.r,rgb.g,rgb.b);hue.value=Math.round(state.h);paint();};paint(false);
    const close=(event)=>{if(!popover.contains(event.target)&&event.target!==input){popover.remove();document.removeEventListener("pointerdown",close,true);}};setTimeout(()=>document.addEventListener("pointerdown",close,true));
  }
  function colorHexToRgb(value){const hex=toHex(value).slice(1);return{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)};}
  function colorRgbToHex(r,g,b){return`#${[r,g,b].map(value=>clamp(Math.round(value),0,255).toString(16).padStart(2,"0")).join("")}`;}
  function colorRgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}if(h<0)h+=360;return{h,s:max?d/max:0,v:max};}
  function colorHsvToRgb(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return{r:(rgb[0]+m)*255,g:(rgb[1]+m)*255,b:(rgb[2]+m)*255};}
  function setInspectorProp(input, rerenderInspector) {
    let value = input.type === "checkbox" ? input.checked : ["number", "range"].includes(input.type) ? roundTwo(input.value) : input.value;
    if (["color","fill","stroke","titleColor","subtitleColor","cardBorderColor","mindBranchColor"].includes(input.dataset.prop) && input.type === "text") value = `#${String(value).replace(/[^0-9a-f]/gi, "").slice(0,6)}`;
    C.draft.elements.filter((entry) => C.selected.has(entry.id)).forEach((entry) => {
      entry[input.dataset.prop] = value;
      if (entry.type !== "mind") return;
      C.draft.connections.filter(line => line.mind && line.from === entry.id).forEach(line => {
        if (input.dataset.prop === "mindBranchType") line.type = value;
        if (input.dataset.prop === "mindBranchDash") line.dash = value;
        if (input.dataset.prop === "mindBranchEndpoint") { line.endpoint = value; line.arrow = value === "arrow"; }
        if (input.dataset.prop === "mindBranchWidth") line.width = value;
        if (input.dataset.prop === "mindBranchColor") line.color = value;
      });
    });
    if (input.type === "range") input.style.setProperty("--range-progress", `${clamp((Number(value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100, 0, 100)}%`);
    input.closest("label")?.querySelector("output") && (input.closest("label").querySelector("output").textContent = value);
    markDirty(); renderElements(); renderConnections(); if (rerenderInspector) renderInspector();
  }
  function setConnectionProp(input, rerenderInspector) {
    const connection = C.draft.connections.find((entry) => entry.id === C.selectedConnection); if (!connection) return;
    connection[input.dataset.prop] = input.type === "checkbox" ? input.checked : ["number","range"].includes(input.type) ? roundTwo(input.value) : input.value;
    if (input.type === "range") input.style.setProperty("--range-progress", `${clamp((Number(connection[input.dataset.prop]) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100, 0, 100)}%`);
    input.closest("label")?.querySelector("output") && (input.closest("label").querySelector("output").textContent = connection[input.dataset.prop]);
    markDirty(); renderConnections(); if (rerenderInspector) renderInspector();
  }

  function typeName(type) { return ({ text: "文字", note: "卡片", rect: "矩形", ellipse: "椭圆", shape: "图形", mind: "思维导图", image: "图片", file: "文件", "file-review":"文件审阅", link: "网页", container: "容器" })[type] || type; }
  function toHex(value) { return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"; }
  function hexToRgba(value, opacity = 100) { const hex = toHex(value).slice(1); return `rgba(${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)},${clamp(Number(opacity),0,100)/100})`; }
  function anchorOrigin(anchor = "center") { return ({"top-left":"0% 0%",top:"50% 0%","top-right":"100% 0%",left:"0% 50%",center:"50% 50%",right:"100% 50%","bottom-left":"0% 100%",bottom:"50% 100%","bottom-right":"100% 100%"})[anchor] || "50% 50%"; }

  function updateSelected(prop, value) {
    snapshot(); C.draft.elements.filter((item) => C.selected.has(item.id)).forEach((item) => item[prop] = value); markDirty(); renderEditor();
  }
  function updateSelectedMany(values) {
    snapshot(); C.draft.elements.filter((item) => C.selected.has(item.id)).forEach((item) => Object.assign(item, values)); markDirty(); renderEditor();
  }

  function deleteSelected() {
    if (!C.selected.size) return;
    snapshot();
    const affectedMindParents = new Set(C.draft.elements.filter(item => C.selected.has(item.id) && item.type === "mind" && item.mindParentId).map(item => item.mindParentId));
    const removing = new Set(C.selected);
    let changed = true;
    while (changed) {
      changed = false;
      C.draft.elements.forEach(item => {
        if (item.type === "mind" && item.mindParentId && removing.has(item.mindParentId) && !removing.has(item.id)) { removing.add(item.id); changed = true; }
      });
    }
    C.draft.elements = C.draft.elements.filter((item) => !removing.has(item.id));
    C.draft.connections = C.draft.connections.filter((line) => !removing.has(line.from) && !removing.has(line.to));
    affectedMindParents.forEach(id => { const parent=C.draft.elements.find(item=>item.id===id); if(parent) layoutMindChildren(parent); });
    C.selected.clear(); markDirty(); renderEditor();
  }

  function snapshot() {
    if (!C.draft) return;
    C.history.push(JSON.stringify({ elements: C.draft.elements, connections: C.draft.connections, title: C.draft.title }));
    if (C.history.length > 60) C.history.shift(); C.future = [];
  }
  function restore(serialized) { const next = JSON.parse(serialized); Object.assign(C.draft, next); C.selected.clear(); markDirty(); renderEditor(); }
  function undo() { if (!C.history.length) return; C.future.push(JSON.stringify({ elements: C.draft.elements, connections: C.draft.connections, title: C.draft.title })); restore(C.history.pop()); document.getElementById("canvasTitle").value = C.draft.title; }
  function redo() { if (!C.future.length) return; C.history.push(JSON.stringify({ elements: C.draft.elements, connections: C.draft.connections, title: C.draft.title })); restore(C.future.pop()); document.getElementById("canvasTitle").value = C.draft.title; }

  function markDirty() { C.dirty = true; updateSaveState(); }
  function updateSaveState() { const label = document.getElementById("canvasSaveState"); if (label) { label.textContent = C.dirty ? "未保存" : "已保存"; label.classList.toggle("dirty", C.dirty); } }

  async function captureCanvasPreview() {
    const viewport = document.getElementById("canvasViewport");
    const editor = document.getElementById("canvasEditor");
    if (!viewport || !editor || !window.geruosiDesktop?.captureCanvasPreview) return "";
    const previousViewport = {...C.viewport};
    const pets = [...document.querySelectorAll(".origin-pet")].map((pet) => ({ pet, visibility: pet.style.getPropertyValue("visibility"), priority: pet.style.getPropertyPriority("visibility") }));
    pets.forEach(({ pet }) => pet.style.setProperty("visibility", "hidden", "important"));
    editor.classList.add("capturing-preview");
    fitContent(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = viewport.getBoundingClientRect();
      return await window.geruosiDesktop.captureCanvasPreview({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    } catch (error) {
      console.warn("画布真实预览生成失败", error);
      return "";
    } finally {
      C.viewport = previousViewport;
      applyViewport();
      editor.classList.remove("capturing-preview");
      pets.forEach(({ pet, visibility, priority }) => visibility ? pet.style.setProperty("visibility", visibility, priority) : pet.style.removeProperty("visibility"));
    }
  }

  async function saveCanvas() {
    if (!C.canvas || !C.draft) return;
    C.draft.title = (document.getElementById("canvasTitle")?.value || C.draft.title || "未命名画布").trim();
    C.draft.updatedAt = new Date().toISOString(); C.draft.viewport = { ...C.viewport };
    const preview = await captureCanvasPreview();
    if (preview) { C.draft.preview = preview; C.draft.previewVersion = 2; } else { delete C.draft.preview; delete C.draft.previewVersion; }
    Object.keys(C.canvas).forEach((key) => delete C.canvas[key]); Object.assign(C.canvas, deepCopy(C.draft));
    C.dirty = false; C.isNew = false; saveState(); updateSaveState();
  }

  async function requestExit() {
    if (!C.dirty) {
      if ((!C.draft?.preview || C.draft.previewVersion !== 2) && C.canvas) {
        const preview = await captureCanvasPreview();
        if (preview) { C.draft.preview = preview; C.canvas.preview = preview; C.draft.previewVersion = C.canvas.previewVersion = 2; saveState(); }
      }
      return closeEditor();
    }
    document.getElementById("canvasExitDialog").classList.remove("hidden");
  }
  function closeEditor() {
    if (C.isNew && C.project && C.canvas) C.project.canvases = C.project.canvases.filter((item) => item.id !== C.canvas.id);
    document.removeEventListener("keydown", editorKeydown, true); document.removeEventListener("keyup", editorKeyup, true); document.removeEventListener("pointermove", editorPointerMove); document.removeEventListener("pointerup", editorPointerUp);
    document.getElementById("canvasEditor")?.remove(); C.project = C.canvas = C.draft = null; C.isNew = false; renderLibrary();
  }

  function editorKeydown(event) {
    if (!document.getElementById("canvasEditor")) return;
    const typing = event.target.matches("input,textarea,[contenteditable]");
    if (event.code === "Space" && !typing) {
      event.preventDefault();
      C.spacePressed = true;
      document.getElementById("canvasViewport")?.classList.add("space-pan-ready");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCanvas(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    const selectedMind = C.selected.size === 1 ? C.draft.elements.find(item => C.selected.has(item.id) && item.type === "mind") : null;
    if (!typing && selectedMind && event.key === "Tab") { event.preventDefault(); addMindRelative(selectedMind, "child"); return; }
    if (!typing && selectedMind && event.key === "Enter") { event.preventDefault(); addMindRelative(selectedMind, "sibling"); return; }
    if (["Delete", "Backspace"].includes(event.key) && !event.target.matches("input,textarea,[contenteditable]")) { event.preventDefault(); deleteSelected(); }
    if (event.key === "Escape") { C.connectingFrom = ""; selectTool("select"); renderElements(); }
  }

  function editorKeyup(event) {
    if (event.code !== "Space") return;
    C.spacePressed = false;
    document.getElementById("canvasViewport")?.classList.remove("space-pan-ready");
  }

  const MIND_RAINBOW = ["#ff4541","#ff8f3d","#f4c914","#00b985","#4768ff","#8d55d9","#ed4e9a"];
  const MIND_THEMES={
    rainbow:{name:"彩虹",root:"#05051f",colors:MIND_RAINBOW},
    business:{name:"商务",root:"#10233f",colors:["#173f73","#315b84","#526b89","#6f8198","#354a63"]},
    fresh:{name:"清新",root:"#174d43",colors:["#2bbf9b","#64cbb1","#8ad8c3","#7b948e","#a9bbb6"]},
    romance:{name:"浪漫",root:"#641f2b",colors:["#922f43","#b34b60","#cd7181","#8b7077","#b9a1a7"]},
    ocean:{name:"海洋",root:"#073b5c",colors:["#087ea4","#18a4b8","#48bfd0","#39739a","#769bb1"]},
    forest:{name:"森林",root:"#183f2b",colors:["#26734d","#3d9165","#62aa7d","#7d8f78","#a0ad99"]},
    sunset:{name:"落日",root:"#6c2f35",colors:["#d6544d","#ed7652","#f29b63","#c86d76","#91717a"]},
    technology:{name:"科技",root:"#14245f",colors:["#2854d7","#357de7","#20a7c7","#6559d9","#7486a9"]},
    elegant:{name:"雅致",root:"#34303f",colors:["#6c5b7b","#8f799d","#aa91b0","#77828f","#a5a8ad"]},
    vintage:{name:"复古",root:"#4c3a2c",colors:["#9b623d","#bd8050","#c99c62","#7e7661","#a59a7f"]}
  };
  function mixMindColor(first, second, amount) {
    const a=colorHexToRgb(first), b=colorHexToRgb(second), mix=key=>a[key]+(b[key]-a[key])*amount;
    return colorRgbToHex(mix("r"),mix("g"),mix("b"));
  }
  function mindRootNode(item){let current=item,guard=0;while(current?.mindParentId&&guard++<30){const parent=C.draft.elements.find(entry=>entry.id===current.mindParentId);if(!parent)break;current=parent;}return current||item;}
  function mindNodeDepth(item) {
    if (!item?.mindParentId && Number.isFinite(Number(item?.mindDepth))) return Number(item.mindDepth);
    let depth=0,current=item,guard=0;
    while(current?.mindParentId && guard++<20){depth++;current=C.draft.elements.find(entry=>entry.id===current.mindParentId);}
    return depth;
  }

  function applyMindTheme(item,key){
    const root=mindRootNode(item),theme=MIND_THEMES[key]||MIND_THEMES.rainbow,nodes=C.draft.elements.filter(node=>node.type==="mind"&&mindRootNode(node).id===root.id);root.mindTheme=key in MIND_THEMES?key:"rainbow";
    nodes.forEach(node=>{const depth=mindNodeDepth(node),parent=C.draft.elements.find(entry=>entry.id===node.mindParentId),siblings=parent?nodes.filter(entry=>entry.mindParentId===parent.id):[node],hue=depth===0?theme.root:depth===1?theme.colors[Math.max(0,siblings.indexOf(node))%theme.colors.length]:(parent?.mindHue||theme.colors[0]);node.mindHue=hue;node.mindBranchColor=hue;node.mindBorderStyle="none";node.strokeEnabled=false;if(depth===0){node.fill=theme.root;node.stroke=theme.root;node.color="#ffffff";}else if(depth===1){node.fill=hue;node.stroke=hue;node.color="#ffffff";}else{node.fill=mixMindColor(hue,"#ffffff",.82);node.stroke=node.fill;node.color=mixMindColor(hue,"#10231f",.64);}});
    C.draft.connections.filter(line=>line.mind&&nodes.some(node=>node.id===line.to)).forEach(line=>{const child=C.draft.elements.find(node=>node.id===line.to);line.color=child?.mindHue||theme.colors[0];});
  }

  function applyMindStructure(item,type){
    const root=mindRootNode(item),nodes=C.draft.elements.filter(entry=>entry.type==="mind"&&mindRootNode(entry).id===root.id);
    if(!["mindmap","org","tree","timeline","fishbone"].includes(type)) type="mindmap";
    root.mindStructure=type;
    const shapes={mindmap:["rounded","rounded","rounded"],org:["rounded","rounded","rounded"],tree:["rounded","rounded","rounded"],timeline:["rounded","rounded","rounded"],fishbone:["rounded","rounded","rounded"]}[type];
    nodes.forEach(node=>{const depth=mindNodeDepth(node);node.mindShape=shapes[Math.min(depth,2)];node.radius=node.mindShape==="rect"?0:node.mindShape==="capsule"?999:depth===0?14:10;node.mindStructure=undefined;});
    root.mindStructure=type;
    C.draft.connections.filter(line=>line.mind&&nodes.some(node=>node.id===line.to)).forEach(line=>{
      const child=C.draft.elements.find(node=>node.id===line.to),depth=mindNodeDepth(child);
      line.type=type==="mindmap"?"curve":type==="org"?(depth===1?"curve":"elbow"):type==="tree"?(depth===1?"curve":"elbow"):"straight";
    });
    layoutMindChildren(root);
  }

  function upgradeMindMapStyles() {
    const nodes=C.draft?.elements?.filter(item=>item.type==="mind") || [];
    let migrated=false;
    nodes.sort((a,b)=>mindNodeDepth(a)-mindNodeDepth(b)).forEach(item=>{
      const depth=mindNodeDepth(item);
      const parent=C.draft.elements.find(entry=>entry.id===item.mindParentId);
      const siblings=parent ? nodes.filter(entry=>entry.mindParentId===parent.id) : nodes.filter(entry=>!entry.mindParentId);
      const hue=depth===0 ? "#05051f" : depth===1 ? MIND_RAINBOW[Math.max(0,siblings.indexOf(item))%MIND_RAINBOW.length] : (parent?.mindHue || MIND_RAINBOW[0]);
      item.mindDepth=depth; item.align="center"; item.verticalAlign="middle";item.mindBorderStyle="none";item.strokeEnabled=false;
      if (item.mindStyleVersion===3) return;
      migrated=true; item.mindHue=hue; item.mindStyleVersion=3;
      Object.assign(item, depth===0
        ? {fill:"#05051f",color:"#ffffff",stroke:"#05051f",w:220,h:86,size:28,fontWeight:700,bold:true,radius:14}
        : depth===1
        ? {fill:hue,color:"#ffffff",stroke:hue,w:164,h:58,size:19,fontWeight:700,bold:true,radius:12,mindBranchColor:hue}
        : {fill:mixMindColor(hue,"#ffffff",.82),color:mixMindColor(hue,"#10231f",.64),stroke:mixMindColor(hue,"#ffffff",.58),w:150,h:48,size:17,fontWeight:600,bold:true,radius:10,mindBranchColor:hue});
    });
    C.draft?.connections?.filter(line=>line.mind).forEach(line=>{const child=C.draft.elements.find(item=>item.id===line.to);if(child?.mindHue)line.color=child.mindHue;});
    if(migrated) [...nodes].sort((a,b)=>mindNodeDepth(b)-mindNodeDepth(a)).forEach(layoutMindChildren);
  }

  function moveMindSubtree(root, dx, dy) {
    root.x=Math.round(root.x+dx); root.y=Math.round(root.y+dy);
    C.draft.elements.filter(item=>item.type==="mind" && item.mindParentId===root.id).forEach(child=>moveMindSubtree(child,dx,dy));
  }

  function layoutMindChildren(parent) {
    const root=mindRootNode(parent),structure=root.mindStructure||"mindmap";
    const childrenOf=node=>C.draft.elements.filter(item=>item.type==="mind"&&item.mindParentId===node.id);
    const place=(node,x,y)=>moveMindSubtree(node,Math.round(x-node.x),Math.round(y-node.y));
    const stackRight=(node,gapX=92,gapY=16)=>{
      const children=childrenOf(node); if(!children.length)return;const direction=node.mindDirection||"right";
      if(direction==="down"){
        const total=children.reduce((sum,child)=>sum+child.w,0)+gapY*(children.length-1);let x=node.x+node.w/2-total/2;
        children.forEach(child=>{place(child,x,node.y+node.h+gapX);x+=child.w+gapY;stackRight(child,70,12);});return;
      }
      const groups=direction==="both"?[[children.filter((child,index)=>index%2===1),"left"],[children.filter((child,index)=>index%2===0),"right"]]:[[children,direction]];
      groups.forEach(([items,side])=>{const total=items.reduce((sum,child)=>sum+child.h,0)+gapY*Math.max(0,items.length-1);let y=node.y+node.h/2-total/2;items.forEach(child=>{place(child,side==="left"?node.x-child.w-gapX:node.x+node.w+gapX,y);y+=child.h+gapY;stackRight(child,70,12);});});
    };
    if(structure==="mindmap"){
      const first=childrenOf(root),direction=root.mindDirection||"right";
      if(direction==="down"){
        const gap=38,total=first.reduce((sum,node)=>sum+node.w,0)+Math.max(0,first.length-1)*gap;let x=root.x+root.w/2-total/2;
        first.forEach(node=>{place(node,x,root.y+root.h+105);x+=node.w+gap;const kids=childrenOf(node);const childGap=18,childTotal=kids.reduce((sum,kid)=>sum+kid.w,0)+Math.max(0,kids.length-1)*childGap;let childX=node.x+node.w/2-childTotal/2;kids.forEach(kid=>{place(kid,childX,node.y+node.h+70);childX+=kid.w+childGap;});});return;
      }
      const groups=direction==="both"?[[first.filter((node,index)=>index%2===1),"left"],[first.filter((node,index)=>index%2===0),"right"]]:[[first,direction]];
      groups.forEach(([nodes,side])=>{
        const total=nodes.reduce((sum,node)=>sum+node.h,0)+Math.max(0,nodes.length-1)*18;let y=root.y+root.h/2-total/2;
        nodes.forEach(node=>{place(node,side==="left"?root.x-node.w-120:root.x+root.w+120,y);y+=node.h+18;
          if(side==="left") { const walk=p=>{const kids=childrenOf(p),height=kids.reduce((s,k)=>s+k.h,0)+Math.max(0,kids.length-1)*12;let ky=p.y+p.h/2-height/2;kids.forEach(k=>{place(k,p.x-k.w-70,ky);ky+=k.h+12;walk(k);});};walk(node); }
          else stackRight(node,70,12);
        });
      });
      return;
    }
    if(structure==="org"){
      const walk=(node,depth=0)=>{const kids=childrenOf(node);if(!kids.length)return;const gap=depth?22:48,total=kids.reduce((s,k)=>s+k.w,0)+gap*(kids.length-1);let x=node.x+node.w/2-total/2;kids.forEach(k=>{place(k,x,node.y+node.h+(depth?70:105));x+=k.w+gap;walk(k,depth+1);});};walk(root);return;
    }
    if(structure==="tree"){
      const first=childrenOf(root);let y=root.y+root.h+42;
      first.forEach(branch=>{place(branch,root.x+34,y);const descendants=childrenOf(branch);let dy=branch.y+branch.h+12;descendants.forEach(child=>{place(child,branch.x+branch.w+34,dy);dy+=child.h+12;stackRight(child,42,10);});y=Math.max(y+branch.h+28,dy+12);});return;
    }
    if(structure==="timeline"){
      const first=childrenOf(root);let x=root.x+root.w+86;const axisY=root.y+root.h/2;
      first.forEach((branch,index)=>{const above=index%2===0;place(branch,x,above?axisY-branch.h-78:axisY+78);const kids=childrenOf(branch);let ky=above?branch.y-64:branch.y+branch.h+24;kids.forEach(child=>{place(child,branch.x+branch.w/2-child.w/2,ky);ky+=above?-(child.h+12):child.h+12;});x+=Math.max(branch.w,170)+84;});return;
    }
    if(structure==="fishbone"){
      const first=childrenOf(root);const axisY=root.y+root.h/2;let x=root.x+root.w+130;
      first.forEach((branch,index)=>{const above=index%2===0;place(branch,x,above?axisY-150:axisY+100);const kids=childrenOf(branch);let ky=branch.y+(above?-(kids.length-1)*34:branch.h+18);kids.forEach(child=>{place(child,branch.x+branch.w+30,ky);ky+=child.h+10;});x+=220;});return;
    }
  }

  function addMindRelative(source, mode) {
    snapshot();
    const parent = mode === "sibling" ? C.draft.elements.find(item => item.id === source.mindParentId) : source;
    const siblings = parent ? C.draft.elements.filter(item => item.type === "mind" && item.mindParentId === parent.id) : [];
    const direction = parent?.mindDirection || source.mindDirection || "right";
    const index = siblings.length;
    const side = direction === "both" ? (index % 2 ? "left" : "right") : direction;
    const depth = parent ? mindNodeDepth(parent) + 1 : 0;
    const mindTheme=MIND_THEMES[mindRootNode(parent||source)?.mindTheme]||MIND_THEMES.rainbow;
    const hue = depth === 1 ? mindTheme.colors[index % mindTheme.colors.length] : (parent?.mindHue || source.mindHue || source.mindBranchColor || mindTheme.colors[0]);
    const w = depth === 0 ? 220 : depth === 1 ? 164 : 150;
    const h = depth === 0 ? 86 : depth === 1 ? 58 : 48;
    let x = source.x, y = source.y + h + 30;
    if (parent) {
      const ring = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 1 : -1);
      if (side === "left") { x = parent.x - w - 120; y = parent.y + parent.h / 2 - h / 2 + ring * (h + 28); }
      else if (side === "down") { x = parent.x + parent.w / 2 - w / 2 + ring * (w + 45); y = parent.y + parent.h + 100; }
      else { x = parent.x + parent.w + 120; y = parent.y + parent.h / 2 - h / 2 + ring * (h + 28); }
    }
    const child = { ...deepCopy(source), id: makeId("el"), text: mode === "child" ? "子主题" : "同级主题", x: Math.round(x), y: Math.round(y), w, h, rotation: 0, align: "center", verticalAlign: "middle", mindDepth: depth, mindHue: hue, mindStyleVersion: 3, mindParentId: parent?.id || "", mindTopicType: parent ? "branch" : "floating", mindDirection:side==="left"?"left":side==="down"?"down":"right", fill: depth === 0 ? "#05051f" : depth === 1 ? hue : mixMindColor(hue,"#ffffff",.82), color: depth <= 1 ? "#ffffff" : mixMindColor(hue,"#10231f",.64), stroke: depth === 0 ? "#05051f" : depth === 1 ? hue : mixMindColor(hue,"#ffffff",.58), size: depth === 0 ? 28 : depth === 1 ? 19 : 17, fontWeight: depth <= 1 ? 700 : 600, bold: true, radius: depth === 0 ? 14 : depth === 1 ? 12 : 10, mindBranchColor: hue };
    C.draft.elements.push(child);
    if (parent) C.draft.connections.push({ id: makeId("line"), from: parent.id, to: child.id, mind: true, type: parent.mindBranchType || "curve", dash: parent.mindBranchDash || "solid", endpoint: parent.mindBranchEndpoint || "round", arrow: parent.mindBranchEndpoint === "arrow", color: hue, width: Number(parent.mindBranchWidth || 2) });
    if(parent){const root=mindRootNode(parent);root.mindStructure?applyMindStructure(root,root.mindStructure):layoutMindChildren(parent);}
    C.selected = new Set([child.id]); C.selectedConnection = ""; markDirty(); renderEditor();
    setTimeout(() => editElement(child.id, { target: document.querySelector(`.canvas-element[data-id="${child.id}"] .canvas-element-text`) }), 0);
  }

  function canvasPoint(event) { const rect = document.getElementById("canvasViewport").getBoundingClientRect(); return { x: (event.clientX - rect.left - C.viewport.x) / C.viewport.zoom, y: (event.clientY - rect.top - C.viewport.y) / C.viewport.zoom }; }
  function centerPoint() { const rect = document.getElementById("canvasViewport").getBoundingClientRect(); return { x: (rect.width / 2 - C.viewport.x) / C.viewport.zoom - 110, y: (rect.height / 2 - C.viewport.y) / C.viewport.zoom - 60 }; }
  function applyViewport() { const world = document.getElementById("canvasWorld"); if (world) world.style.transform = `translate(${C.viewport.x}px,${C.viewport.y}px) scale(${C.viewport.zoom})`; const label = document.getElementById("canvasZoomLabel"); if (label) label.textContent = `${Math.round(C.viewport.zoom * 100)}%`; }
  function setZoom(next, anchor) {
    const old = C.viewport.zoom; const zoom = clamp(next, .25, 2.5); if (zoom === old) return;
    const viewport = document.getElementById("canvasViewport"); const rect = viewport.getBoundingClientRect(); const ax = anchor?.x ?? rect.width / 2; const ay = anchor?.y ?? rect.height / 2;
    C.viewport.x = ax - (ax - C.viewport.x) * zoom / old; C.viewport.y = ay - (ay - C.viewport.y) * zoom / old; C.viewport.zoom = zoom; applyViewport();
  }
  function viewportWheel(event) { event.preventDefault(); if (event.ctrlKey) { const rect = event.currentTarget.getBoundingClientRect(); setZoom(C.viewport.zoom * (event.deltaY > 0 ? .9 : 1.1), { x: event.clientX - rect.left, y: event.clientY - rect.top }); } else { C.viewport.x -= event.deltaX; C.viewport.y -= event.deltaY; applyViewport(); } }

  function contentBounds(elements) {
    const boxes=elements.map(item=>{
      const x=Number(item.x)||0,y=Number(item.y)||0,w=Number(item.w)||1,h=Number(item.h)||1;
      const angle=(Number(item.rotation)||0)*Math.PI/180;
      const width=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle));
      const height=Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle));
      return {left:x+w/2-width/2,top:y+h/2-height/2,right:x+w/2+width/2,bottom:y+h/2+height/2};
    });
    return {minX:Math.min(...boxes.map(b=>b.left)),minY:Math.min(...boxes.map(b=>b.top)),maxX:Math.max(...boxes.map(b=>b.right)),maxY:Math.max(...boxes.map(b=>b.bottom))};
  }
  function fitContent(preview=false) {
    if (!C.draft.elements.length) { C.viewport = { x: 60, y: 60, zoom: 1 }; return applyViewport(); }
    const viewport=document.getElementById("canvasViewport"),{minX,minY,maxX,maxY}=contentBounds(C.draft.elements);
    const padding=preview===true?48:140;
    const zoom=Math.min(Math.max(1,viewport.clientWidth-padding)/Math.max(1,maxX-minX),Math.max(1,viewport.clientHeight-padding)/Math.max(1,maxY-minY),1.4);
    C.viewport={zoom,x:(viewport.clientWidth-(maxX-minX)*zoom)/2-minX*zoom,y:(viewport.clientHeight-(maxY-minY)*zoom)/2-minY*zoom};
    applyViewport();
  }

  const previousRenderProjectDetail = window.renderProjectDetail;
  if (typeof previousRenderProjectDetail === "function") window.renderProjectDetail = function () { previousRenderProjectDetail(); renderLibrary(); };
  window.addEventListener("beforeunload", () => {
    // The desktop window must always be closable. Persist an in-progress canvas
    // synchronously instead of leaving Electron behind a hidden unload prompt.
    if (C.dirty && C.canvas && C.draft) saveCanvas();
  });
  renderLibrary();
})();

