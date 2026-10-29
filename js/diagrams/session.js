// The open Diagram: boot, switching, and autosave of Source.
// Load time needs: shared.js, store.js. Runtime calls: render().

// id null means temporary legacy mode (storage full at boot).
let openDiagram = { id: null, name: "Untitled", rev: 0 };

// True after an autosave hit a full store and until one succeeds: the text in
// Source is not stored anywhere, so another tab's delete must not replace it.
let unsavedEdit = false;

function notifyDiagramsChanged() {
  document.dispatchEvent(new CustomEvent("diagrams:changed"));
}

function showDiagram(diagram) {
  sourceEl.value = diagram.source;
  openDiagram = { id: diagram.id, name: diagram.name, rev: diagram.rev, tab: diagram.tab };
  setOpenId(diagram.id);
  unsavedEdit = false;
}

// Returns false when the switch is refused. An unsaved edit is saved first; if
// the store is still full the text stays in Source (spec: anti-goal, no lost text).
function openDiagramById(id) {
  const diagram = readDiagram(id);
  if (!diagram) return false;
  if (unsavedEdit) {
    autosaveSource();
    if (unsavedEdit) return false;
  }
  showDiagram(diagram);
  notifyDiagramsChanged();
  render();
  return true;
}

// Opens the Diagram open last, else the first readable one, else a new starter.
// Unreadable entries are skipped, never deleted.
function bootDiagrams() {
  const library = ensureLibrary();
  if (library.status === "quota") {
    openDiagram = { id: null, name: "Untitled", rev: 0 };
    sourceEl.value = library.legacySource;
    showToast(STORAGE_FULL_TEXT);
    return;
  }
  const items = listDiagrams();
  const lastId = getOpenId();
  const ordered = [...items.filter((i) => i.id === lastId), ...items.filter((i) => i.id !== lastId)];
  for (const item of ordered) {
    const diagram = readDiagram(item.id);
    if (diagram) {
      showDiagram(diagram);
      return;
    }
  }
  const created = createDiagram("Untitled", STARTER_SOURCE);
  if (created.status === "ok") {
    showDiagram(readDiagram(created.id));
  } else {
    openDiagram = { id: null, name: "Untitled", rev: 0 };
    sourceEl.value = STARTER_SOURCE;
    showToast(STORAGE_FULL_TEXT);
  }
}

// Temporary mode: keep Source under the legacy key so the next load retries
// the migration. A full store is expected here, so the failure only warns.
function autosaveLegacySource() {
  try {
    localStorage.setItem(LEGACY_SOURCE_KEY, sourceEl.value);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    showToast(STORAGE_FULL_TEXT);
  }
}

function autosaveSource() {
  if (openDiagram.id === null) return autosaveLegacySource();
  const result = saveSource(openDiagram, sourceEl.value);
  if (result.status === "quota") {
    // Source stays as typed and the rev is kept, so the next input retries.
    unsavedEdit = true;
    showToast(STORAGE_FULL_TEXT);
    return;
  }
  unsavedEdit = false;
  if (result.status === "saved") {
    openDiagram = { ...openDiagram, rev: result.rev, tab: result.tab };
    notifyDiagramsChanged();
  } else if (result.status === "forked") {
    // Source stays as typed; only the target Diagram changes.
    openDiagram = { id: result.id, name: result.name, rev: result.rev, tab: result.tab };
    setOpenId(result.id);
    notifyDiagramsChanged();
    showToast('Changed in another tab. Saved your edits as "' + result.name + '".');
  }
}

// Another tab changed the library. Does not reload Source of a Diagram that
// still exists; this tab's next edit forks (spec: Several tabs open).
function handleExternalLibraryChange() {
  const items = listDiagrams();
  const current = items.find((i) => i.id === openDiagram.id);
  if (openDiagram.id !== null && !current && items.length > 0 && !unsavedEdit) {
    openDiagramById(items[0].id);
    return;
  }
  if (current && current.name !== openDiagram.name) openDiagram = { ...openDiagram, name: current.name };
  notifyDiagramsChanged();
}
