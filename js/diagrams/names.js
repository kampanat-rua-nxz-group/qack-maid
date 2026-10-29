// Diagram naming: local-time stamps and case-insensitive unique names.
// Load time needs: nothing.

function formatStamp(date, withSeconds) {
  const p = (n) => String(n).padStart(2, "0");
  const day = date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate());
  const time = p(date.getHours()) + ":" + p(date.getMinutes());
  return day + " " + time + (withSeconds ? ":" + p(date.getSeconds()) : "");
}

function uniqueName(desired, takenNames, now) {
  const norm = (s) => s.trim().toLowerCase();
  const taken = new Set(takenNames.map(norm));
  const base = desired.trim() || "Untitled";
  if (!taken.has(norm(base))) return base;
  const minute = base + " " + formatStamp(now, false);
  if (!taken.has(norm(minute))) return minute;
  const seconds = base + " " + formatStamp(now, true);
  if (!taken.has(norm(seconds))) return seconds;
  let n = 2;
  while (taken.has(norm(seconds + " " + n))) n++;
  return seconds + " " + n;
}

function relativeTime(then, now) {
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days < 2) return "yesterday";
  if (days < 7) return days + " days ago";
  return formatStamp(new Date(then), false).slice(0, 10);
}

// Export file name: lowercase, runs of non-letters/marks/digits become one "-".
// \p{M} keeps Thai vowels and tone marks, which are combining marks.
function kebabFileName(name) {
  const stem = String(name).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return (stem || "diagram") + ".png";
}
