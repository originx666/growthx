const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadFile("D:/growthx/index.html");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const metrics = await win.webContents.executeJavaScript(`(() => {
    document.body.dataset.view = "projects";
    document.body.classList.add("has-no-projects");
    document.querySelectorAll(".view").forEach((node) => node.classList.remove("active"));
    const view = document.getElementById("projectsView");
    view.classList.add("active", "project-empty");
    const empty = document.getElementById("emptyProjectState");
    empty.classList.remove("hidden");
    document.getElementById("projectDetail").classList.add("hidden");
    const ai = view.querySelector(":scope > aside.overview-ai");
    ai.hidden = true;
    ai.setAttribute("aria-hidden", "true");
    const vr = view.getBoundingClientRect();
    const er = empty.getBoundingClientRect();
    const ar = ai.getBoundingClientRect();
    return { viewport: innerWidth, view: { left: vr.left, right: vr.right, width: vr.width }, empty: { left: er.left, right: er.right, width: er.width }, ai: { display: getComputedStyle(ai).display, width: ar.width }, paddingRight: getComputedStyle(view).paddingRight };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await win.webContents.capturePage();
  require("node:fs").writeFileSync(path.join(__dirname, "empty-project-check.png"), image.toPNG());
  require("node:fs").writeFileSync(path.join(__dirname, "empty-project-metrics.json"), JSON.stringify(metrics, null, 2));
  app.quit();
});
