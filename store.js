const NOTES_KEY = 'notes';
const TAB_META_KEY = 'tabMeta';

export const RETENTION_DAYS = 14;
const DAY_MS = 86400000;

export async function getAllNotes() {
  const data = await chrome.storage.local.get(NOTES_KEY);
  return data[NOTES_KEY] || {};
}

export async function setAllNotes(notes) {
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
}

export async function getNote(key) {
  return (await getAllNotes())[key] || null;
}

export async function upsertNote(record) {
  const notes = await getAllNotes();
  notes[record.key] = record;
  await setAllNotes(notes);
  return record;
}

export async function deleteNote(key) {
  const notes = await getAllNotes();
  if (!(key in notes)) return false;
  delete notes[key];
  await setAllNotes(notes);
  return true;
}

export async function purgeExpired(now = Date.now()) {
  const notes = await getAllNotes();
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  let removed = 0;
  for (const [key, rec] of Object.entries(notes)) {
    if (rec.status === 'closed' && rec.closedAt && rec.closedAt < cutoff) {
      delete notes[key];
      removed++;
    }
  }
  if (removed) await setAllNotes(notes);
  return removed;
}

export async function getTabMeta() {
  const data = await chrome.storage.session.get(TAB_META_KEY);
  return data[TAB_META_KEY] || {};
}

export async function setTabMeta(meta) {
  await chrome.storage.session.set({ [TAB_META_KEY]: meta });
}