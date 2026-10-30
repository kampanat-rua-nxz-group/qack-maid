// Diagram list sidebar: rows, switching, New, collapse.
// Load time needs: shared.js, names.js, store.js, session.js.
// Runtime calls: showToast() from export/menu.js. main.js calls renderDiagramList() after boot.

const diagramListEl = document.getElementById("diagram-list");
const diagramItemsEl = document.getElementById("diagram-items");
const diagramCollapseEl = document.getElementById("diagram-collapse");
const diagramNewEl = document.getElementById("diagram-new");

// The one open row UI (menu, delete confirmation or rename input), or null.
// While it is open, list rebuilds are skipped so autosave and other
// diagrams:changed events cannot destroy it; closing it rebuilds the list.
let rowUi = null;

const MORE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">' +
  '<circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>';

function renderDiagramList() {
  if (rowUi) return;
  const now = Date.now();
  const rows = listDiagrams().map((item) => {
    const row = document.createElement("li");
    row.className = "diagram-row";
    row.dataset.id = item.id;
    row.setAttribute("aria-current", String(item.id === openDiagram.id));

    const open = document.createElement("button");
    open.type = "button";
    open.className = "diagram-open";
    const name = document.createElement("span");
    name.className = "diagram-name";
    name.textContent = item.name;
    name.title = item.name;
    const time = document.createElement("span");
    time.className = "diagram-time";
    time.textContent = relativeTime(item.updatedAt, now);
    open.append(name, time);

    const menu = document.createElement("button");
    menu.type = "button";
    menu.className = "diagram-row-menu";
    menu.setAttribute("aria-label", "Diagram actions");
    menu.setAttribute("aria-haspopup", "menu");
    menu.setAttribute("aria-expanded", "false");
    menu.innerHTML = MORE_ICON;

    row.append(open, menu);
    return row;
  });
  diagramItemsEl.replaceChildren(...rows);
}

function closeRowUi() {
  if (!rowUi) return;
  rowUi = null;
  renderDiagramList();
}

function actionButton(action, label, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.action = action;
  btn.textContent = label;
  if (className) btn.className = className;
  return btn;
}

function menuItem(action, label, className) {
  const btn = actionButton(action, label, className);
  btn.setAttribute("role", "menuitem");
  return btn;
}

// The row menu floats over the list (positioned in diagrams.css), so opening
// it never changes row height. Delete swaps the menu for an inline confirmation.
function showRowMenu(row) {
  const wasOpen = rowUi && rowUi.row === row;
  closeRowUi();
  if (wasOpen) return;
  const fresh = diagramItemsEl.querySelector('.diagram-row[data-id="' + row.dataset.id + '"]');
  if (!fresh) return;
  const actions = document.createElement("div");
  actions.className = "diagram-row-actions";
  actions.setAttribute("role", "menu");
  actions.setAttribute("aria-label", "Diagram actions");
  const divider = document.createElement("div");
  divider.className = "menu-divider";
  divider.setAttribute("role", "separator");
  actions.append(
    menuItem("duplicate", "Duplicate"),
    menuItem("rename", "Rename"),
    divider,
    menuItem("delete", "Delete…", "danger"),
  );
  fresh.append(actions);
  fresh.querySelector(".diagram-row-menu").setAttribute("aria-expanded", "true");
  rowUi = { row: fresh, actions };
  actions.scrollIntoView({ block: "nearest" });
  actions.querySelector("[role=menuitem]").focus();
}

function showDeleteConfirm() {
  const { row, actions } = rowUi;
  const title = document.createElement("p");
  title.className = "confirm-title";
  title.textContent = 'Delete "' + row.querySelector(".diagram-name").textContent + '"?';
  title.title = title.textContent;
  const hint = document.createElement("p");
  hint.className = "confirm-hint";
  hint.textContent = "This can't be undone.";
  const buttons = document.createElement("div");
  buttons.className = "confirm-buttons";
  const cancel = actionButton("cancel-delete", "Cancel");
  buttons.append(cancel, actionButton("confirm-delete", "Delete", "danger"));
  actions.className = "diagram-row-actions confirm";
  actions.setAttribute("role", "alertdialog");
  actions.setAttribute("aria-label", "Confirm delete");
  actions.replaceChildren(title, hint, buttons);
  cancel.focus();
}

// Escape closes the menu or confirmation and puts focus back on the row's trigger.
function closeRowUiToTrigger() {
  const id = rowUi.row.dataset.id;
  closeRowUi();
  const trigger = diagramItemsEl.querySelector('.diagram-row[data-id="' + id + '"] .diagram-row-menu');
  if (trigger) trigger.focus();
}

function moveMenuFocus(step) {
  const items = [...rowUi.actions.querySelectorAll("[role=menuitem]")];
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  items[(at + step + items.length) % items.length].focus();
}

function startRename() {
  const { row } = rowUi;
  const id = row.dataset.id;
  const nameEl = row.querySelector(".diagram-name");
  const original = nameEl.textContent;
  row.querySelector(".diagram-row-actions").remove();
  const input = document.createElement("input");
  input.className = "diagram-rename-input";
  input.value = original;
  input.setAttribute("aria-label", "Diagram name");
  nameEl.replaceWith(input);
  rowUi = { row, input };
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const value = input.value;
    rowUi = null;
    if (!commit) return renderDiagramList();
    const result = renameDiagram(id, value);
    if (result.status === "quota") showToast(STORAGE_FULL_TEXT);
    if (result.status === "ok" && id === openDiagram.id) openDiagram = { ...openDiagram, name: result.name };
    renderDiagramList();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.focus();
  input.select();
}

function runRowAction(action, id) {
  rowUi = null;
  if (action === "duplicate") {
    const result = duplicateDiagram(id);
    if (result.status === "ok") return openDiagramById(result.id);
    if (result.status === "quota") showToast(STORAGE_FULL_TEXT);
    renderDiagramList();
    return;
  }
  const wasOpen = id === openDiagram.id;
  const result = deleteDiagram(id);
  if (result.status === "quota") showToast(STORAGE_FULL_TEXT);
  if (result.status === "ok" && (wasOpen || result.nextId !== id)) {
    if (wasOpen) {
      unsavedEdit = false; // the user chose to delete the Diagram this edit belongs to
      openDiagramById(result.nextId);
    } else {
      notifyDiagramsChanged();
      if (unsavedEdit) autosaveSource(); // the delete may have freed space
    }
  } else {
    renderDiagramList();
  }
}

function setSidebarCollapsed(collapsed) {
  diagramListEl.classList.toggle("collapsed", collapsed);
  diagramCollapseEl.setAttribute("aria-expanded", String(!collapsed));
  diagramCollapseEl.textContent = collapsed ? "»" : "«";
  diagramCollapseEl.title = collapsed ? "Expand" : "Collapse";
}

diagramItemsEl.addEventListener("click", (e) => {
  const menu = e.target.closest(".diagram-row-menu");
  if (menu) return showRowMenu(menu.closest(".diagram-row"));
  const action = e.target.closest("[data-action]");
  if (action && rowUi) {
    const name = action.dataset.action;
    if (name === "rename") return startRename();
    if (name === "delete") return showDeleteConfirm();
    if (name === "cancel-delete") return closeRowUi();
    return runRowAction(name === "confirm-delete" ? "delete" : name, rowUi.row.dataset.id);
  }
  const open = e.target.closest(".diagram-open");
  if (!open) return;
  rowUi = null;
  openDiagramById(open.closest(".diagram-row").dataset.id);
  // On mobile the list replaces the editor; show the opened Diagram. No visible effect on desktop.
  document.querySelector('.tab-btn[data-pane="source"]').click();
});

diagramItemsEl.addEventListener("keydown", (e) => {
  if (!rowUi || rowUi.input) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeRowUiToTrigger();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    moveMenuFocus(e.key === "ArrowDown" ? 1 : -1);
  }
});

// A target detached by the row handler (e.g. Delete swapping in the confirmation) is not outside.
document.addEventListener("click", (e) => {
  if (rowUi && !rowUi.input && e.target.isConnected && !e.target.closest(".diagram-row-menu, .diagram-row-actions")) closeRowUi();
});

diagramNewEl.addEventListener("click", () => {
  const created = createDiagram("Untitled", "");
  if (created.status === "quota") {
    showToast(STORAGE_FULL_TEXT);
    return;
  }
  openDiagramById(created.id);
});

diagramCollapseEl.addEventListener("click", () => {
  const collapsed = !diagramListEl.classList.contains("collapsed");
  setSidebarCollapsed(collapsed);
  try {
    if (collapsed) localStorage.setItem(SIDEBAR_KEY, "1");
    else localStorage.removeItem(SIDEBAR_KEY);
  } catch (err) {
    // preference only; the sidebar still toggles for this session
  }
});

document.addEventListener("diagrams:changed", renderDiagramList);
window.addEventListener("storage", (e) => {
  if (e.key === LIBRARY_KEY || e.key === null) handleExternalLibraryChange();
});
setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
