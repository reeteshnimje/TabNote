import {
  getAllNotes,
  setAllNotes,
  getNote,
  upsertNote,
  deleteNote,
  purgeExpired,
  getTabMeta,
  setTabMeta,
} from './store.js';

const PURGE_ALARM = 'tabnote-purge';

const now = () => Date.now();

const makeKey = () =>
  `k_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function isInternalUrl(url) {
  return !url || !/^(https?|file):/.test(url);
}

async function ensureTabRecorded(tabId) {
  const meta = await getTabMeta();
  if (!meta[tabId]) {
    meta[tabId] = { createdAt: now() };
    await setTabMeta(meta);
  }
  return meta[tabId];
}

function notifyTab(tabId, note, noteUpdatedAt) {
  chrome.tabs
    .sendMessage(tabId, { type: 'note-updated', note, noteUpdatedAt })
    .catch(() => {});
}

async function getState(tabId) {
  const meta = await getTabMeta();
  const key = meta[tabId]?.key;
  if (!key) return { note: null, noteUpdatedAt: 0, tabKey: null };
  const rec = await getNote(key);
  if (rec && rec.status === 'open') {
    return { note: rec.note, noteUpdatedAt: rec.noteUpdatedAt, tabKey: key };
  }
  return { note: null, noteUpdatedAt: 0, tabKey: key };
}

async function captureNote(tabId, text) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, reason: 'tab-gone' };
  }
  if (isInternalUrl(tab.url)) return { ok: false, reason: 'unsupported-url' };

  const meta = await getTabMeta();
  const t = meta[tabId] || (meta[tabId] = { createdAt: now() });
  if (!t.key) t.key = makeKey();
  t.windowId = tab.windowId;
  t.index = tab.index;
  await setTabMeta(meta);

  const notes = await getAllNotes();
  const prev = notes[t.key];
  const rec = {
    key: t.key,
    tabId,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title || tab.url,
    note: text,
    createdAt: prev?.createdAt ?? t.createdAt ?? now(),
    noteUpdatedAt: now(),
    status: 'open',
  };
  notes[t.key] = rec;
  await setAllNotes(notes);
  notifyTab(tabId, rec.note, rec.noteUpdatedAt);
  return { ok: true, record: rec };
}

async function clearNote(tabId) {
  const meta = await getTabMeta();
  const key = meta[tabId]?.key;
  if (key) {
    await deleteNote(key);
    notifyTab(tabId, null, 0);
  }
  return { ok: true };
}

// Re-links open notes to the tabs of the current browser session. A note whose
// tab is gone is archived (never deleted), so restarts lose nothing.
async function reconcile(reason) {
  await purgeExpired();
  const notes = await getAllNotes();
  const tabs = await chrome.tabs.query({});
  const meta = await getTabMeta();

  const fresh = {};
  for (const t of tabs) {
    fresh[t.id] = {
      createdAt: meta[t.id]?.createdAt ?? now(),
      windowId: t.windowId,
      index: t.index,
      key: meta[t.id]?.key ?? null,
    };
  }
  const byUrl = new Map();
  for (const t of tabs) {
    if (t.url && !isInternalUrl(t.url) && !byUrl.has(t.url)) byUrl.set(t.url, t);
  }

  let dirty = false;
  const ts = now();
  for (const rec of Object.values(notes)) {
    if (rec.status !== 'open') continue;
    let t = rec.tabId != null ? fresh[rec.tabId] : null;
    if (!t) t = byUrl.get(rec.url) || null;
    if (t) {
      if (rec.tabId !== t.id || rec.windowId !== t.windowId) {
        rec.tabId = t.id;
        rec.windowId = t.windowId;
        dirty = true;
      }
      if (!fresh[t.id].key) fresh[t.id].key = rec.key;
    } else {
      rec.status = 'closed';
      rec.closedAt = ts;
      rec.tabId = null;
      rec.endReason = reason;
      dirty = true;
    }
  }
  if (dirty) await setAllNotes(notes);
  await setTabMeta(fresh);
}

chrome.runtime.onInstalled.addListener((details) => {
  reconcile(details?.reason === 'update' ? 'update' : 'install');
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(() => {
  reconcile('restart');
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PURGE_ALARM) purgeExpired();
});

chrome.tabs.onCreated.addListener((tab) => {
  ensureTabRecorded(tab.id);
});

chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.title && !change.url) return;
  const meta = await getTabMeta();
  const key = meta[tabId]?.key;
  if (!key) return;
  const rec = await getNote(key);
  if (!rec || rec.status !== 'open') return;
  let dirty = false;
  if (change.title && change.title !== rec.title) {
    rec.title = change.title;
    dirty = true;
  }
  if (change.url && change.url !== rec.url) {
    rec.url = change.url;
    dirty = true;
  }
  if (dirty) await upsertNote(rec);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const meta = await getTabMeta();
  const t = meta[tabId];
  delete meta[tabId];
  await setTabMeta(meta);
  if (t?.key) {
    const rec = await getNote(t.key);
    if (rec && rec.status === 'open') {
      rec.status = 'closed';
      rec.closedAt = now();
      rec.tabId = null;
      await upsertNote(rec);
    }
  }
});

chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const meta = await getTabMeta();
  if (meta[removedTabId]) {
    meta[addedTabId] = meta[removedTabId];
    delete meta[removedTabId];
    await setTabMeta(meta);
  }
  const notes = await getAllNotes();
  let dirty = false;
  for (const rec of Object.values(notes)) {
    if (rec.status === 'open' && rec.tabId === removedTabId) {
      rec.tabId = addedTabId;
      dirty = true;
    }
  }
  if (dirty) await setAllNotes(notes);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'hello': {
        const tabId = sender.tab?.id;
        if (tabId == null) return { note: null, noteUpdatedAt: 0, tabKey: null };
        return getState(tabId);
      }
      case 'capture':
        return captureNote(msg.tabId, String(msg.note ?? '').trim());
      case 'clear':
        return clearNote(msg.tabId);
      case 'getState':
        return getState(msg.tabId);
      default:
        return null;
    }
  })()
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, reason: 'error' }));
  return true;
});