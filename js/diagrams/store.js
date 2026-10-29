// Diagram library storage in localStorage: an index plus one key per Diagram.
// Every structural write re-reads the index right before writing it; nothing
// is cached. Writes catch quota errors and report them as { status: "quota" }.
// Load time needs: shared.js, names.js.

const STARTER_SOURCE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do thing]
    B -->|No| D[Skip]
    C --> E[End]
    D --> E`;

function isQuotaError(err) {
  return !!err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

function newDiagramId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Writer id of this page load, stored in every body this tab writes. A save
// compares the stored (rev, tab) pair with the pair this tab last read or wrote,
// so two tabs that both write rev N+1 are still told apart.
const TAB_ID = newDiagramId();

// Parsed index items, or null when the index is absent or unreadable.
function readIndexItems() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.items) ? parsed.items : null;
  } catch (err) {
    return null;
  }
}

function writeIndexItems(items) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ items }));
}

function readDiagramBody(id) {
  try {
    const body = JSON.parse(localStorage.getItem(DIAGRAM_KEY_PREFIX + id));
    if (body && typeof body.source === "string") {
      return {
        source: body.source,
        rev: Number.isFinite(body.rev) ? body.rev : 1,
        tab: typeof body.tab === "string" ? body.tab : undefined, // absent in older data
      };
    }
  } catch (err) {
    // unreadable body: treated as missing
  }
  return null;
}

// Items for a write. A present but unreadable index is rebuilt first, so the
// write cannot replace it and orphan every other Diagram.
function itemsForWrite(now) {
  if (readIndexItems() === null && localStorage.getItem(LIBRARY_KEY) !== null) rebuildIndex(now);
  return readIndexItems() || [];
}

function createDiagram(name, source, now = new Date()) {
  const id = newDiagramId();
  let finalName;
  try {
    const items = itemsForWrite(now);
    finalName = uniqueName(name, items.map((i) => i.name), now);
    localStorage.setItem(DIAGRAM_KEY_PREFIX + id, JSON.stringify({ source, rev: 1, tab: TAB_ID }));
    writeIndexItems([...items, { id, name: finalName, updatedAt: now.getTime() }]);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    localStorage.removeItem(DIAGRAM_KEY_PREFIX + id);
    return { status: "quota" };
  }
  return { status: "ok", id, name: finalName };
}

// Rebuild a broken index from the diagram keys. Never deletes a diagram key.
function rebuildIndex(now) {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(DIAGRAM_KEY_PREFIX)) continue;
    const name = uniqueName("Recovered", items.map((it) => it.name), now);
    items.push({ id: key.slice(DIAGRAM_KEY_PREFIX.length), name, updatedAt: now.getTime() });
  }
  writeIndexItems(items);
}

// The legacy key is an inbox: whenever a usable index exists, a leftover legacy
// Source is imported as its own Diagram and the key is removed only after that
// write succeeds. On quota the key stays and the next load retries.
function importLegacyKey(now) {
  const legacy = localStorage.getItem(LEGACY_SOURCE_KEY);
  if (legacy === null) return;
  if (createDiagram("Untitled", legacy, now).status === "ok") localStorage.removeItem(LEGACY_SOURCE_KEY);
}

function ensureLibrary(now = new Date()) {
  try {
    if (readIndexItems() === null && localStorage.getItem(LIBRARY_KEY) !== null) rebuildIndex(now);
    if (readIndexItems() !== null) {
      importLegacyKey(now);
      return { status: "ok" };
    }
    const legacy = localStorage.getItem(LEGACY_SOURCE_KEY);
    const source = legacy !== null ? legacy : STARTER_SOURCE;
    const result = createDiagram("Untitled", source, now);
    if (result.status === "quota") return { status: "quota", legacySource: source };
    if (legacy !== null) localStorage.removeItem(LEGACY_SOURCE_KEY);
    return { status: "ok" };
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { status: "quota", legacySource: localStorage.getItem(LEGACY_SOURCE_KEY) || "" };
  }
}

function listDiagrams() {
  return (readIndexItems() || [])
    .map((i) => ({ id: i.id, name: i.name, updatedAt: i.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function readDiagram(id) {
  const item = (readIndexItems() || []).find((i) => i.id === id);
  const body = readDiagramBody(id);
  if (!item || !body) return null;
  return { id, name: item.name, source: body.source, rev: body.rev, tab: body.tab, updatedAt: item.updatedAt };
}

// Forks instead of overwriting when another tab changed or deleted the stored
// Diagram since this tab last read or wrote it (rev mismatch or missing).
// The index is written before the body: if the index write hits quota nothing
// changed, and if the body write hits quota only updatedAt moved. Either way
// the caller keeps a rev that matches storage, so it never forks its own Diagram.
function saveSource(open, source, now = new Date()) {
  let items;
  try {
    items = itemsForWrite(now);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { status: "quota" };
  }
  const body = readDiagramBody(open.id);
  if (!body || body.rev !== open.rev || body.tab !== open.tab || !items.some((i) => i.id === open.id)) {
    const created = createDiagram(open.name, source, now);
    if (created.status !== "ok") return { status: "quota" };
    return { status: "forked", id: created.id, name: created.name, rev: 1, tab: TAB_ID };
  }
  const rev = open.rev + 1;
  try {
    writeIndexItems(items.map((i) => (i.id === open.id ? { ...i, updatedAt: now.getTime() } : i)));
    localStorage.setItem(DIAGRAM_KEY_PREFIX + open.id, JSON.stringify({ source, rev, tab: TAB_ID }));
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { status: "quota" };
  }
  return { status: "saved", rev, tab: TAB_ID };
}

function getOpenId() {
  return localStorage.getItem(OPEN_KEY);
}

function setOpenId(id) {
  try {
    localStorage.setItem(OPEN_KEY, id);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
  }
}

function duplicateDiagram(id, now = new Date()) {
  const original = readDiagram(id);
  if (!original) return { status: "missing" };
  const result = createDiagram(original.name, original.source, now);
  return result.status === "ok" ? { status: "ok", id: result.id, name: result.name } : result;
}

// Keeps updatedAt, so renaming never reorders the list.
function renameDiagram(id, name, now = new Date()) {
  const trimmed = name.trim();
  const items = readIndexItems() || [];
  const current = items.find((i) => i.id === id);
  if (!current || !trimmed || trimmed === current.name) return { status: "unchanged" };
  const others = items.filter((i) => i.id !== id).map((i) => i.name);
  const finalName = uniqueName(trimmed, others, now);
  try {
    writeIndexItems(items.map((i) => (i.id === id ? { ...i, name: finalName } : i)));
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { status: "quota" };
  }
  return { status: "ok", name: finalName };
}

// Removes the index entry first, so a failure leaves at worst an orphan body.
// Deleting the last Diagram writes its replacement first, so a full store
// changes nothing and the list is never empty.
function deleteDiagram(id) {
  const items = readIndexItems() || [];
  const remaining = items.filter((i) => i.id !== id);
  if (remaining.length === 0) return replaceLastDiagram(id);
  try {
    writeIndexItems(remaining);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { status: "quota" };
  }
  localStorage.removeItem(DIAGRAM_KEY_PREFIX + id);
  const newest = remaining.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return { status: "ok", nextId: newest.id };
}

function replaceLastDiagram(id) {
  const nextId = newDiagramId();
  try {
    localStorage.setItem(DIAGRAM_KEY_PREFIX + nextId, JSON.stringify({ source: "", rev: 1, tab: TAB_ID }));
    writeIndexItems([{ id: nextId, name: "Untitled", updatedAt: Date.now() }]);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    localStorage.removeItem(DIAGRAM_KEY_PREFIX + nextId);
    return { status: "quota" };
  }
  localStorage.removeItem(DIAGRAM_KEY_PREFIX + id);
  return { status: "ok", nextId };
}
