/* Career cover artwork, compact cards, and fixed-ratio upload cropper. */
(() => {
  const types = ["domains", "skills", "readings", "courses", "certificates"];

  function coverVariant(item) {
    if (Number.isInteger(item.coverVariant)) return Math.abs(item.coverVariant) % 5;
    let hash = 0;
    for (const char of String(item.id || item.name || "career")) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 5;
  }
  function defaultCover(type, item) {
    return `assets/career-covers/${types.includes(type) ? type : "domains"}-${coverVariant(item) + 1}.jpg`;
  }
  function artwork(item, type, options = {}) {
    const cover = document.createElement("div");
    cover.className = `career-cover ${item.coverImage ? "user-cover" : "system-cover"} ${options.large ? "career-cover-large" : ""}`;
    const img = document.createElement("img");
    img.alt = item.coverImage ? "用户上传的记录封面" : "系统记录封面";
    img.src = item.coverImage || defaultCover(type, item); img.draggable = false; cover.append(img);
    if (!item.coverImage && options.showTitle !== false) {
      const title = document.createElement("span"); title.className = "career-cover-title";
      title.textContent = item.name || `新的${careerTypeLabel(type)}`; cover.append(title);
    }
    return cover;
  }
  function openItem(item, type, mode = "view") {
    state.selectedCareerType = type; state.selectedCareerId = item.id; careerRelationPickerContext = null;
    renderCareer(); renderCareerDialogRestored(mode); saveState();
  }
  function enhanceCards() {
    const type = state.selectedCareerType || "domains", items = state.career[type] || [];
    document.querySelectorAll("#careerList > .career-item").forEach((card, index) => {
      const item = items[index]; if (!item) return;
      const title = card.querySelector(".career-card-title"), note = card.querySelector(".career-card-note"), mastery = card.querySelector(".career-card-mastery"), footer = card.querySelector(".career-card-footer");
      const info = document.createElement("div"); info.className = "career-card-info";
      info.append(title, note); if (mastery && footer && !footer.contains(mastery)) footer.prepend(mastery); info.append(footer); card.classList.add("with-cover"); card.replaceChildren(artwork(item, type), info);
    });
  }
  const baseRenderCareer = renderCareer;
  renderCareer = function renderCareerWithCovers() { baseRenderCareer(); enhanceCards(); };

  function cropFile(file, done) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return alert("请选择 JPG、PNG 或 WebP 图片。");
    if (file.size > 20 * 1024 * 1024) return alert("请选择 20 MB 以内的图片。");
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); alert("图片无法读取，请重新选择。"); };
    img.onload = () => {
      const dialog = document.createElement("dialog"); dialog.className = "career-crop-dialog";
      dialog.innerHTML = '<header><div><h2>裁剪封面</h2><p>固定为 3:4。拖动图片调整位置，滑动调节缩放。</p></div><button type="button" data-cancel aria-label="关闭">×</button></header><div class="career-crop-stage"><canvas width="600" height="800" tabindex="0" aria-label="封面裁剪框"></canvas></div><label class="career-crop-zoom"><span>缩放</span><input type="range" min="1" max="4" step="0.01" value="1"></label><footer><button type="button" data-reset>重置</button><button type="button" data-cancel>取消</button><button type="button" data-confirm>使用此封面</button></footer>';
      document.body.append(dialog);
      const canvas = dialog.querySelector("canvas"), ctx = canvas.getContext("2d"), slider = dialog.querySelector("input");
      const base = Math.max(600 / img.naturalWidth, 800 / img.naturalHeight); let zoom = 1, x = 0, y = 0, drag = null;
      const draw = () => { const width = img.naturalWidth * base * zoom, height = img.naturalHeight * base * zoom; x = Math.max(-(width - 600) / 2, Math.min((width - 600) / 2, x)); y = Math.max(-(height - 800) / 2, Math.min((height - 800) / 2, y)); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 600, 800); ctx.drawImage(img, (600 - width) / 2 + x, (800 - height) / 2 + y, width, height); };
      slider.oninput = () => { zoom = Number(slider.value); draw(); };
      canvas.onpointerdown = event => { event.preventDefault(); drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
      canvas.onpointermove = event => { if (!drag) return; const rect = canvas.getBoundingClientRect(); x += (event.clientX - drag.x) * 600 / rect.width; y += (event.clientY - drag.y) * 800 / rect.height; drag = { x: event.clientX, y: event.clientY }; draw(); };
      canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
      dialog.querySelector("[data-reset]").onclick = () => { zoom = 1; x = y = 0; slider.value = "1"; draw(); };
      dialog.querySelectorAll("[data-cancel]").forEach(button => { button.onclick = () => dialog.close(); });
      dialog.querySelector("[data-confirm]").onclick = () => { done(canvas.toDataURL("image/jpeg", .88)); dialog.close(); };
      dialog.addEventListener("close", () => { URL.revokeObjectURL(url); dialog.remove(); }, { once: true }); draw(); dialog.showModal();
    }; img.src = url;
  }
  const uploadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
  const imageIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>';

  function unifiedCareerCard(item, type, editing, scroll) {
    const basicGrid = scroll.querySelector(".career-dialog-basic-grid");
    const basicSection = basicGrid?.closest(".career-dialog-section");
    const ratingSection = scroll.querySelector(".career-rating-section");
    const ratingStrip = ratingSection?.querySelector(".career-rating-strip");
    const labels = basicGrid ? [...basicGrid.querySelectorAll(":scope > label")] : [];
    const section = document.createElement("section");
    section.className = `career-unified-card career-dialog-section ${editing ? "editing" : "viewing"}`;
    const visual = document.createElement("div"); visual.className = "career-unified-visual";
    const preview = document.createElement("div"); preview.className = "career-unified-preview";
    const updatePreview = () => preview.replaceChildren(artwork(item, type, { large: true })); updatePreview();
    visual.append(preview);
    if (editing) {
      const actions = document.createElement("div"); actions.className = "career-unified-cover-actions";
      actions.innerHTML = `<button type="button" data-upload title="上传并裁剪图片" aria-label="上传并裁剪图片">${uploadIcon}</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" data-variant title="更换系统图片" aria-label="更换系统图片">${imageIcon}</button><button type="button" data-default title="删除上传图片并恢复系统图片" aria-label="删除上传图片并恢复系统图片">${trashIcon}</button>`;
      visual.append(actions);
      const input = actions.querySelector("input");
      actions.querySelector("[data-upload]").onclick = () => input.click();
      input.onchange = () => { cropFile(input.files[0], src => { item.coverImage = src; updatePreview(); }); input.value = ""; };
      actions.querySelector("[data-variant]").onclick = () => { item.coverVariant = (coverVariant(item) + 1) % 5; delete item.coverImage; updatePreview(); };
      actions.querySelector("[data-default]").onclick = () => { delete item.coverImage; updatePreview(); };
    }
    const fields = document.createElement("div"); fields.className = "career-unified-fields";
    labels.forEach(label => { label.classList.add("career-unified-field"); fields.append(label); });
    if (ratingStrip) {
      const rating = document.createElement("div"); rating.className = "career-unified-field career-unified-rating";
      const label = document.createElement("span"); label.textContent = type === "skills" || type === "domains" ? "评分" : "评分 / 星级";
      rating.append(label, ratingStrip); fields.append(rating);
    }
    section.append(visual, fields);
    basicSection?.remove(); ratingSection?.remove();
    const nameInput = section.querySelector("#careerDialogName");
    if (nameInput) {
      nameInput.maxLength = 30;
      const counter = document.createElement("output"); counter.className = "career-name-counter";
      const updateName = () => { counter.textContent = `${Array.from(nameInput.value).length}/30`; const title = preview.querySelector(".career-cover-title"); if (title) title.textContent = nameInput.value; };
      nameInput.closest("label").append(counter); nameInput.addEventListener("input", updateName); updateName();
    }
    return section;
  }
  const baseRenderDialog = renderCareerDialogRestored;
  renderCareerDialogRestored = function renderCareerDialogWithCover(mode = careerDialogMode) {
    baseRenderDialog(mode);
    const item = selectedCareerItemRestored(), type = state.selectedCareerType || "domains";
    const scroll = document.querySelector("#careerDialogContent .career-dialog-scroll"); if (!item || !scroll) return;
    const editing = mode === "edit";
    const typeName = careerTypeLabel(type);
    const headLabel = document.querySelector("#careerDialogContent .career-dialog-head span");
    if (headLabel) headLabel.textContent = `${editing ? "编辑" : "查看"}${typeName}`;
    scroll.prepend(unifiedCareerCard(item, type, editing, scroll));
  };
  renderCareer();
})();
