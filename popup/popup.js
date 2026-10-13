const $ = (sel) => document.querySelector(sel);

let tab = null;

function isUnsupported(url) {
  return !url || /^(chrome|edge|brave|about|chrome-extension|devtools|view-source|moz-extension):/.test(url);
}

function relTime(ts) {
  if (!ts) return '';
  const s = Date.now() - ts;
  if (s < 45000) return 'just now';
  const m = Math.round(s / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 8) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function setHeader(t) {
  $('#tabHeader').classList.remove('hidden');
  if (!t) return;
  $('#fav').src = `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(t.url)}&size=32`;
  $('#tabTitle').textContent = t.title || '';
  $('#tabTitle').title = t.title || '';
  $('#tabDomain').textContent = safeHost(t.url);
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || isUnsupported(tab.url)) {
    $('#tabHeader').classList.remove('hidden');
    $('#composer').classList.add('hidden');
    $('#unsupported').classList.remove('hidden');
    if (tab) setHeader(tab);
    return;
  }

  setHeader(tab);

  const res = await chrome.runtime.sendMessage({ type: 'getState', tabId: tab.id });
  if (res?.note) {
    $('#note').value = res.note;
    $('#noteMeta').textContent = `noted ${relTime(res.noteUpdatedAt)}`;
    $('#clearBtn').classList.remove('hidden');
    $('#saveBtn').textContent = 'Update note';
  }

  autosize();
  $('#note').focus();
  $('#note').select();
}

function autosize() {
  const el = $('#note');
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
}

async function save() {
  const text = $('#note').value.trim();
  if (!text) {
    $('#note').focus();
    return;
  }
  const btn = $('#saveBtn');
  btn.disabled = true;
  const res = await chrome.runtime.sendMessage({ type: 'capture', tabId: tab.id, note: text });
  if (res?.ok) {
    btn.textContent = 'Saved ✓';
    $('#noteMeta').textContent = 'shown on the tab';
    setTimeout(() => window.close(), 500);
  } else {
    btn.disabled = false;
    $('#noteMeta').textContent =
      res?.reason === 'unsupported-url' ? "This page can't be annotated." : 'Something went wrong — try again.';
  }
}

$('#note').addEventListener('input', autosize);

$('#note').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    save();
  } else if (e.key === 'Escape') {
    window.close();
  }
});

$('#saveBtn').addEventListener('click', save);

$('#clearBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear', tabId: tab.id });
  $('#note').value = '';
  autosize();
  $('#saveBtn').textContent = 'Save note';
  $('#clearBtn').classList.add('hidden');
  $('#noteMeta').textContent = 'note cleared';
  $('#note').focus();
});

$('#dashBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

init();