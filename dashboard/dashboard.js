import { getAllNotes, deleteNote, getTabMeta, RETENTION_DAYS } from '../store.js';

const $ = (sel) => document.querySelector(sel);

const state = { view: 'open', q: '', unannotatedOnly: false };

const rel = (ts) => {
  if (!ts) return '—';
  const s = Date.now() - ts;
  if (s < 45000) return 'just now';
  const m = Math.round(s / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 8) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const abs = (ts) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
};

const favUrl = (url) =>
  `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function titleCell(url, title, winIndex) {
  const td = el('td', 'title');
  const wrap = el('div', 'tt');
  const img = document.createElement('img');
  img.className = 'fav';
  img.width = 16;
  img.height = 16;
  img.alt = '';
  img.src = favUrl(url);
  wrap.append(img);
  const strong = el('strong', null, title || url);
  strong.title = title || url;
  wrap.append(strong);
  if (winIndex > 0) {
    const chip = el('span', 'winchip', `W${winIndex + 1}`);
    chip.title = `Window ${winIndex + 1}`;
    wrap.append(chip);
  }
  td.append(wrap);
  return td;
}

function noteCell(rec) {
  const td = el('td', 'note');
  if (rec) {
    const chip = el('span', 'notechip', rec.note);
    chip.title = `${rec.note}\n— noted ${abs(rec.noteUpdatedAt)}`;
    td.append(chip, el('span', 'notemeta', `noted ${rel(rec.noteUpdatedAt)}`));
  } else {
    td.append(el('span', 'muted', '—'));
  }
  return td;
}

function timeCell(ts, title) {
  const td = el('td', 'time', rel(ts));
  if (ts && title) td.title = title;
  return td;
}

function actionsCell(buttons) {
  const td = el('td', 'actions');
  for (const { label, cls, title, onClick } of buttons) {
    const btn = el('button', `act${cls ? ` ${cls}` : ''}`, label);
    if (title) btn.title = title;
    btn.addEventListener('click', onClick);
    td.append(btn);
  }
  return td;
}

function headCells(names) {
  const thead = $('#thead');
  thead.replaceChildren();
  const tr = el('tr');
  for (const name of names) tr.append(el('th', null, name));
  thead.append(tr);
}

async function renderOpen() {
  const [notes, meta, tabs] = await Promise.all([
    getAllNotes(),
    getTabMeta(),
    chrome.tabs.query({}),
  ]);
  const openNoteByTab = new Map(
    Object.values(notes)
      .filter((n) => n.status === 'open')
      .map((n) => [n.tabId, n])
  );
  const windowIds = [...new Set(tabs.map((t) => t.windowId))].sort((a, b) => a - b);
  const winIndex = new Map(windowIds.map((id, i) => [id, i]));

  let rows = tabs
    .filter((t) => !t.url?.startsWith('chrome-extension://'))
    .map((t) => ({
      tab: t,
      rec: openNoteByTab.get(t.id) || null,
      createdAt: meta[t.id]?.createdAt ?? null,
      winIndex: winIndex.get(t.windowId) ?? 0,
    }));

  const q = state.q.toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      `${r.tab.title ?? ''} ${r.rec?.note ?? ''} ${r.tab.url ?? ''}`.toLowerCase().includes(q)
    );
  }
  if (state.unannotatedOnly) rows = rows.filter((r) => !r.rec);

  rows.sort((a, b) => {
    if (!!a.rec !== !!b.rec) return a.rec ? -1 : 1;
    if (a.rec && b.rec) return (b.rec.noteUpdatedAt || 0) - (a.rec.noteUpdatedAt || 0);
    return a.winIndex - b.winIndex || a.tab.index - b.tab.index;
  });

  headCells(['Tab', 'Note', 'Domain', 'Opened', '']);

  const tbody = $('#rows');
  tbody.replaceChildren();

  for (const r of rows) {
    const tr = el('tr', r.rec ? null : 'unannotated');
    tr.append(titleCell(r.tab.url, r.tab.title, r.winIndex));
    tr.append(noteCell(r.rec));
    tr.append(el('td', 'domain', domainOf(r.tab.url)));
    tr.append(timeCell(r.createdAt, r.createdAt ? `Opened ${abs(r.createdAt)}` : ''));
    tr.append(
      actionsCell([
        {
          label: 'Focus ↗',
          title: 'Switch to this tab',
          onClick: async () => {
            await chrome.tabs.update(r.tab.id, { active: true });
            await chrome.windows.update(r.tab.windowId, { focused: true });
          },
        },
        {
          label: 'Copy link',
          onClick: async (e) => {
            await navigator.clipboard.writeText(r.tab.url);
            flash(e.target, 'Copied ✓');
          },
        },
      ])
    );
    tbody.append(tr);
  }
  return rows;
}

async function renderArchive() {
  const notes = await getAllNotes();
  let rows = Object.values(notes).filter((n) => n.status === 'closed');

  const q = state.q.toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      `${r.title ?? ''} ${r.note ?? ''} ${r.url ?? ''}`.toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

  headCells(['Tab', 'Note', 'Domain', 'Opened', 'Closed', '']);

  const tbody = $('#rows');
  tbody.replaceChildren();

  for (const rec of rows) {
    const tr = el('tr');
    tr.append(titleCell(rec.url, rec.title, 0));
    tr.append(noteCell(rec));
    tr.append(el('td', 'domain', domainOf(rec.url)));
    tr.append(timeCell(rec.createdAt, rec.createdAt ? `Opened ${abs(rec.createdAt)}` : ''));
    tr.append(timeCell(rec.closedAt, rec.closedAt ? `Closed ${abs(rec.closedAt)}` : ''));
    tr.append(
      actionsCell([
        {
          label: 'Open ↗',
          title: 'Open this link in a new tab',
          onClick: () => chrome.tabs.create({ url: rec.url, active: false }),
        },
        {
          label: 'Copy link',
          onClick: async (e) => {
            await navigator.clipboard.writeText(rec.url);
            flash(e.target, 'Copied ✓');
          },
        },
        {
          label: 'Delete',
          cls: 'danger',
          onClick: async () => {
            if (confirm(`Delete the note for “${rec.title || rec.url}”?`)) {
              await deleteNote(rec.key);
              render();
            }
          },
        },
      ])
    );
    tbody.append(tr);
  }
  return rows;
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 900);
}

async function render() {
  const rows = state.view === 'open' ? await renderOpen() : await renderArchive();
  const empty = $('#empty');
  $('#unannotatedWrap').style.display = state.view === 'open' ? '' : 'none';

  if (rows.length === 0) {
    $('#thead').replaceChildren();
    empty.classList.remove('hidden');
    if (state.view === 'open') {
      empty.replaceChildren(
        el('strong', null, state.q || state.unannotatedOnly ? 'No tabs match' : 'No open tabs'),
        el('span', null, 'Open a web page and jot why you opened it — it will show up here.')
      );
    } else {
      empty.replaceChildren(
        el('strong', null, 'Nothing archived yet'),
        el(
          'span',
          null,
          `Close a tab that has a note and it will be kept here for ${RETENTION_DAYS} days.`
        )
      );
    }
  } else {
    empty.classList.add('hidden');
  }

  if (state.view === 'open') {
    const withNotes = rows.filter((r) => r.rec).length;
    $('#stats').textContent = `${rows.length} open tab${rows.length === 1 ? '' : 's'} · ${withNotes} with notes`;
  } else {
    $('#stats').textContent = `${rows.length} archived · notes auto-delete after ${RETENTION_DAYS} days`;
  }
}

const debouncedRender = (() => {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  };
})();

$('#viewOpen').addEventListener('click', () => {
  state.view = 'open';
  $('#viewOpen').classList.add('active');
  $('#viewArchive').classList.remove('active');
  render();
});

$('#viewArchive').addEventListener('click', () => {
  state.view = 'archive';
  $('#viewArchive').classList.add('active');
  $('#viewOpen').classList.remove('active');
  render();
});

$('#search').addEventListener('input', (e) => {
  state.q = e.target.value.trim();
  render();
});

$('#unannotated').addEventListener('change', (e) => {
  state.unannotatedOnly = e.target.checked;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('#search')) {
    e.preventDefault();
    $('#search').focus();
  } else if (e.key === 'Escape' && document.activeElement === $('#search')) {
    $('#search').value = '';
    state.q = '';
    $('#search').blur();
    render();
  }
});

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local') debouncedRender();
});

chrome.tabs.onCreated.addListener(debouncedRender);
chrome.tabs.onRemoved.addListener(debouncedRender);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.title || change.url) debouncedRender();
});

render();