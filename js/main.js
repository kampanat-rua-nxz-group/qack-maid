// Boot: restore autosaved Source (else the flowchart Example) and Render once.

// restore autosaved source, else load a default example
const saved = localStorage.getItem(STORAGE_KEY);
sourceEl.value = saved !== null && saved !== "" ? saved : EXAMPLES.flowchart;
render();
