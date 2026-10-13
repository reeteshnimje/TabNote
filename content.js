(() => {
  if (window.top !== window) return;

  const MAX_NOTE = 44;
  const DAY = 86400000;

  const state = { note: null, noteUpdatedAt: 0 };
  let originalTitle = null;
  let lastPrefix = '';
  let observer = null;

  function buildPrefix() {
    if (!state.note) return '';
    let text = state.note.trim();
    if (!text) return '';
    if (text.length > MAX_NOTE) text = text.slice(0, MAX_NOTE - 1).trimEnd() + '…';
    let age = '';
    if (state.noteUpdatedAt) {
      const days = Math.floor((Date.now() - state.noteUpdatedAt) / DAY);
      if (days >= 1) age = `(${days}d) `;
    }
    return `📌 ${age}${text} — `;
  }

  // Keeps document.title = prefix + page title. If the page rewrites its own
  // title while a prefix is applied, the tail is adopted as the new page title.
  function refreshTitle() {
    const prefix = buildPrefix();
    const current = document.title;

    if (lastPrefix && current.startsWith(lastPrefix) && current !== lastPrefix + (originalTitle ?? '')) {
      originalTitle = current.slice(lastPrefix.length);
    }

    if (prefix) {
      if (originalTitle === null) {
        if (current.startsWith('📌 ') && current.includes(' — ')) {
          originalTitle = current.slice(current.lastIndexOf(' — ') + 3);
        } else {
          originalTitle = current;
        }
      }
      if (current !== prefix + originalTitle) document.title = prefix + originalTitle;
      lastPrefix = prefix;
    } else {
      if (originalTitle !== null && current !== originalTitle) document.title = originalTitle;
      lastPrefix = '';
    }
  }

  function observeTitle() {
    if (observer) return;
    const head = document.head || document.documentElement;
    if (!head) {
      window.addEventListener('DOMContentLoaded', observeTitle, { once: true });
      return;
    }
    observer = new MutationObserver(() => refreshTitle());
    observer.observe(head, { subtree: true, childList: true, characterData: true });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'note-updated') {
      state.note = msg.note ?? null;
      state.noteUpdatedAt = msg.noteUpdatedAt ?? state.noteUpdatedAt;
      refreshTitle();
    }
  });

  chrome.runtime
    .sendMessage({ type: 'hello' })
    .then((res) => {
      if (!res || res.error) return;
      state.note = res.note ?? null;
      state.noteUpdatedAt = res.noteUpdatedAt ?? 0;
      observeTitle();
      refreshTitle();
    })
    .catch(() => {});

  observeTitle();
})();