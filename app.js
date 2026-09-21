/* Collector — application (vanilla, no dependencies) */
(function () {
  const VISIBILITY_LABELS = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };
  const CATEGORY_PRESETS = [
    'Painting',
    'Sculpture',
    'Print',
    'Drawing',
    'Photograph',
    'Ceramic',
    'Furniture',
    'Textile',
    'Jewelry',
    'Misc',
  ];
  const ERA_PRESETS = [
    'Antiquity',
    'Medieval',
    'Renaissance',
    'Baroque',
    'Rococo',
    'Neoclassical',
    'Romanticism',
    'Victorian',
    'Impressionism',
    'Post-Impressionism',
    'Early Modern',
    'Modernism',
    'Post-War',
    'Contemporary',
    'Emerging',
  ];
  const STYLE_PRESETS = [
    'Old Master',
    'Academic',
    'Realism',
    'Impressionism',
    'Post-Impressionism',
    'Symbolism',
    'Art Nouveau',
    'Fauvism',
    'Expressionism',
    'Cubism',
    'Futurism',
    'Dada',
    'Art Deco',
    'Surrealism',
    'Abstract Expressionism',
    'Color Field',
    'Pop Art',
    'Op Art',
    'Minimalism',
    'Conceptual Art',
    'Photorealism',
    'Neo-Expressionism',
    'Street Art',
    'Digital Art',
  ];
  const YEAR_START = 1600;

  function presetOptions(presets, current) {
    const items =
      presets.includes(current) || current === ''
        ? presets
        : [current, ...presets];
    return items
      .map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`)
      .join('');
  }

  function yearOptions(current) {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now; y >= YEAR_START; y--) list.push(String(y));
    const cur = String(current);
    if (cur && !list.includes(cur)) list.push(cur);
    return list
      .map((y) => `<option value="${esc(y)}"${y === cur ? ' selected' : ''}>${esc(y)}</option>`)
      .join('');
  }

  const state = {
    view: 'gallery', // gallery | set | form | detail
    artworks: [],
    sets: [],
    urls: new Map(), // id -> array of object URLs (index 0 = cover)
    thumbs: new Map(), // id -> array of thumbnail URLs (poster for videos)
    filters: { query: '', artist: '', category: '', era: '', style: '', color: '' },
    filterOpen: false,
    activeId: null,
    activeSetId: null, // set currently being viewed (view === 'set')
    formSetId: null, // set a new artwork belongs to (set when opened from a set)
    notice: '',
    selecting: false,
    selected: new Set(), // keys like 'a:123' or 's:45'
  };

  /* ---------------- theme (dark / light) ---------------- */

  const THEME_KEY = 'collector_theme';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function themeIcon() {
    if (currentTheme() === 'light') {
      return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/></svg>';
  }

  function themeTitle() {
    return currentTheme() === 'light' ? 'Dark mode' : 'Light mode';
  }

  function applyTheme(t) {
    const next = t === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#e9ebef' : '#08080a';
    for (const b of document.querySelectorAll('#btn-theme, #set-theme')) {
      b.innerHTML = themeIcon();
      b.title = next === 'light' ? 'Dark mode' : 'Light mode';
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  }

  function activeSet() {
    return state.sets.find((s) => s.id === state.activeSetId) || null;
  }

  const form = {
    images: [], // working set of media blobs, photo or video (index 0 = cover)
    vurls: [], // matching preview object URLs (poster for videos)
    murls: [], // playable object URLs for video items, null for photos
    posters: [], // parallel to images: poster blob for videos, null otherwise
    durations: [], // parallel to images: seconds for videos, null otherwise
    palette: [],
    titleTouched: false,
  };

  const detail = {
    index: 0,
  };

  const root = document.getElementById('root');

  const APP_VERSION = 'v31';

  function imgs(a) {
    const list = Array.isArray(a.images) && a.images.length ? a.images : [a.image];
    return list.filter(Boolean);
  }

  /* ---------------- video ----------------
     Media model: `images` holds every blob (photo or video, index 0 = cover).
     `posters` and `durations` run parallel to it — a JPEG thumbnail blob and a
     seconds number for video items, null for photos. */

  const MAX_VIDEO_SEC = 30;
  const MAX_PUBLISH_VIDEO_BYTES = 50 * 1024 * 1024;

  function isVideo(b) {
    return b instanceof Blob && typeof b.type === 'string' && b.type.startsWith('video/');
  }

  function mediaExt(b) {
    if (!isVideo(b)) return 'jpg';
    const t = (b.type || '').toLowerCase();
    if (t.includes('quicktime')) return 'mov';
    if (t.includes('webm')) return 'webm';
    if (t.includes('3gpp')) return '3gp';
    return 'mp4';
  }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function postersOf(a) {
    return Array.isArray(a.posters) ? a.posters : [];
  }

  function durationsOf(a) {
    return Array.isArray(a.durations) ? a.durations : [];
  }

  // First blob the palette extractor can read: a photo, else a video poster.
  function paletteSource(a) {
    const list = imgs(a);
    return (
      list.find((b) => b instanceof Blob && b.size && !isVideo(b)) ||
      postersOf(a).find((b) => b instanceof Blob && b.size) ||
      null
    );
  }

  // Duration + a JPEG poster frame (~10% in, avoids black first frames).
  function probeVideo(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      let settled = false;
      const done = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        v.removeAttribute('src');
        try { v.load(); } catch {}
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new Error('Could not read that video.'))), 15000);
      const fail = () => done(() => reject(new Error('Could not read that video.')));
      v.onerror = fail;
      const beginSeek = (dur) => {
        if (!Number.isFinite(dur) || dur <= 0) { fail(); return; }
        const at = Math.min(Math.max(dur * 0.1, 0.1), Math.max(dur - 0.1, 0.1));
        v.onseeked = () => {
          try {
            const w = v.videoWidth || 640, h = v.videoHeight || 360;
            const s = Math.min(1, 640 / Math.max(w, h));
            const c = document.createElement('canvas');
            c.width = Math.max(2, Math.round(w * s));
            c.height = Math.max(2, Math.round(h * s));
            c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
            c.toBlob((p) => done(() => (p ? resolve({ duration: dur, poster: p }) : reject(new Error('Could not read that video.')))), 'image/jpeg', 0.82);
          } catch (e) { done(() => reject(e)); }
        };
        try { v.currentTime = at; } catch { fail(); }
      };
      v.onloadedmetadata = () => {
        if (v.duration === Infinity) {
          // Some containers hide the duration until a seek forces it out.
          const onDur = () => {
            if (Number.isFinite(v.duration) && v.duration > 0) {
              v.removeEventListener('durationchange', onDur);
              beginSeek(v.duration);
            }
          };
          v.addEventListener('durationchange', onDur);
          try { v.currentTime = 1e7; } catch { fail(); }
          return;
        }
        beginSeek(v.duration);
      };
      v.src = url;
    });
  }

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(',');
    const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------------- selection + export ---------------- */

  function toggleSelecting() {
    state.selecting = !state.selecting;
    if (!state.selecting) state.selected.clear();
    render();
  }

  function toggleSelect(key) {
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    const bar = root.querySelector('.sel-count');
    if (bar) bar.textContent = `${state.selected.size} selected`;
    const empty = state.selected.size === 0;
    root.querySelectorAll('.sel-action').forEach((b) => (b.disabled = empty));
  }

  function getSelectedArtworks() {
    const ids = [];
    for (const k of state.selected) {
      if (k.startsWith('a:')) ids.push(Number(k.slice(2)));
    }
    return state.artworks.filter((a) => ids.includes(a.id));
  }

  function getSelectedSets() {
    const ids = [];
    for (const k of state.selected) {
      if (k.startsWith('s:')) ids.push(Number(k.slice(2)));
    }
    return state.sets.filter((s) => ids.includes(s.id));
  }

  function artToText(a) {
    const parts = [a.title || 'Untitled'];
    if (a.artist) parts.push(`by ${a.artist}`);
    if (a.year) parts.push(`(${a.year})`);
    if (a.era) parts.push(a.era);
    if (a.style) parts.push(a.style);
    if (a.category) parts.push(a.category);
    if (a.medium) parts.push(a.medium);
    if (a.dimensions) parts.push(a.dimensions);
    if (a.location) parts.push(`@ ${a.location}`);
    if (a.price != null) parts.push(`$${Number(a.price).toLocaleString()}`);
    return parts.join(' — ');
  }

  function artToXml(a) {
    const tag = (t, v) => v ? `<${t}>${esc(String(v))}</${t}>` : '';
    return `<artwork>\n${tag('title', a.title)}${tag('artist', a.artist)}${tag('year', a.year)}${tag('era', a.era)}${tag('style', a.style)}${tag('category', a.category)}${tag('medium', a.medium)}${tag('materials', a.materials)}${tag('dimensions', a.dimensions)}${tag('location', a.location)}${tag('edition', a.edition)}${tag('price', a.price)}${tag('notes', a.notes)}</artwork>`;
  }

  async function exportSelectedText() {
    const arts = getSelectedArtworks();
    const sets = getSelectedSets();
    let lines = [];
    if (sets.length) {
      lines.push('=== SETS ===');
      for (const s of sets) {
        const members = state.artworks.filter((a) => a.setId === s.id);
        lines.push(`\n${s.name} (${members.length} pieces)`);
        for (const a of members) lines.push(`  - ${artToText(a)}`);
      }
    }
    if (arts.length) {
      if (sets.length) lines.push('\n=== INDIVIDUAL PIECES ===');
      for (const a of arts) lines.push(artToText(a));
    }
    download(`collector-selected-${new Date().toISOString().slice(0, 10)}.txt`, new Blob([lines.join('\n')], { type: 'text/plain' }));
  }

  async function exportSelectedXml() {
    const arts = getSelectedArtworks();
    const sets = getSelectedSets();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<collection>\n';
    if (sets.length) {
      xml += '<sets>\n';
      for (const s of sets) {
        const members = state.artworks.filter((a) => a.setId === s.id);
        xml += `<set name="${esc(s.name)}">\n`;
        for (const a of members) xml += artToXml(a) + '\n';
        xml += '</set>\n';
      }
      xml += '</sets>\n';
    }
    if (arts.length) {
      xml += '<individual>\n';
      for (const a of arts) xml += artToXml(a) + '\n';
      xml += '</individual>\n';
    }
    xml += '</collection>';
    download(`collector-selected-${new Date().toISOString().slice(0, 10)}.xml`, new Blob([xml], { type: 'application/xml' }));
  }

  async function exportSelectedPdf() {
    const arts = getSelectedArtworks();
    const sets = getSelectedSets();
    const lines = [];
    if (sets.length) {
      lines.push({ text: 'SETS', bold: true });
      for (const s of sets) {
        const members = state.artworks.filter((a) => a.setId === s.id);
        lines.push({ text: `${s.name} (${members.length} pieces)`, bold: true });
        for (const a of members) lines.push({ text: '  ' + artToText(a) });
      }
      lines.push({ text: '' });
    }
    if (arts.length) {
      lines.push({ text: 'INDIVIDUAL PIECES', bold: true });
      for (const a of arts) lines.push({ text: artToText(a) });
    }
    const el = document.createElement('div');
    el.id = 'print-area';
    el.innerHTML = '<h1>Collector — Selected Items</h1>' + lines.map((l) => l.bold ? `<h3>${esc(l.text)}</h3>` : `<p>${esc(l.text)}</p>`).join('');
    el.style.cssText = 'display:none;font-family:sans-serif;padding:20px;color:#111';
    document.body.appendChild(el);
    el.style.display = 'block';
    window.print();
    setTimeout(() => el.remove(), 500);
  }

  async function shareSelected() {
    const arts = getSelectedArtworks();
    const sets = getSelectedSets();
    let text = 'Collector — Selected Items\n\n';
    if (sets.length) {
      text += 'SETS\n';
      for (const s of sets) {
        const members = state.artworks.filter((a) => a.setId === s.id);
        text += `\n${s.name} (${members.length} pieces)\n`;
        for (const a of members) text += `  - ${artToText(a)}\n`;
      }
    }
    if (arts.length) {
      if (sets.length) text += '\nINDIVIDUAL PIECES\n';
      for (const a of arts) text += artToText(a) + '\n';
    }

    // Attach the cover photo of every selected piece (and every member of selected sets).
    const seen = new Set();
    const pieces = [];
    for (const s of sets) for (const a of state.artworks) if (a.setId === s.id && !seen.has(a.id)) { seen.add(a.id); pieces.push(a); }
    for (const a of arts) if (!seen.has(a.id)) { seen.add(a.id); pieces.push(a); }
    const files = pieces.map((a) => coverFile(a)).filter(Boolean);

    await shareContent({ title: 'Collector Selection', subject: 'From my Collector catalog', text, files });
  }

  /* ---------------- sharing ---------------- */

  function safeName(s) {
    return (String(s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)) || 'artwork';
  }

  function toFile(blob, name) {
    if (!(blob instanceof Blob) || !blob.size) return null;
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  }

  function coverFile(a) {
    const b = imgs(a)[0];
    return toFile(b, safeName(a.title) + '.' + mediaExt(b));
  }

  function allFiles(a) {
    const list = imgs(a);
    return list.map((b, i) => toFile(b, safeName(a.title) + (list.length > 1 ? `-${i + 1}` : '') + '.' + mediaExt(b))).filter(Boolean);
  }

  // navigator.clipboard only exists on https; fall back to the legacy copy command.
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  // The iOS share sheet (navigator.share) is only exposed on https pages.
  function canNativeShare(files) {
    if (!navigator.share) return false;
    if (files.length) return !!(navigator.canShare && navigator.canShare({ files }));
    return true;
  }

  async function shareContent({ title, subject, text, files }) {
    files = (files || []).filter(Boolean);
    if (canNativeShare(files)) {
      try {
        await navigator.share(files.length ? { title, text, files } : { title, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user dismissed the sheet
      }
    }
    showShareSheet({ title, subject, text, files });
  }

  function showShareSheet({ title, subject, text, files }) {
    const overlay = document.createElement('div');
    overlay.className = 'name-overlay';
    const subj = encodeURIComponent(subject || title || 'From my Collector catalog');
    const body = encodeURIComponent(text || '');
    const n = files.length;
    overlay.innerHTML = `
      <div class="name-card" role="dialog" aria-modal="true" aria-label="Share">
        <h2>Share</h2>
        <div class="share-list">
          <a class="share-opt" id="share-sms" href="sms:&body=${body}">
            <span class="share-ico">💬</span><span>Messages<small>Sends the details as text</small></span>
          </a>
          <a class="share-opt" id="share-mail" href="mailto:?subject=${subj}&body=${body}">
            <span class="share-ico">✉️</span><span>Email<small>Sends the details as text</small></span>
          </a>
          ${n ? `<button class="share-opt" type="button" id="share-save">
            <span class="share-ico">🖼</span><span>Save photo${n > 1 ? 's' : ''}<small>${n > 1 ? n + ' photos' : 'Photo'} → Files, then share from there</small></span>
          </button>` : ''}
          <button class="share-opt" type="button" id="share-copy">
            <span class="share-ico">⎘</span><span>Copy details<small>Paste anywhere</small></span>
          </button>
        </div>
        <p class="share-note">Photos attach to Messages and Email automatically when the app is opened over https.</p>
        <div class="name-actions"><button class="ghost" id="share-close">Close</button></div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#share-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#share-sms').addEventListener('click', () => setTimeout(close, 300));
    overlay.querySelector('#share-mail').addEventListener('click', () => setTimeout(close, 300));
    overlay.querySelector('#share-copy').addEventListener('click', async () => {
      const ok = await copyText(text || '');
      close();
      alert(ok ? 'Copied.' : text);
    });
    overlay.querySelector('#share-save')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#share-save');
      btn.disabled = true;
      for (let i = 0; i < files.length; i++) {
        download(files[i].name, files[i]);
        if (i < files.length - 1) await new Promise((r) => setTimeout(r, 600));
      }
      close();
    });
  }

  /* ---------------- publish links ----------------
     A published "share" is a self-contained static page + JPEGs uploaded to a
     host. `Publisher` is the only thing that knows about the host (GitHub Pages
     for now); swap it for a real server later without touching the UI. */

  const GH_KEY = 'collector_gh';
  const LINKS_KEY = 'collector_links';

  function ghConfig() {
    try { return JSON.parse(localStorage.getItem(GH_KEY) || 'null'); } catch { return null; }
  }
  function saveGhConfig(c) { localStorage.setItem(GH_KEY, JSON.stringify(c)); }
  function savedLinks() {
    try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '[]'); } catch { return []; }
  }
  function saveLinks(list) { localStorage.setItem(LINKS_KEY, JSON.stringify(list)); }

  const GitHubPublisher = {
    name: 'GitHub Pages',
    configured() {
      const c = ghConfig();
      return !!(c && c.owner && c.repo && c.token);
    },
    base(c = ghConfig()) {
      const o = c.owner.toLowerCase(), r = c.repo.toLowerCase();
      return r === `${o}.github.io` ? `https://${o}.github.io/` : `https://${o}.github.io/${r}/`;
    },
    async api(method, path, body, cfg = ghConfig()) {
      const resp = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (resp.status === 204) return null;
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error(json.message || `GitHub error ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return json;
    },
    // Verifies the token can see the repo; returns { branch }.
    async check(cfg) {
      const repo = await this.api('GET', `/repos/${cfg.owner}/${cfg.repo}`, null, cfg);
      return { branch: repo.default_branch || 'main', isPrivate: !!repo.private };
    },
    async ensurePages(cfg) {
      try {
        await this.api('POST', `/repos/${cfg.owner}/${cfg.repo}/pages`, { source: { branch: cfg.branch || 'main', path: '/' } }, cfg);
        return true;
      } catch (e) {
        if (e.status === 409) return true; // already enabled
        return false; // token lacks Pages permission — user can enable it once in repo settings
      }
    },
    async putFile(path, base64, message) {
      const c = ghConfig();
      const call = () => this.api('PUT', `/repos/${c.owner}/${c.repo}/contents/${path}`, { message, content: base64, branch: c.branch || undefined }, c);
      try { return await call(); } catch (e) {
        if (e.status === 409 || e.status === 422) { await new Promise((r) => setTimeout(r, 1200)); return call(); }
        throw e;
      }
    },
    async deleteFolder(prefix) {
      const c = ghConfig();
      const walk = async (p) => {
        let items;
        try { items = await this.api('GET', `/repos/${c.owner}/${c.repo}/contents/${p}`, null, c); } catch (e) { if (e.status === 404) return; throw e; }
        for (const it of Array.isArray(items) ? items : [items]) {
          if (it.type === 'dir') await walk(it.path);
          else await this.api('DELETE', `/repos/${c.owner}/${c.repo}/contents/${it.path}`, { message: `Unpublish ${prefix}`, sha: it.sha, branch: c.branch || undefined }, c);
        }
      };
      await walk(prefix);
    },
  };

  const Publisher = GitHubPublisher;

  function randomId() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) s += chars[b % chars.length];
    return s;
  }

  // Re-encode to a web-friendly JPEG (max 1600px) before uploading.
  function toJpeg(blob, max = 1600, quality = 0.86) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const s = Math.min(1, max / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
        const w = Math.max(1, Math.round((im.naturalWidth || 1) * s));
        const h = Math.max(1, Math.round((im.naturalHeight || 1) * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        c.toBlob((b) => resolve(b || blob), 'image/jpeg', quality);
      };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      im.src = url;
    });
  }

  async function blobToBase64(blob) {
    const dataUrl = await blobToDataURL(blob);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  // Public fields only — notes, provenance, acquisition, location and visibility never leave the phone.
  function publicPiece(a, includePrices) {
    return {
      title: a.title || 'Untitled', artist: a.artist || '', year: a.year || '', era: a.era || '', style: a.style || '',
      category: a.category || '', medium: a.medium || '', materials: a.materials || '', dimensions: a.dimensions || '',
      edition: a.edition || '', tags: Array.isArray(a.tags) ? a.tags : [],
      price: includePrices && a.price != null && a.price !== '' ? `$${Number(a.price).toLocaleString()}` : '',
    };
  }

  function sharePageHTML({ title, groups, pageUrl, coverUrl }) {
    const total = groups.reduce((n, g) => n + g.pieces.length, 0);
    const desc = `${total} ${total === 1 ? 'piece' : 'pieces'} · shared from Collector`;
    const card = (p) => {
      const sub = [p.artist, p.year].filter(Boolean).join(', ');
      const line = [p.medium, p.materials, p.dimensions].filter(Boolean).join(' · ');
      const meta = [p.era, p.style, p.category, p.edition ? `Edition ${p.edition}` : ''].filter(Boolean).join(' · ');
      const shot = (m) => m.kind === 'video'
        ? `<video class="cover" src="${esc(m.src)}"${m.poster ? ` poster="${esc(m.poster)}"` : ''} preload="metadata" controls playsinline></video>`
        : `<a class="cover" href="${esc(m.src)}" data-lb><img src="${esc(m.src)}" alt="${esc(p.title)}" loading="lazy"></a>`;
      const mini = (m) => m.kind === 'video'
        ? `<span class="more-vid">▶${m.dur ? ` ${esc(fmtDur(m.dur))}` : ''}</span>`
        : `<a href="${esc(m.src)}" data-lb><img src="${esc(m.src)}" alt="" loading="lazy"></a>`;
      const media = p.media || [];
      const extra = media.slice(1).map(mini).join('');
      return `<figure class="card">
  ${shot(media[0])}
  ${extra ? `<div class="more">${extra}</div>` : ''}
  <figcaption>
    <b>${esc(p.title)}</b>
    ${sub ? `<span>${esc(sub)}</span>` : ''}
    ${line ? `<span class="dim">${esc(line)}</span>` : ''}
    ${meta ? `<span class="dim">${esc(meta)}</span>` : ''}
    ${p.tags.length ? `<span class="tags">${p.tags.map((t) => `<i>${esc(t)}</i>`).join('')}</span>` : ''}
    ${p.price ? `<span class="price">${esc(p.price)}</span>` : ''}
  </figcaption>
</figure>`;
    };
    const sections = groups.map((g) => `<section>${g.name ? `<h2>${esc(g.name)} <small>${g.pieces.length}</small></h2>` : ''}<div class="grid">${g.pieces.map(card).join('\n')}</div></section>`).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
${coverUrl ? `<meta property="og:image" content="${esc(coverUrl)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(coverUrl)}">` : ''}
<meta name="robots" content="noindex">
<style>
:root{--bg:#0c0e15;--elev:#141828;--border:#28304a;--text:#e8ecf4;--dim:#97a0b6;--accent:#dbe1e4}
*{box-sizing:border-box}html,body{margin:0}
body{background:linear-gradient(180deg,#0c0e15 0%,#161d30 100%) fixed;color:var(--text);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Inter,system-ui,sans-serif;padding:0 14px 60px}
header{max-width:1100px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 28px) 0 18px}
header h1{margin:0;font-size:22px;font-weight:600;letter-spacing:.02em}
header p{margin:6px 0 0;color:var(--dim);font-size:13px}
main{max-width:1100px;margin:0 auto}
section{margin:0 0 30px}
h2{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 12px}
h2 small{font-weight:400;letter-spacing:0;margin-left:6px;opacity:.7}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
@media(min-width:700px){.grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}}
.card{margin:0;min-width:0;background:var(--elev);border:1px solid var(--border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.cover{position:relative;aspect-ratio:1/1;overflow:hidden;background:#0a0c12}
figcaption{min-width:0;overflow-wrap:anywhere}
.card a{display:block}
.cover img{display:block;width:100%;height:100%;object-fit:cover}
.card video.cover{display:block;width:100%;aspect-ratio:1/1;background:#0a0c12}
.more-vid{display:inline-flex;align-items:center;font-size:11px;color:var(--dim);border:1px solid var(--border);border-radius:8px;padding:6px 8px}
.more{display:flex;gap:4px;padding:6px 8px 0}
.more img{width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border);display:block}
figcaption{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px;font-size:13px}
figcaption b{font-size:14px;font-weight:600}
figcaption span{color:var(--dim)}
figcaption .dim{font-size:12px}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.tags i{font-style:normal;font-size:11px;padding:2px 7px;border:1px solid var(--border);border-radius:999px}
.price{margin-top:6px;color:var(--accent);font-weight:600}
footer{max-width:1100px;margin:30px auto 0;color:var(--dim);font-size:12px;text-align:center}
#lb{position:fixed;inset:0;background:rgba(6,8,14,.94);display:none;align-items:center;justify-content:center;padding:14px;z-index:9;cursor:zoom-out}
#lb.on{display:flex}#lb img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
</style>
</head>
<body>
<header><h1>${esc(title)}</h1><p>${esc(desc)}</p></header>
<main>
${sections}
</main>
<footer>Shared with Collector</footer>
<div id="lb" role="dialog" aria-label="Photo"><img alt=""></div>
<script>
(function(){var lb=document.getElementById('lb'),im=lb.querySelector('img');
document.addEventListener('click',function(e){var a=e.target.closest('a[data-lb]');if(a){e.preventDefault();im.src=a.getAttribute('href');lb.classList.add('on');}else if(e.target===lb||e.target===im){lb.classList.remove('on');im.removeAttribute('src');}});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){lb.classList.remove('on');}});})();
</script>
</body>
</html>`;
  }

  /* ---- setup dialog ---- */

  function showPublishSettings() {
    return new Promise((resolve) => {
      const c = ghConfig() || { owner: '', repo: 'collector', token: '' };
      const overlay = document.createElement('div');
      overlay.className = 'name-overlay';
      overlay.innerHTML = `
        <div class="name-card" role="dialog" aria-modal="true" aria-label="Link hosting">
          <h2>Link hosting</h2>
          <p class="dialog-msg">Published pages are uploaded to your own free GitHub web space. One-time setup — ask Carl for the walkthrough.</p>
          <label>GitHub username<input id="gh-owner" value="${esc(c.owner)}" placeholder="e.g. artstar" autocomplete="off" autocapitalize="off" /></label>
          <label>Repository name<input id="gh-repo" value="${esc(c.repo)}" placeholder="collector" autocomplete="off" autocapitalize="off" /></label>
          <label>Access token<input id="gh-token" type="password" value="${esc(c.token)}" placeholder="ghp_…" autocomplete="off" /></label>
          <p class="dialog-msg" id="gh-status"></p>
          <div class="name-actions">
            <button class="ghost" id="gh-cancel">Cancel</button>
            <button class="primary" id="gh-save">Check &amp; save</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const status = overlay.querySelector('#gh-status');
      const done = (v) => { overlay.remove(); resolve(v); };
      overlay.querySelector('#gh-cancel').addEventListener('click', () => done(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
      overlay.querySelector('#gh-save').addEventListener('click', async () => {
        const cfg = {
          owner: overlay.querySelector('#gh-owner').value.trim().replace(/^@/, ''),
          repo: overlay.querySelector('#gh-repo').value.trim() || 'collector',
          token: overlay.querySelector('#gh-token').value.trim(),
        };
        if (!cfg.owner || !cfg.token) { status.textContent = 'Username and token are required.'; return; }
        const btn = overlay.querySelector('#gh-save');
        btn.disabled = true;
        status.textContent = 'Checking…';
        try {
          const info = await Publisher.check(cfg);
          cfg.branch = info.branch;
          saveGhConfig(cfg);
          const pages = await Publisher.ensurePages(cfg);
          status.textContent = pages
            ? 'Connected. Links will start with ' + Publisher.base(cfg)
            : 'Connected. One more step: in the repository on github.com open Settings → Pages and set Source to "Deploy from a branch", branch ' + info.branch + '.';
          if (info.isPrivate) status.textContent += ' Note: the repository is private — GitHub Pages on a free plan needs it public.';
          btn.textContent = 'Done';
          btn.disabled = false;
          btn.onclick = () => done(cfg);
        } catch (e) {
          btn.disabled = false;
          status.textContent = e.status === 401 ? 'Token was rejected. Check it and try again.'
            : e.status === 404 ? `Could not find github.com/${cfg.owner}/${cfg.repo}. Check the names, and that the token has access to it.`
            : 'Could not connect: ' + (e.message || 'unknown error');
        }
      });
      setTimeout(() => overlay.querySelector(c.owner ? '#gh-token' : '#gh-owner').focus(), 30);
    });
  }

  /* ---- publish dialog ---- */

  // groups: [{ name, pieces: [artwork] }]
  async function publishLink({ title, groups }) {
    if (!Publisher.configured()) {
      const cfg = await showPublishSettings();
      if (!cfg) return;
    }
    const total = groups.reduce((n, g) => n + g.pieces.length, 0);
    if (!total) { alert('Nothing to publish — the selected items have no pieces.'); return; }
    const mediaList = groups.flatMap((g) => g.pieces.flatMap((a) => imgs(a).filter((b) => b instanceof Blob && b.size).slice(0, 6)));
    const photoCount = mediaList.filter((b) => !isVideo(b)).length;
    const videoCount = mediaList.length - photoCount;
    const mediaSummary = [
      photoCount ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : '',
      videoCount ? `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}` : '',
    ].filter(Boolean).join(', ');
    const anyPrice = groups.some((g) => g.pieces.some((a) => a.price != null && a.price !== ''));

    const overlay = document.createElement('div');
    overlay.className = 'name-overlay';
    overlay.innerHTML = `
      <div class="name-card" role="dialog" aria-modal="true" aria-label="Get link">
        <h2>Get link</h2>
        <label>Page title<input id="pub-title" value="${esc(title)}" autocomplete="off" /></label>
        <label class="check-row"><input type="checkbox" id="pub-prices" ${anyPrice ? '' : 'disabled'} /> <span>Include prices${anyPrice ? '' : ' (none set)'}</span></label>
        <p class="dialog-msg">${total} ${total === 1 ? 'piece' : 'pieces'}${mediaSummary ? `, ${mediaSummary}` : ''}. Notes, provenance, location and acquisition details are never published.</p>
        <p class="dialog-msg" id="pub-status"></p>
        <div class="name-actions" id="pub-actions">
          <button class="ghost" id="pub-cancel">Cancel</button>
          <button class="primary" id="pub-go">Publish</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const status = overlay.querySelector('#pub-status');
    let busy = false;
    const close = () => { if (!busy) overlay.remove(); };
    overlay.querySelector('#pub-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#pub-go').addEventListener('click', async () => {
      const pageTitle = overlay.querySelector('#pub-title').value.trim() || title;
      const includePrices = overlay.querySelector('#pub-prices').checked;
      busy = true;
      overlay.querySelector('#pub-go').disabled = true;
      overlay.querySelector('#pub-cancel').disabled = true;
      const id = randomId();
      const dir = `s/${id}`;
      const pageUrl = Publisher.base() + dir + '/';
      try {
        // 1. media (photos → JPEG; videos → original file + poster, skipped over 50MB)
        let done = 0;
        const outGroups = [];
        const skippedBig = [];
        const totalUploads = mediaList.length;
        for (const g of groups) {
          const pieces = [];
          for (let pi = 0; pi < g.pieces.length; pi++) {
            const a = g.pieces[pi];
            const srcs = imgs(a).filter((b) => b instanceof Blob && b.size).slice(0, 6);
            const posters = postersOf(a);
            const durs = durationsOf(a);
            const media = [];
            for (let i = 0; i < srcs.length; i++) {
              done++;
              const b = srcs[i];
              const tag = `${outGroups.length + 1}-${pi + 1}-${i + 1}`;
              if (isVideo(b)) {
                if (b.size > MAX_PUBLISH_VIDEO_BYTES) { skippedBig.push(a.title || 'Untitled'); continue; }
                status.textContent = `Uploading video ${done} of ${totalUploads}…`;
                const name = `vid/${tag}.${mediaExt(b)}`;
                await Publisher.putFile(`${dir}/${name}`, await blobToBase64(b), `Publish ${id}`);
                const p = posters[imgs(a).indexOf(b)];
                let posterName = null;
                if (p && p.size) {
                  posterName = `img/${tag}-poster.jpg`;
                  await Publisher.putFile(`${dir}/${posterName}`, await blobToBase64(p), `Publish ${id}`);
                }
                media.push({ kind: 'video', src: name, poster: posterName, dur: durs[imgs(a).indexOf(b)] ?? null });
              } else {
                status.textContent = `Uploading photo ${done} of ${totalUploads}…`;
                const jpg = await toJpeg(b);
                const name = `img/${tag}.jpg`;
                await Publisher.putFile(`${dir}/${name}`, await blobToBase64(jpg), `Publish ${id}`);
                media.push({ kind: 'image', src: name });
              }
            }
            if (!media.length) continue;
            pieces.push({ ...publicPiece(a, includePrices), media });
          }
          if (pieces.length) outGroups.push({ name: g.name, pieces });
        }
        if (!outGroups.length) throw new Error('No media to publish.');
        // 2. page
        status.textContent = 'Building page…';
        const first = outGroups[0].pieces[0].media[0];
        const coverUrl = pageUrl + (first.kind === 'video' ? first.poster || '' : first.src);
        const html = sharePageHTML({ title: pageTitle, groups: outGroups, pageUrl, coverUrl: first.kind === 'video' && !first.poster ? '' : coverUrl });
        await Publisher.putFile(`${dir}/index.html`, await blobToBase64(new Blob([html], { type: 'text/html' })), `Publish ${id}`);
        // 3. remember
        const links = savedLinks();
        links.unshift({ id, title: pageTitle, url: pageUrl, count: total, createdAt: Date.now() });
        saveLinks(links);
        busy = false;
        overlay.querySelector('h2').textContent = 'Link ready';
        status.innerHTML = `<a class="pub-url" href="${esc(pageUrl)}" target="_blank" rel="noopener">${esc(pageUrl)}</a><br><span>Goes live in about a minute (first time can take a few).${skippedBig.length ? `<br>Skipped ${skippedBig.length} video${skippedBig.length === 1 ? '' : 's'} over 50MB: ${esc([...new Set(skippedBig)].join(', '))}.` : ''}</span>`;
        overlay.querySelector('#pub-actions').innerHTML = `
          <button class="ghost" id="pub-copy">Copy</button>
          <button class="primary" id="pub-share">Share link</button>
          <button class="ghost" id="pub-close">Close</button>`;
        overlay.querySelector('#pub-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#pub-copy').addEventListener('click', async () => {
          const ok = await copyText(pageUrl);
          overlay.querySelector('#pub-copy').textContent = ok ? 'Copied' : 'Copy failed';
        });
        overlay.querySelector('#pub-share').addEventListener('click', () => {
          overlay.remove();
          shareContent({ title: pageTitle, subject: pageTitle, text: `${pageTitle}\n${pageUrl}`, files: [] });
        });
      } catch (e) {
        busy = false;
        overlay.querySelector('#pub-go').disabled = false;
        overlay.querySelector('#pub-cancel').disabled = false;
        status.textContent = 'Publish failed: ' + (e.message || 'unknown error') + (e.status === 401 ? ' — open Links → Settings and re-enter the token.' : '');
      }
    });
    setTimeout(() => overlay.querySelector('#pub-title').focus(), 30);
  }

  /* ---- links manager ---- */

  function showLinksDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'name-overlay';
    const renderList = () => {
      const links = savedLinks();
      overlay.innerHTML = `
        <div class="name-card" role="dialog" aria-modal="true" aria-label="Published links">
          <h2>Published links</h2>
          ${links.length ? `<div class="link-list">${links.map((l) => `
            <div class="link-item" data-id="${esc(l.id)}">
              <div class="link-text">
                <b>${esc(l.title)}</b>
                <small>${esc(new Date(l.createdAt).toLocaleDateString())} · ${l.count} ${l.count === 1 ? 'piece' : 'pieces'}</small>
              </div>
              <div class="link-btns">
                <button class="tool-btn" data-act="copy" title="Copy link">⎘</button>
                <button class="tool-btn" data-act="share" title="Share link">↗</button>
                <button class="tool-btn" data-act="open" title="Open">↑</button>
                <button class="tool-btn" data-act="remove" title="Unpublish">🗑</button>
              </div>
            </div>`).join('')}</div>`
          : `<p class="dialog-msg">No links yet. Open a piece and tap <b>Get link</b>, or select items with ☑ and tap 🔗.</p>`}
          <p class="dialog-msg" id="links-status"></p>
          <div class="name-actions">
            <button class="ghost" id="links-settings">Settings</button>
            <button class="primary" id="links-close">Close</button>
          </div>
        </div>`;
      overlay.querySelector('#links-close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#links-settings').addEventListener('click', async () => { overlay.remove(); await showPublishSettings(); });
      for (const item of overlay.querySelectorAll('.link-item')) {
        const link = links.find((l) => l.id === item.dataset.id);
        item.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (!act) return;
          if (act === 'copy') { const ok = await copyText(link.url); overlay.querySelector('#links-status').textContent = ok ? 'Copied.' : link.url; }
          if (act === 'open') window.open(link.url, '_blank', 'noopener');
          if (act === 'share') { overlay.remove(); shareContent({ title: link.title, subject: link.title, text: `${link.title}\n${link.url}`, files: [] }); }
          if (act === 'remove') {
            overlay.hidden = true;
            const ok = await showConfirmDialog({ title: 'Unpublish this link?', message: 'The page and its photos are removed from the web. Anyone with the link will get "not found".', confirmText: 'Unpublish', danger: true });
            overlay.hidden = false;
            if (!ok) return;
            const st = overlay.querySelector('#links-status');
            st.textContent = 'Removing…';
            try {
              await Publisher.deleteFolder(`s/${link.id}`);
              saveLinks(savedLinks().filter((l) => l.id !== link.id));
              renderList();
            } catch (err) {
              st.textContent = 'Could not remove: ' + (err.message || 'unknown error');
            }
          }
        });
      }
    };
    renderList();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function selectionGroups() {
    const sets = getSelectedSets();
    const arts = getSelectedArtworks();
    const groups = [];
    const seen = new Set();
    for (const s of sets) {
      const members = state.artworks.filter((a) => a.setId === s.id);
      members.forEach((a) => seen.add(a.id));
      groups.push({ name: s.name, pieces: members });
    }
    const loose = arts.filter((a) => !seen.has(a.id));
    if (loose.length) groups.push({ name: sets.length ? 'Individual pieces' : '', pieces: loose });
    return groups;
  }

  function publishSelected() {
    const groups = selectionGroups();
    const everything = state.selected.size >= state.sets.length + state.artworks.filter((a) => !a.setId).length;
    publishLink({ title: everything ? 'My Collection' : (groups.length === 1 && groups[0].name ? groups[0].name : 'Selected pieces'), groups });
  }

  function selectAll() {
    const all = state.sets.length + state.artworks.filter((a) => !a.setId).length;
    if (state.selected.size >= all) state.selected.clear();
    else {
      for (const s of state.sets) state.selected.add(`s:${s.id}`);
      for (const a of state.artworks) if (!a.setId) state.selected.add(`a:${a.id}`);
    }
    render();
  }

  /* ---------------- AI label scan (Tesseract.js — free, offline) ---------------- */

  let _tesseractReady = null;
  async function loadTesseract() {
    if (_tesseractReady) return _tesseractReady;
    _tesseractReady = new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve(window.Tesseract);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Could not load OCR engine'));
      document.head.appendChild(s);
    });
    return _tesseractReady;
  }

  function parseLabelText(raw) {
    const text = raw.replace(/\r/g, '').trim();
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const full = lines.join(' ');

    const result = { title: '', artist: '', year: '', era: '', style: '', category: '', medium: '', materials: '', dimensions: '', price: '', location: '', notes: '' };

    /* --- price: $X,XXX or EUR X,XXX --- */
    const priceMatch = full.match(/[$€£]\s?[\d,]+(?:\.\d{2})?|\b(?:USD|EUR|GBP)\s?[\d,]+(?:\.\d{2})?/i);
    if (priceMatch) result.price = priceMatch[0].trim();

    /* --- dimensions: 10 x 20 cm --- */
    const dimMatch = full.match(/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|in|mm|m|inches|centimeters|millimeters|met(?:er|res))?/i);
    if (dimMatch) result.dimensions = dimMatch[0].trim();

    /* --- medium: oil, acrylic, bronze, etc. --- */
    const mediumKw = /\b(oil|acrylic|watercolor|watercolour|gouache|tempera|encaustic|pastel|charcoal|pencil|ink|graphite|etching|lithograph|screenprint|serigraph|woodcut|linocut|bronze|marble|stone|clay|ceramic|glass|wood|metal|steel|iron|copper|brass|aluminum|aluminium|plastic|resin|fabric|textile|silk|cotton|wool|leather|canvas|panel|paper|cardboard|photograph|digital|print|mixed media|collage|assemblage|sculpture|installation|video|projection)\b/i;
    const mediumMatch = full.match(mediumKw);
    if (mediumMatch) result.medium = mediumMatch[0];

    /* --- era / category from full text --- */
    const eraKw = { 'Antiquity': /antiqu(?:ity|e|ian)/i, 'Medieval': /medieval|middle\s*ages/i, 'Renaissance': /renaissance/i, 'Baroque': /baroque/i, 'Rococo': /rococo/i, 'Neoclassical': /neoclassic/i, 'Romanticism': /romantic/i, 'Victorian': /victorian/i, 'Impressionism': /impressionis/i, 'Post-Impressionism': /post.?impressionis/i, 'Early Modern': /early\s*modern/i, 'Modernism': /modern(?:ism|ist)/i, 'Post-War': /post.?war/i, 'Contemporary': /contempor(?:ary|aire)/i, 'Emerging': /emerging/i };
    for (const [era, re] of Object.entries(eraKw)) { if (re.test(full)) { result.era = era; break; } }
    const catKw = { 'Painting': /\bpaint(?:ing|s)?\b/i, 'Sculpture': /sculpt(?:ure|ural)/i, 'Print': /\bprint(?:s)?\b/i, 'Drawing': /draw(?:ing|s)?\b/i, 'Photograph': /photograph/i, 'Ceramic': /ceramic/i, 'Furniture': /furniture/i, 'Textile': /textile/i, 'Jewelry': /jewel(?:ry|lery)/i };
    for (const [cat, re] of Object.entries(catKw)) { if (re.test(full)) { result.category = cat; break; } }

    /* --- location --- */
    const locMatch = full.match(/(?:@|at|gallery|museum|collection|exhibition)\s+(.{3,40})/i);
    if (locMatch) result.location = locMatch[1].replace(/[,;]$/, '').trim();

    /* ============================================================
       LINE-BASED TITLE / ARTIST / YEAR — standard gallery format:
         Line 1  →  Title
         Line 2  →  Artist, Year  (or Year, Artist)
         Lines 3+ →  medium, dimensions, price, etc.
       ============================================================ */

    /* helper: is this line just noise (price, dimensions, short junk)? */
    function isNoiseLine(l) {
      if (!l || l.length < 1) return true;
      if (/^[\d$,.\-x×/\s'"!?:;]+$/.test(l)) return true;   // purely numeric / punctuation
      if (/[$€£]/.test(l)) return true;                       // price line
      if (dimMatch && l === dimMatch[0]) return true;          // exact dimension line
      return false;
    }

    /* helper: 4-digit year anywhere in line */
    function extractYear(l) {
      const m = l.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
      return m ? m[1] : '';
    }

    /* helper: extract artist name (before the comma next to a year, or "by X") */
    function extractArtist(l) {
      const byM = l.match(/\bby\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)+(?:\s+[A-Z][a-z]+)?)/);
      if (byM) return byM[1];
      const commaM = l.match(/^(.+?),\s*(?:1[5-9]\d{2}|20[0-2]\d)/);
      if (commaM) return commaM[1].trim();
      const nameM = l.match(/^([A-Z][a-z]+(?:\s+[A-Z]\.?)+(?:\s+[A-Z][a-z]+)?)/);
      if (nameM) return nameM[1];
      return '';
    }

    /* find the title: first non-noise line */
    let titleLine = '';
    let titleIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!isNoiseLine(lines[i])) {
        titleLine = lines[i];
        titleIdx = i;
        break;
      }
    }

    /* find artist+year: look in the line after the title, or any line with a year */
    let artistLine = '';
    let artistIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (i === titleIdx) continue;
      const y = extractYear(lines[i]);
      if (y && !result.year) result.year = y;
      const a = extractArtist(lines[i]);
      if (a && !result.artist) {
        result.artist = a;
        artistLine = lines[i];
        artistIdx = i;
        break;
      }
    }

    /* if no artist found via patterns, check the line after title */
    if (!result.artist && titleIdx >= 0 && titleIdx + 1 < lines.length) {
      const next = lines[titleIdx + 1];
      if (next !== artistLine) {
        const y = extractYear(next);
        if (y && !result.year) result.year = y;
        const a = extractArtist(next);
        if (a) result.artist = a;
      }
    }

    /* title: use titleLine, but strip trailing ", Year" or " (Year)" if present */
    if (titleLine) {
      let t = titleLine;
      t = t.replace(/,\s*(?:1[5-9]\d{2}|20[0-2]\d)\s*$/, '');
      t = t.replace(/\s*\((?:1[5-9]\d{2}|20[0-2]\d)\)\s*$/, '');
      result.title = t.replace(/[,;]$/, '').trim();
    }

    /* if title contains " by Artist", split it */
    if (result.title && !result.artist) {
      const byParts = result.title.split(/\s+by\s+/i);
      if (byParts.length === 2) {
        result.title = byParts[0].trim();
        result.artist = byParts[1].trim();
      }
    }

    /* fallback: if no title yet, take the first line that's not noise */
    if (!result.title && lines.length > 0) {
      for (const l of lines) {
        if (!isNoiseLine(l)) { result.title = l.replace(/[,;]$/, ''); break; }
      }
    }

    /* fallback: if still no year, grab any 4-digit number */
    if (!result.year) {
      const ym = full.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
      if (ym) result.year = ym[1];
    }

    /* fallback: artist from "by Name" anywhere */
    if (!result.artist) {
      const byM = full.match(/\bby\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)+(?:\s+[A-Z][a-z]+)?)/);
      if (byM) result.artist = byM[1];
    }

    result.notes = full;
    return result;
  }

  async function scanLabel() {
    const input = document.getElementById('label-capture');
    if (!input) return;

    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;

      const btn = document.getElementById('btn-scan');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Loading OCR...';
      }

      try {
        const Tesseract = await loadTesseract();
        if (btn) btn.textContent = '⏳ Scanning label...';

        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { data } = await Tesseract.recognize(dataUrl, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text' && btn) {
              const pct = Math.round((m.progress || 0) * 100);
              btn.textContent = `⏳ Reading... ${pct}%`;
            }
          },
        });

        const raw = data.text || '';
        if (!raw.trim()) {
          throw new Error('No text detected. Try a clearer photo of the label.');
        }

        const parsed = parseLabelText(raw);

        const fieldMap = {
          title: 'f-title', artist: 'f-artist', year: 'f-year',
          era: 'f-era', style: 'f-style', category: 'f-category',
          medium: 'f-medium', materials: 'f-materials', dimensions: 'f-dimensions',
          price: 'f-price', location: 'f-location', notes: 'f-notes',
        };

        let filled = 0;
        for (const [key, id] of Object.entries(fieldMap)) {
          const val = parsed[key];
          if (val && String(val).trim()) {
            const el = document.getElementById(id);
            if (el) {
              el.value = String(val).trim();
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled++;
            }
          }
        }

        alert(`Label scanned — filled ${filled} field${filled === 1 ? '' : 's'}. Review and save.`);
      } catch (e) {
        alert('Scan failed: ' + (e.message || 'Unknown error'));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '🏷 Scan Label';
        }
      }
    };

    input.click();
  }

  function activeFilterCount() {
    const f = state.filters;
    return (
      (f.query.trim() ? 1 : 0) +
      (f.artist ? 1 : 0) +
      (f.category ? 1 : 0) +
      (f.era ? 1 : 0) +
      (f.style ? 1 : 0) +
      (f.color ? 1 : 0)
    );
  }

  function filteredArtworks() {
    const f = state.filters;
    const q = f.query.trim().toLowerCase();
    return state.artworks.filter((a) => {
      if (state.view === 'set' && a.setId !== state.activeSetId) return false;
      if (state.view === 'gallery' && a.setId != null) return false;
      if (f.color && !(a.palette || []).includes(f.color)) return false;
      if (f.artist && a.artist !== f.artist) return false;
      if (f.category && a.category !== f.category) return false;
      if (f.era && a.era !== f.era) return false;
      if (f.style && a.style !== f.style) return false;
      if (q) {
        const hay = [
          a.title,
          a.artist,
          a.year,
          a.era,
          a.style,
          a.medium,
          a.materials,
          a.category,
          a.location,
          (a.tags || []).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function facets() {
    const artists = new Set();
    const categories = new Set();
    const eras = new Set();
    const styles = new Set();
    const colors = new Set();
    for (const a of state.artworks) {
      if (a.artist) artists.add(a.artist);
      if (a.category) categories.add(a.category);
      if (a.era) eras.add(a.era);
      if (a.style) styles.add(a.style);
      for (const c of a.palette || []) colors.add(c);
    }
    return {
      artists: [...artists].sort(),
      categories: [...categories].sort(),
      eras: [...eras].sort(),
      styles: [...styles].sort(),
      colors: [...colors].sort(),
    };
  }

  function cardTitle(a) {
    const re = /error|placeholder|missing|not found|no image|preview|thumb|upload|scan|capture|img_\d+/i;
    const title = re.test(a.title) ? '' : a.title;
    const rest = [];
    if (a.artist) rest.push(a.artist);
    if (a.year) rest.push(a.year);
    else if (a.era) rest.push(a.era);
    return { title, rest: rest.join(' · '), sub: rest.join(' · ') || a.category || 'Uncategorized' };
  }

  function urlForId(id, index) {
    const urls = state.urls.get(id);
    if (!urls || !urls.length) return undefined;
    return urls[index || 0];
  }

  function validHex(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  async function extractFrom(a) {
    const src = paletteSource(a);
    if (!src || !src.size) return [];
    const fresh = await ColorUtil.extractPalette(src, 4);
    return fresh.filter(validHex);
  }

  // In earlier builds, palette hex values were written corrupted; repair them
  // in place by re-extracting colors from the stored photo. Partial patches are
  // MERGED by updateArt, so the images and metadata are preserved.
  async function repairPalettes(rows) {
    for (const a of rows) {
      const images = imgs(a);
      const paletteBad = (a.palette || []).some((c) => !validHex(c));
      const primaryBad = a.primaryColor && !validHex(a.primaryColor);
      const imagesMissing = !Array.isArray(a.images) || a.images.length === 0;

      if (imagesMissing) {
        await CollectorDB.updateArt(a.id, { images });
        a.images = images;
      }
      if (!paletteBad && !primaryBad) continue;

      const palette = await extractFrom(a);
      const patch = { palette };
      if (primaryBad) patch.primaryColor = palette[0];
      await CollectorDB.updateArt(a.id, patch);
      a.palette = palette;
      if (primaryBad) a.primaryColor = patch.primaryColor;
    }
  }

  // Records damaged by an earlier bug have no image and no metadata; remove
  // those empty shells. Returns how many were purged.
  async function purgeShells(rows) {
    let purged = 0;
    for (const a of rows) {
      if (
        imgs(a).length === 0 &&
        !a.title &&
        !a.artist &&
        !a.category &&
        !a.year &&
        !a.medium
      ) {
        await CollectorDB.deleteArt(a.id);
        purged++;
      }
    }
    return purged;
  }

  /* ---------------- data ---------------- */

  async function reload() {
    const [rows, sets] = await Promise.all([CollectorDB.getAll(), CollectorDB.getAllSets()]);
    const rowsSorted = rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    await backfillMedia(rowsSorted);
    state.urls = refreshUrls(rowsSorted);
    state.artworks = rowsSorted;
    state.sets = (sets || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    render();
  }

  function refreshUrls(rows) {
    const next = new Map();
    const nextThumbs = new Map();
    const prev = state.urls;
    const prevThumbs = state.thumbs || new Map();
    for (const row of rows) {
      const media = imgs(row);
      const posters = postersOf(row);
      const photoUrls = [];
      const thumbUrls = [];
      for (let i = 0; i < media.length; i++) {
        const b = media[i];
        photoUrls.push(b && b.size ? URL.createObjectURL(b) : undefined);
        const p = posters[i];
        thumbUrls.push(p && p.size ? URL.createObjectURL(p) : photoUrls[i]);
      }
      next.set(row.id, photoUrls);
      nextThumbs.set(row.id, thumbUrls);
    }
    for (const [id, urls] of prev) {
      if (!next.has(id)) for (const u of urls) if (u) URL.revokeObjectURL(u);
    }
    for (const [id, urls] of prevThumbs) {
      if (!nextThumbs.has(id)) for (const u of urls) if (u) URL.revokeObjectURL(u);
    }
    state.thumbs = nextThumbs;
    return next;
  }

  function thumbForId(id, index) {
    const t = state.thumbs && state.thumbs.get(id);
    if (t && t[index || 0]) return t[index || 0];
    return urlForId(id, index);
  }

  // Older video clips saved before posters/durations existed get them now
  // (grandfathered in regardless of length — the 30s cap applies to new adds).
  async function backfillMedia(rows) {
    for (const a of rows) {
      const media = imgs(a);
      if (!media.some(isVideo)) continue;
      const posters = postersOf(a).slice();
      const durations = durationsOf(a).slice();
      while (posters.length < media.length) posters.push(null);
      while (durations.length < media.length) durations.push(null);
      let dirty = posters.length !== postersOf(a).length || durations.length !== durationsOf(a).length;
      for (let i = 0; i < media.length; i++) {
        if (!isVideo(media[i]) || (posters[i] && durations[i] != null)) continue;
        try {
          const p = await probeVideo(media[i]);
          posters[i] = p.poster;
          durations[i] = p.duration;
          dirty = true;
        } catch { /* stays playable, just without a poster */ }
      }
      if (dirty) {
        a.posters = posters;
        a.durations = durations;
        try { await CollectorDB.updateArt(a.id, { posters, durations }); } catch {}
      }
    }
  }

  /* ---------------- gallery ---------------- */

  function galleryHTML() {
    const fc = activeFilterCount();
    const list = filteredArtworks();
    const fac = facets();

    const options = (values, current) =>
      `<option value="">All</option>` +
      values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('');

    const colorChips = fac.colors
      .map(
        (c) =>
          `<button class="color-opt${state.filters.color === c ? ' on' : ''}" data-color="${esc(c)}" style="--sw:${esc(c)}" aria-label="Filter by ${esc(c)}"></button>`
      )
      .join('');

    const accordion = state.filterOpen
      ? `
      <div class="filter-sheet">
        <div class="fgroup"><label>Color</label><div class="colors">${
          fac.colors.length
            ? colorChips
            : '<span class="muted small">No colors cataloged yet</span>'
        }</div></div>
        <div class="fcols">
          <div class="fgroup"><label>Artist</label><select id="f-artist">${options(fac.artists, state.filters.artist)}</select></div>
          <div class="fgroup"><label>Category</label><select id="f-category">${options(fac.categories, state.filters.category)}</select></div>
          <div class="fgroup"><label>Era</label><select id="f-era">${options(fac.eras, state.filters.era)}</select></div>
          <div class="fgroup"><label>Style</label><select id="f-style">${options(fac.styles, state.filters.style)}</select></div>
        </div>
        <div class="fgroup row-actions">
          ${fc ? '<button class="ghost small" id="clear-filters">Clear all filters</button>' : ''}
        </div>
      </div>`
      : '';

    const grid = buildResultAreaHTML(list);

    const filterToggle = `<button class="filter-toggle${state.filterOpen ? ' on' : ''}" id="filter-toggle">Filter${fc ? ' ✓' : ''}</button>`;

    return `
      <div class="app">
        <header class="topbar">
          <button class="brand brand-home" id="brand-home" type="button" aria-label="Go to home">
            <img class="brand-mark" src="./logo.svg" alt="Collector" title="Collector" />
            <div>
              <h1>Collector</h1>
              <p class="count">${countText()}</p>
            </div>
          </button>
          <div class="top-actions">
            <button class="tool-btn" id="btn-theme" title="${themeTitle()}">${themeIcon()}</button>
            <button class="tool-btn" id="btn-select" title="Select items">${state.selecting ? '✕' : '☑'}</button>
            <button class="add-btn" id="btn-add" title="Create a new set"><span class="add-icon">+</span> New Set</button>
          </div>
        </header>

        <div class="filterbar">
          <div class="row">
            <input class="search" id="search" type="search" placeholder="Search title, artist, material…" value="${esc(state.filters.query)}" />
            ${filterToggle}
          </div>
          ${accordion}
        </div>

        ${state.notice ? `<div class="notice" id="notice"><span>${esc(state.notice)}</span><button class="ghost small" id="notice-dismiss">OK</button></div>` : ''}

        ${grid}

        ${state.selecting ? '' : `
        <div class="backup-row">
          <span class="backup-label">Backup</span>
          <button class="ghost small" id="btn-export" type="button">↓ Export</button>
          <button class="ghost small" id="btn-import" type="button">↑ Import</button>
          <span class="backup-sep"></span>
          <button class="ghost small" id="btn-links" type="button">🔗 Links</button>
        </div>`}

        ${state.selecting ? `
        <nav class="sel-bar">
          <button class="sel-all" id="sel-all" type="button">${state.selected.size && state.selected.size >= state.sets.length + state.artworks.filter((a) => !a.setId).length ? 'None' : 'All'}</button>
          <span class="sel-count">${state.selected.size} selected</span>
          <div class="sel-actions">
            <button class="tool-btn sel-action" id="sel-link" title="Get link" ${state.selected.size ? '' : 'disabled'}>🔗</button>
            <button class="tool-btn sel-action" id="sel-share" title="Share" ${state.selected.size ? '' : 'disabled'}>↗</button>
            <button class="tool-btn sel-action" id="sel-txt" title="Download text" ${state.selected.size ? '' : 'disabled'}>.txt</button>
            <button class="tool-btn sel-action" id="sel-xml" title="Download XML" ${state.selected.size ? '' : 'disabled'}>XML</button>
            <button class="tool-btn sel-action" id="sel-pdf" title="Save as PDF" ${state.selected.size ? '' : 'disabled'}>PDF</button>
          </div>
        </nav>` : `
        <nav class="bottomnav">
          <button class="primary wide" id="btn-add2"><span class="add-icon">+</span> New</button>
        </nav>`}

        <input type="file" id="import-file" accept="application/json" hidden />
      </div>`;
  }

  function cardHTML(a) {
    const t = cardTitle(a);
    const first = imgs(a)[0];
    const coverUrl = thumbForId(a.id, 0);
    const thumb = coverUrl
      ? `<img src="${esc(coverUrl)}" alt="${esc(a.title || 'artwork')}" loading="lazy" />`
      : '<div class="no-img"></div>';
    const playBadge = isVideo(first)
      ? `<span class="play-badge">▶${durationsOf(a)[0] ? ` ${esc(fmtDur(durationsOf(a)[0]))}` : ''}</span>`
      : '';
    const badges = VISIBILITY_LABELS[a.visibility]
      ? `<span class="badge badge-${esc(a.visibility)}">${VISIBILITY_LABELS[a.visibility]}</span>`
      : '';
    const photoCount = imgs(a).length;
    const countChip =
      photoCount > 1
        ? `<span class="count-chip">${photoCount}</span>`
        : '';
    const swatches = a.palette?.length
      ? `<div class="swatches">${a.palette
          .slice(0, 4)
          .map((c) => `<span style="background:${esc(c)}"></span>`)
          .join('')}</div>`
      : '';
    const selCheck = state.selecting
      ? `<span class="sel-check${state.selected.has('a:' + a.id) ? ' on' : ''}" data-key="a:${a.id}">✓</span>`
      : '';
    return `<button class="card${state.selecting ? ' selecting' : ''}" data-id="${a.id}">
      <div class="thumb">${selCheck}${thumb}${badges}${countChip}${playBadge}${swatches}</div>
      <div class="card-body">
        <div class="card-title">${esc(t.title || 'Untitled')}</div>
        <div class="card-sub">${esc(t.sub)}</div>
      </div>
    </button>`;
  }

  function emptyArtHTML() {
    return `
    <div class="empty-art" aria-hidden="true">
      <svg viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g class="ring ring-a"><circle cx="100" cy="82" r="52" /></g>
        <g class="ring ring-b"><circle cx="100" cy="82" r="66" /></g>

        <g class="folder">
          <path class="fold fold-back" d="M38 54 v50 a10 10 0 0 0 10 10 h104 a10 10 0 0 0 10 -10 v-6 a8 8 0 0 0 -8 -8 H128 L116 40 H48 a10 10 0 0 0 -10 10 Z" />
          <g class="paper">
            <rect class="paper-bg" x="64" y="50" width="72" height="48" rx="5" />
            <g class="paper-art">
              <rect class="frame" x="72" y="58" width="56" height="30" rx="3" />
              <circle class="sun" cx="90" cy="71" r="5" />
              <path class="mtn" d="M74 86 L88 68 L99 81 L108 72 L122 84" />
              <path class="line" d="M74 91 H122" />
            </g>
          </g>
          <path class="fold fold-front" d="M38 82 v22 a10 10 0 0 0 10 10 h104 a10 10 0 0 0 10 -10 v-22" />
        </g>

        <g class="spark p1"><path d="M158 32 v16 M150 40 h16" /></g>
        <g class="spark p2"><path d="M34 118 v10 M29 123 h10" /></g>
        <g class="dot dot-a"><circle cx="170" cy="70" r="2.2" /></g>
        <g class="dot dot-b"><circle cx="28" cy="44" r="1.8" /></g>
      </svg>
    </div>`;
  }

  function emptyFilterHTML() {
    return `
    <div class="empty-icon empty-icon-filter" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="6" />
        <path d="M15 15 L21 21" />
      </svg>
    </div>`;
  }

  function countText() {
    const n = state.artworks.length;
    let t = `${n} ${n === 1 ? 'piece' : 'pieces'}`;
    if (state.sets.length) t += ` · ${state.sets.length} ${state.sets.length === 1 ? 'set' : 'sets'}`;
    if (APP_VERSION) t += ` · ${APP_VERSION}`;
    return t;
  }

  function setCardHTML(s) {
    const name = typeof s.name === 'string' ? s.name : '';
    const members = state.artworks.filter((a) => a.setId === s.id);
    const m0 = members[0];
    const cover = m0 ? thumbForId(m0.id, 0) : null;
    const thumb = cover
      ? `<img src="${esc(cover)}" alt="" loading="lazy" />${m0 && isVideo(imgs(m0)[0]) ? '<span class="play-badge">▶</span>' : ''}`
      : `<div class="set-mono" aria-hidden="true">${esc(name[0] || '')}</div>`;
    const selCheck = state.selecting
      ? `<span class="sel-check${state.selected.has('s:' + s.id) ? ' on' : ''}" data-key="s:${s.id}">✓</span>`
      : '';
    return `<button class="set-card${state.selecting ? ' selecting' : ''}" data-sid="${s.id}">
      <div class="set-thumb">${selCheck}${thumb}<span class="set-count-chip">${members.length}</span></div>
      <div class="set-body">
        <span class="set-name">${esc(name || 'Untitled set')}</span>
        <span class="set-count">${members.length} ${members.length === 1 ? 'piece' : 'pieces'}</span>
      </div>
    </button>`;
  }

  function setGridHTML(list) {
    return `<main class="grid">${list.map(cardHTML).join('')}</main>`;
  }

  function homeSectionsHTML(list) {
    const n = state.artworks.length;
    const fc = activeFilterCount();
    const hasSets = state.sets.length > 0;
    const setsHTML = hasSets
      ? `<section class="home-sec" data-sec="sets"><h2 class="section-label">Sets</h2><div class="set-grid">${state.sets.map(setCardHTML).join('')}</div></section>`
      : '';
    let piecesHTML;
    if (list.length) {
      piecesHTML = hasSets
        ? `<section class="home-sec" data-sec="pieces"><h2 class="section-label">Pieces</h2>${setGridHTML(list)}</section>`
        : setGridHTML(list);
    } else if (n === 0) {
      piecesHTML = `<div class="empty empty-hero">
        ${emptyArtHTML()}
        <p class="empty-title">Your collection starts here</p>
        <p class="empty-sub">Add a photo and watch your catalog come alive.</p>
        <button class="primary" id="empty-add">Add your first artwork</button>
      </div>`;
    } else {
      piecesHTML = `<div class="empty">
        ${emptyFilterHTML()}
        <p>${hasSets && !fc ? 'No individual pieces yet — add one with the + New button.' : 'Nothing matches the current filters.'}</p>
        ${fc ? '<button class="ghost" id="empty-clear">Clear filters</button>' : ''}
      </div>`;
    }
    return `<div class="home-content" id="home-content">${setsHTML}${piecesHTML}</div>`;
  }

  function buildResultAreaHTML(list) {
    if (state.view === 'set') {
      if (list.length === 0) {
        const set = activeSet();
        if (state.filters.query || activeFilterCount()) {
          return `<div class="empty">
            ${emptyFilterHTML()}
            <p>Nothing matches in this set.</p>
            <button class="ghost" id="empty-clear">Clear filters</button>
          </div>`;
        }
        return `<div class="empty">
          <div class="empty-icon empty-set-icon" aria-hidden="true">${set ? esc(set.name[0] || '') : ''}</div>
          <p class="empty-title">${set ? esc(set.name) : 'This set'}</p>
          <p class="empty-sub">No pieces here yet — add the first one.</p>
          <button class="primary" id="empty-set-add">Add to this set</button>
        </div>`;
      }
      return setGridHTML(list);
    }
    return homeSectionsHTML(list);
  }

  function bindResultArea() {
    for (const card of root.querySelectorAll('.card')) {
      card.addEventListener('click', () => {
        if (state.selecting) {
          toggleSelect('a:' + card.dataset.id);
          const chk = card.querySelector('.sel-check');
          if (chk) chk.classList.toggle('on');
          return;
        }
        state.activeId = Number(card.dataset.id);
        detail.index = 0;
        state.returnTo = { view: state.view, activeSetId: state.activeSetId };
        state.view = 'detail';
        render();
      });
    }
    for (const sc of root.querySelectorAll('.set-card')) {
      sc.addEventListener('click', () => {
        if (state.selecting) {
          toggleSelect('s:' + sc.dataset.sid);
          const chk = sc.querySelector('.sel-check');
          if (chk) chk.classList.toggle('on');
          return;
        }
        state.view = 'set';
        state.activeSetId = Number(sc.dataset.sid);
        render();
      });
    }
    root.querySelector('#empty-add')?.addEventListener('click', openNew);
    root.querySelector('#empty-set-add')?.addEventListener('click', () => openNewInSet(activeSet().id));
    root.querySelector('#empty-clear')?.addEventListener('click', clearFilters);
  }

  function refreshResultArea() {
    const list = filteredArtworks();
    const container = root.querySelector('#home-content, main.grid, .empty');
    if (container) container.outerHTML = buildResultAreaHTML(list);
    bindResultArea();
    const toggle = root.querySelector('#filter-toggle');
    if (toggle) toggle.textContent = `Filter${activeFilterCount() ? ' ✓' : ''}`;
    const countEl = root.querySelector('.count');
    if (countEl) {
      countEl.textContent = countText();
    }
  }

  /* ---------------- sets ---------------- */

  function setChipsHTML() {
    const current = state.view === 'set' ? state.activeSetId : null;
    const all = `<button class="set-chip${current == null ? ' on' : ''}" data-sid="">All pieces</button>`;
    const chips = state.sets
      .map((s) => `<button class="set-chip${current === s.id ? ' on' : ''}" data-sid="${s.id}">${esc(s.name)}</button>`)
      .join('');
    return all + chips;
  }

  function bindSetChips() {
    for (const chip of root.querySelectorAll('.set-chip')) {
      chip.addEventListener('click', () => {
        const sid = chip.dataset.sid;
        if (sid === '') {
          state.view = 'gallery';
          state.activeSetId = null;
        } else {
          state.view = 'set';
          state.activeSetId = Number(sid);
        }
        render();
      });
    }
  }

  function showNameDialog({ title, label, placeholder, initial, confirmText }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'name-overlay';
      overlay.innerHTML = `
        <div class="name-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h2>${esc(title)}</h2>
          <label>${esc(label || 'Name')}<input id="name-input" value="${esc(initial || '')}" placeholder="${esc(placeholder || '')}" autocomplete="off" /></label>
          <div class="name-actions">
            <button class="ghost" id="name-cancel">Cancel</button>
            <button class="primary" id="name-ok">${esc(confirmText || 'Create')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#name-input');
      const done = (v) => {
        overlay.remove();
        resolve(v);
      };
      const ok = () => {
        const v = input.value.trim();
        if (v) done(v);
        else input.focus();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ok();
        } else if (e.key === 'Escape') {
          done(null);
        }
      });
      overlay.querySelector('#name-cancel').addEventListener('click', () => done(null));
      overlay.querySelector('#name-ok').addEventListener('click', ok);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done(null);
      });
      setTimeout(() => {
        input.focus();
        if (initial) input.select();
      }, 30);
    });
  }

  function showConfirmDialog({ title, message, confirmText, danger }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'name-overlay';
      overlay.innerHTML = `
        <div class="name-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h2>${esc(title)}</h2>
          <p class="dialog-msg">${esc(message || '')}</p>
          <div class="name-actions">
            <button class="ghost" id="confirm-cancel">Cancel</button>
            <button class="${danger ? 'danger' : 'primary'}" id="confirm-ok">${esc(confirmText || 'OK')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const done = (v) => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
      };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('#confirm-cancel').addEventListener('click', () => done(false));
      overlay.querySelector('#confirm-ok').addEventListener('click', () => done(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done(false);
      });
      setTimeout(() => overlay.querySelector('#confirm-ok')?.focus(), 30);
    });
  }

  async function openNewSet() {
    const name = await showNameDialog({
      title: 'New set',
      label: 'Set name',
      placeholder: 'e.g. Frieze 2026, a gallery show',
      confirmText: 'Create',
    });
    if (!name) return;
    const id = await CollectorDB.addSet({ name, createdAt: Date.now() });
    state.view = 'set';
    state.activeSetId = id;
    await reload();
  }

  function setViewHTML() {
    if (!activeSet()) {
      state.view = 'gallery';
      return galleryHTML();
    }
    const list = filteredArtworks();
    const set = activeSet();
    const setsBar = state.sets.length ? `<div class="sets-bar">${setChipsHTML()}</div>` : '';

    return `
      <div class="app set-view">
        <header class="topbar set-topbar">
          <div class="brand set-brand">
            <button class="icon-btn" id="set-back" aria-label="Back to home">←</button>
            <div class="set-title">
              <h1>${esc(set.name)}</h1>
              <p class="count">${list.length} ${list.length === 1 ? 'piece' : 'pieces'}</p>
            </div>
          </div>
          <div class="top-actions">
            <button class="tool-btn" id="set-theme" title="${themeTitle()}">${themeIcon()}</button>
            <button class="tool-btn" id="set-rename" title="Rename set">✎</button>
            <button class="tool-btn" id="set-delete" title="Delete set">🗑</button>
            <button class="add-btn" id="set-add" title="Add to this set"><span class="add-icon">+</span> Add</button>
          </div>
        </header>

        <div class="filterbar">
          <div class="row">
            <input class="search" id="search" type="search" placeholder="Search within this set…" value="${esc(state.filters.query)}" />
          </div>
        </div>

        ${setsBar}

        ${buildResultAreaHTML(list)}

        <nav class="bottomnav">
          <button class="primary wide" id="set-add2"><span class="add-icon">+</span> Add piece</button>
        </nav>
      </div>`;
  }

  function attachSet() {
    const el = root;
    el.querySelector('#set-theme')?.addEventListener('click', toggleTheme);
    el.querySelector('#set-back')?.addEventListener('click', goHome);
    el.querySelector('#set-add')?.addEventListener('click', () => openNewInSet(activeSet().id));
    el.querySelector('#set-add2')?.addEventListener('click', () => openNewInSet(activeSet().id));
    el.querySelector('#set-rename')?.addEventListener('click', async () => {
      const set = activeSet();
      if (!set) return;
      const name = await showNameDialog({
        title: 'Rename set',
        initial: set.name,
        placeholder: 'Set name',
        confirmText: 'Save',
      });
      if (!name) return;
      await CollectorDB.renameSet(set.id, name);
      await reload();
    });
    el.querySelector('#set-delete')?.addEventListener('click', async () => {
      const ok = await showConfirmDialog({
        title: 'Delete this set?',
        message: 'Pieces stay in your catalog — only the grouping is removed.',
        confirmText: 'Delete',
        danger: true,
      });
      if (ok) await deleteActiveSet();
    });
    el.querySelector('#search')?.addEventListener('input', (e) => {
      state.filters.query = e.target.value;
      refreshResultArea();
    });

    bindSetChips();
    bindResultArea();
  }

  function goHome() {
    state.view = 'gallery';
    state.activeSetId = null;
    state.returnTo = { view: 'gallery', activeSetId: null };
    render();
  }

  async function deleteActiveSet() {
    const set = activeSet();
    if (!set) return;
    await CollectorDB.deleteSet(set.id);
    state.view = 'gallery';
    state.activeSetId = null;
    state.returnTo = { view: 'gallery', activeSetId: null };
    await reload();
  }

  function restoreAfter() {
    const rt = state.returnTo || {};
    if (rt.view === 'set' && rt.activeSetId != null) {
      state.view = 'set';
      state.activeSetId = rt.activeSetId;
    } else {
      state.view = 'gallery';
      state.activeSetId = null;
    }
  }

  function attachGallery() {
    const el = root;
    el.querySelector('#floating-overlay')?.remove();

    el.querySelector('#brand-home')?.addEventListener('click', () => {
      state.activeId = null;
      goHome();
    });
    el.querySelector('#btn-add')?.addEventListener('click', openNewSet);
    el.querySelector('#btn-add2')?.addEventListener('click', openNew);
    el.querySelector('#empty-add')?.addEventListener('click', openNew);

    el.querySelector('#search')?.addEventListener('input', (e) => {
      state.filters.query = e.target.value;
      refreshResultArea();
    });

    el.querySelector('#filter-toggle')?.addEventListener('click', () => {
      state.filterOpen = !state.filterOpen;
      render();
    });

    el.querySelector('#clear-filters')?.addEventListener('click', clearFilters);
    el.querySelector('#empty-clear')?.addEventListener('click', clearFilters);

    for (const id of ['f-artist', 'f-category', 'f-era', 'f-style']) {
      el.querySelector(`#${id}`)?.addEventListener('change', (e) => {
        state.filters[id.replace('f-', '')] = e.target.value;
        render();
      });
    }
    for (const chip of el.querySelectorAll('.color-opt')) {
      chip.addEventListener('click', () => {
        const c = chip.dataset.color;
        state.filters.color = state.filters.color === c ? '' : c;
        render();
      });
    }

    bindResultArea();
    bindSetChips();
    root.querySelector('#notice-dismiss')?.addEventListener('click', () => {
      state.notice = '';
      render();
    });

    el.querySelector('#btn-theme')?.addEventListener('click', toggleTheme);
    el.querySelector('#btn-select')?.addEventListener('click', toggleSelecting);
    el.querySelector('#sel-all')?.addEventListener('click', selectAll);
    el.querySelector('#sel-link')?.addEventListener('click', publishSelected);
    el.querySelector('#btn-links')?.addEventListener('click', showLinksDialog);
    el.querySelector('#sel-share')?.addEventListener('click', shareSelected);
    el.querySelector('#sel-txt')?.addEventListener('click', exportSelectedText);
    el.querySelector('#sel-xml')?.addEventListener('click', exportSelectedXml);
    el.querySelector('#sel-pdf')?.addEventListener('click', exportSelectedPdf);
    el.querySelector('#btn-export')?.addEventListener('click', exportBackup);
    el.querySelector('#btn-import')?.addEventListener('click', () =>
      el.querySelector('#import-file').click()
    );
    el.querySelector('#import-file')?.addEventListener('change', importBackup);
  }

  /* ---------------- form ---------------- */

  function blankArt() {
    return {
      title: '',
      artist: '',
      year: '',
      era: '',
      style: '',
      medium: '',
      materials: '',
      dimensions: '',
      location: '',
      category: '',
      edition: '',
      tags: [],
      primaryColor: '',
      palette: [],
      visibility: 'private',
      price: undefined,
      acquired: '',
      provenance: '',
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function resetForm() {
    for (const u of form.vurls) if (u) URL.revokeObjectURL(u);
    for (const u of form.murls) if (u) URL.revokeObjectURL(u);
    Object.assign(form, { images: [], vurls: [], murls: [], posters: [], durations: [], palette: [], titleTouched: false });
    detail.index = 0;
  }

  // Remove one working-media slot, revoking its preview/playable URLs.
  function formSpliceMedia(i) {
    if (form.vurls[i]) URL.revokeObjectURL(form.vurls[i]);
    if (form.murls[i]) URL.revokeObjectURL(form.murls[i]);
    form.images.splice(i, 1);
    form.vurls.splice(i, 1);
    form.murls.splice(i, 1);
    form.posters.splice(i, 1);
    form.durations.splice(i, 1);
  }

  function openNew() {
    state.returnTo = { view: 'gallery', activeSetId: null };
    state.view = 'form';
    state.activeId = null;
    state.formSetId = null;
    resetForm();
    render();
  }

  function openNewInSet(setId) {
    state.returnTo = { view: 'set', activeSetId: setId };
    state.view = 'form';
    state.activeId = null;
    state.formSetId = setId;
    resetForm();
    render();
  }

  function openEdit(id) {
    const art = state.artworks.find((a) => a.id === id);
    if (!art) return;
    resetForm();
    state.view = 'form';
    state.activeId = id;
    state.formSetId = art.setId ?? null;
    state.returnTo = state.returnTo && state.returnTo.view === 'set'
      ? state.returnTo
      : { view: 'gallery', activeSetId: null };
    const images = imgs(art);
    const posters = postersOf(art);
    const durations = durationsOf(art);
    form.images = images.slice();
    form.posters = images.map((_, i) => posters[i] || null);
    form.durations = images.map((_, i) => durations[i] ?? null);
    form.vurls = images.map((b, i) => {
      const p = form.posters[i];
      if (p && p.size) return URL.createObjectURL(p);
      return b && b.size ? URL.createObjectURL(b) : undefined;
    });
    form.murls = images.map((b) => (isVideo(b) && b.size ? URL.createObjectURL(b) : null));
    form.palette = (art.palette || []).filter(validHex);
    form.titleTouched = true;
    render();
  }

  function formHTML() {
const editing = state.activeId != null;
const art = editing
  ? state.artworks.find((a) => a.id === state.activeId) || blankArt()
  : null;

const field = (id, defaults) => {
  const val = art ? art[id] ?? '' : defaults ?? '';
  return esc(val);
};

const paletteRow = form.palette.length
  ? `<div class="palette-row" id="palette-row">${form.palette
      .map(
        (c) =>
          `<button type="button" class="chip${field('primaryColor', '') === c ? ' on' : ''}" data-color="${esc(c)}" style="background:${esc(c)}" title="${esc(c)}"></button>`
      )
      .join('')}</div>`
  : '';

    const seg = Object.entries(VISIBILITY_LABELS)
      .map(
        ([v, label]) =>
          `<button type="button" class="seg-opt${art ? (art.visibility === v ? ' on' : '') : v === 'private' ? ' on' : ''}" data-vis="${v}">${label}</button>`
      )
      .join('');

    const catOptions =
      `<option value="">Select category…</option>` +
      CATEGORY_PRESETS.map(
        (c) => `<option value="${esc(c)}"${art && art.category === c ? ' selected' : ''}>${esc(c)}</option>`
      ).join('');

    const backLabel = editing ? 'Cancel' : '←';
    const backClass = editing ? 'text-btn' : 'icon-btn';

    return `
      <div class="app sheet" id="form-sheet">
        <header class="sheet-header">
          <button class="${backClass}" id="form-back" aria-label="Back">${backLabel}</button>
          <h1>${editing ? 'Edit artwork' : 'New artwork'}</h1>
          <button class="text-btn primary-text" id="form-save">Save</button>
        </header>

        <div class="sheet-body">
          <div class="photo-pane" id="photo-pane">
            <div class="photo-grid" id="photo-grid"></div>
            ${paletteRow}
            <div class="photo-actions">
              <button class="primary" type="button" id="btn-capture">📷 Take photo</button>
              <button class="ghost" type="button" id="btn-record">🎥 Record video</button>
              <button class="ghost" type="button" id="btn-pick">Choose file(s)</button>
            </div>
            <p class="hint media-hint">Photos, or video clips of 30 seconds or less.</p>
            <button class="scan-label-btn" type="button" id="btn-scan">🏷 Scan Label</button>
            <input id="capture-input" type="file" accept="image/*" capture="environment" hidden />
            <input id="record-input" type="file" accept="video/*" capture hidden />
            <input id="pick-input" type="file" accept="image/*,video/*" multiple hidden />
            <input id="label-capture" type="file" accept="image/*" capture="environment" hidden />
          </div>

          <div class="form-section">
            <h2>Identification</h2>
            ${state.formSetId
              ? `<p class="hint">Adding to set: <strong>${esc((state.sets.find((s) => s.id === state.formSetId) || {}).name || '')}</strong></p>`
              : ''}
            <label>Title<input id="f-title" value="${field('title')}" placeholder="Untitled" autocomplete="off" /></label>
            <label>Artist<input id="f-artist" value="${field('artist')}" placeholder="e.g. Kara Walker" autocomplete="off" /></label>
            <div class="grid2">
              <label>Year<select id="f-year"><option value="">Unknown</option>${yearOptions(field('year'))}</select></label>
              <label>Era<select id="f-era"><option value="">Select…</option>${presetOptions(ERA_PRESETS, field('era'))}</select></label>
            </div>
            <label>Style / Movement<select id="f-style"><option value="">Select…</option>${presetOptions(STYLE_PRESETS, field('style'))}</select></label>
          </div>

          <div class="form-section">
            <h2>Classification</h2>
            <label>Category<select id="f-category">${catOptions}</select></label>
            <div class="grid2">
              <label>Medium<input id="f-medium" value="${field('medium')}" placeholder="Oil on canvas" autocomplete="off" /></label>
              <label>Materials<input id="f-materials" value="${field('materials')}" placeholder="Oak, brass" autocomplete="off" /></label>
            </div>
            <div class="grid2">
              <label>Dimensions (H × W × D)<input id="f-dimensions" value="${field('dimensions')}" placeholder="120 × 90 cm" autocomplete="off" /></label>
              <label>Location / Bin<input id="f-location" value="${field('location')}" placeholder="Storage B-12" autocomplete="off" /></label>
            </div>
            <label>Edition / Proof<input id="f-edition" value="${field('edition')}" placeholder="2/25" autocomplete="off" /></label>
            <label>Tags (comma separated)<input id="f-tags" value="${esc((art && art.tags || []).join(', '))}" placeholder="abstract, portrait, faded" autocomplete="off" /></label>
            <label>Main color
              <div class="colorrow">
                <span class="color-chip" id="primary-chip" style="background:${esc(field('primaryColor', '') || (form.palette[0] || '#000'))}"></span>
                <input id="f-primarycolor" value="${field('primaryColor', form.palette[0] || '')}" placeholder="${esc(form.palette[0] || '#C9A227')}" autocomplete="off" />
                ${form.palette.map((c) => `<button type="button" class="chip-opt${field('primaryColor', '') === c ? ' on' : ''}" data-color="${esc(c)}" style="background:${esc(c)}"></button>`).join('')}
              </div>
            </label>
          </div>

          <div class="form-section">
            <h2>Visibility</h2>
            <div class="seg">${seg}</div>
            <p class="hint">Private: only you · Unlisted: anyone with the link · Public: shown on your portfolio</p>
          </div>

          <div class="form-section">
            <h2>Valuation &amp; history</h2>
            <div class="grid2">
              <label>Purchase price (USD)<input id="f-price" inputmode="decimal" value="${art && art.price != null ? esc(art.price) : ''}" placeholder="12500" autocomplete="off" /></label>
              <label>Acquired<input id="f-acquired" value="${field('acquired')}" placeholder="2019-06-12" autocomplete="off" /></label>
            </div>
            <label>Provenance<textarea id="f-provenance" rows="2" placeholder="Estate of…, Christie’s lot 42, 2018">${field('provenance')}</textarea></label>
            <label>Notes<textarea id="f-notes" rows="3" placeholder="Condition notes, repairs, framing…">${field('notes')}</textarea></label>
          </div>

          <div class="form-error" id="form-error" hidden></div>

          <div class="sheet-footer">
            <button class="primary wide" id="form-save2">${editing ? 'Update artwork' : 'Add to collection'}</button>
          </div>
        </div>
      </div>`;
  }

  async function handleFile(file) {
    await handleFiles([file]);
  }

  async function handleFiles(files) {
    const list = Array.from(files || []).filter(
      (f) => f && f.type && (f.type.startsWith('image/') || f.type.startsWith('video/'))
    );
    if (!list.length) return;
    const shell = document.getElementById('form-sheet');
    const analyzing = document.createElement('div');
    analyzing.className = 'analyzing';
    analyzing.textContent = 'Adding media…';
    shell.querySelector('#photo-pane').appendChild(analyzing);

    const firstBefore = form.images.length === 0;
    const rejected = [];
    for (const f of list) {
      if (f.type.startsWith('video/')) {
        analyzing.textContent = 'Checking video…';
        let probe;
        try {
          probe = await probeVideo(f);
        } catch {
          rejected.push(`${f.name || 'Video'}: could not be read.`);
          continue;
        }
        if (probe.duration > MAX_VIDEO_SEC + 0.5) {
          rejected.push(`${f.name || 'Video'} is ${fmtDur(probe.duration)} — keep clips to 30 seconds or less.`);
          continue;
        }
        form.images.push(f);
        form.posters.push(probe.poster);
        form.durations.push(probe.duration);
        form.vurls.push(probe.poster ? URL.createObjectURL(probe.poster) : undefined);
        form.murls.push(URL.createObjectURL(f));
      } else {
        analyzing.textContent = 'Analyzing photos…';
        const resized = await ColorUtil.resizeImage(f, 2000, 0.9);
        form.images.push(resized);
        form.posters.push(null);
        form.durations.push(null);
        form.vurls.push(URL.createObjectURL(resized));
        form.murls.push(null);
        if (firstBefore && !form.titleTouched) {
          const rawTitle = (f.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
          if (rawTitle) {
            const t = shell.querySelector('#f-title');
            if (t) t.value = rawTitle;
            form.titleTouched = true;
          }
        }
      }
    }

    const src = paletteSource(form);
    form.palette = src ? await ColorUtil.extractPalette(src, 4) : [];
    analyzing.remove();
    if (rejected.length) alert(rejected.join('\n'));
    renderPhotoPane();
    syncFormPalette();
    renderPaletteArea();
  }

  function renderPhotoPane() {
    const shell = document.getElementById('form-sheet');
    if (!shell) return;
    const grid = shell.querySelector('#photo-grid');
    if (!grid) return;

    if (form.vurls.length) {
      grid.innerHTML = form.vurls
        .map((u, i) => {
          const video = isVideo(form.images[i]);
          const dur = form.durations[i];
          const media = video
            ? `<video class="tile-vid" src="${esc(form.murls[i] || '')}"${u ? ` poster="${esc(u)}"` : ''} muted playsinline preload="metadata"></video>
               <span class="tile-badge">▶${dur ? ` ${esc(fmtDur(dur))}` : ''}</span>`
            : u
              ? `<img class="tile-img" src="${esc(u)}" alt="Photo ${i + 1}" loading="lazy" />`
              : '<div class="no-img tile-empty"></div>';
          return `
        <div class="photo-tile${i === 0 ? ' cover' : ''}${video ? ' is-video' : ''}" data-i="${i}">
          ${media}
          <button type="button" class="tile-remove" data-i="${i}" aria-label="Remove ${video ? 'video' : 'photo'}">×</button>
          ${i === 0 ? '<span class="tile-cover">Cover</span>' : ''}
        </div>`;
        })
        .join('');
    } else {
      grid.innerHTML =
        '<div class="photo-placeholder"><span class="photo-icon">📷</span><p>Add photos or a video clip (30 sec max) — colors are detected automatically</p></div>';
    }

    for (const v of grid.querySelectorAll('.tile-vid')) {
      v.addEventListener('click', () => {
        for (const other of grid.querySelectorAll('.tile-vid')) {
          if (other !== v) other.pause();
        }
        if (v.paused) v.play().catch(() => {});
        else v.pause();
      });
    }
    for (const btn of grid.querySelectorAll('.tile-remove')) {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.i);
        formSpliceMedia(i);
        if (form.images.length) {
          const src = paletteSource(form);
          form.palette = src ? await ColorUtil.extractPalette(src, 4) : [];
        } else {
          form.palette = [];
          form.titleTouched = false;
        }
        renderPhotoPane();
        syncFormPalette();
        renderPaletteArea();
      });
    }
  }

  function syncFormPalette() {
    const shell = document.getElementById('form-sheet');
    if (!shell) return;
    const primaryInput = shell.querySelector('#f-primarycolor');
    if (form.palette.length && !primaryInput.value.trim()) {
      primaryInput.value = form.palette[0];
    }
    const chip = shell.querySelector('#primary-chip');
    if (chip) chip.style.background = form.palette[0] || '#000';
  }

  function renderPaletteArea() {
    const shell = document.getElementById('form-sheet');
    if (!shell) return;
    const pane = shell.querySelector('#photo-pane');
    const row = pane.querySelector('#palette-row');
    if (!form.palette.length) {
      row?.remove();
      return;
    }
    if (!row) {
      const newRow = document.createElement('div');
      newRow.className = 'palette-row';
      newRow.id = 'palette-row';
      pane.querySelector('#photo-grid')?.after(newRow);
    }
    const target = pane.querySelector('#palette-row');
    target.innerHTML = form.palette
      .map(
        (c) =>
          `<button type="button" class="chip${shell.querySelector('#f-primarycolor')?.value === c ? ' on' : ''}" data-color="${esc(c)}" style="background:${esc(c)}" title="${esc(c)}"></button>`
      )
      .join('');
    for (const c of target.querySelectorAll('.chip')) {
      c.addEventListener('click', () => {
        shell.querySelector('#f-primarycolor').value = c.dataset.color;
        shell.querySelector('#primary-chip').style.background = c.dataset.color;
        target.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      });
    }
  }

  function attachForm() {
    const shell = document.getElementById('form-sheet');
    if (!shell) return;

    shell.querySelector('#form-back')?.addEventListener('click', () => {
      restoreAfter();
      render();
    });

    const saveClick = () => saveForm();
    shell.querySelector('#form-save')?.addEventListener('click', saveClick);
    shell.querySelector('#form-save2')?.addEventListener('click', saveClick);
    shell.querySelector('#form-sheet')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault();
    });

    shell.querySelector('#btn-capture')?.addEventListener('click', () => shell.querySelector('#capture-input').click());
    shell.querySelector('#btn-record')?.addEventListener('click', () => shell.querySelector('#record-input').click());
    shell.querySelector('#btn-pick')?.addEventListener('click', () => shell.querySelector('#pick-input').click());
    shell.querySelector('#btn-scan')?.addEventListener('click', scanLabel);
    shell.querySelector('#capture-input')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) void handleFile(f);
      e.target.value = '';
    });
    shell.querySelector('#record-input')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) void handleFile(f);
      e.target.value = '';
    });
    shell.querySelector('#pick-input')?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) void handleFiles(files);
      e.target.value = '';
    });

    shell.querySelector('#f-title')?.addEventListener('input', (e) => {
      if (e.target.value.trim()) form.titleTouched = true;
    });

    const pane = shell.querySelector('#photo-pane');
    pane?.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const f = item.getAsFile();
          if (f) void handleFile(f);
        }
      }
    });

    for (const chip of shell.querySelectorAll('.chip-opt')) {
      chip.addEventListener('click', () => {
        shell.querySelector('#f-primarycolor').value = chip.dataset.color;
        shell.querySelector('#primary-chip').style.background = chip.dataset.color;
        shell.querySelectorAll('.chip-opt').forEach((x) => x.classList.toggle('on', x === chip));
      });
    }

    for (const seg of shell.querySelectorAll('.seg-opt')) {
      seg.addEventListener('click', () => {
        shell.querySelectorAll('.seg-opt').forEach((x) => x.classList.toggle('on', x === seg));
      });
    }

    renderPhotoPane();
  }

  async function saveForm() {
    const shell = document.getElementById('form-sheet');
    const errBox = shell.querySelector('#form-error');
    errBox.hidden = true;

    const val = (id) => (shell.querySelector(id)?.value || '').trim();

    if (!form.images.length || !form.images[0].size) {
      errBox.hidden = false;
      errBox.textContent = 'Add a photo or video first.';
      return;
    }

    const priceRaw = val('#f-price').replace(/,/g, '');
    let price = undefined;
    if (priceRaw) {
      price = Number(priceRaw);
      if (Number.isNaN(price)) {
        errBox.hidden = false;
        errBox.textContent = 'Price must be a number.';
        return;
      }
    }

    const visible = Array.from(shell.querySelectorAll('.seg-opt.on')).map((s) => s.dataset.vis)[0];
    const tags = val('#f-tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const now = Date.now();
    const isNew = state.activeId == null;
    const art = {
      title: val('#f-title'),
      artist: val('#f-artist'),
      year: val('#f-year'),
      era: val('#f-era'),
      style: val('#f-style'),
      medium: val('#f-medium'),
      materials: val('#f-materials'),
      dimensions: val('#f-dimensions'),
      location: val('#f-location'),
      category: val('#f-category'),
      edition: val('#f-edition'),
      tags,
      primaryColor: val('#f-primarycolor') || form.palette[0] || undefined,
      palette: form.palette,
      visibility: visible || 'private',
      price: price,
      acquired: val('#f-acquired'),
      provenance: val('#f-provenance'),
      notes: val('#f-notes'),
      images: form.images.slice(),
      image: form.images[0],
      posters: form.posters.slice(),
      durations: form.durations.slice(),
      setId: state.formSetId || undefined,
      createdAt: isNew ? now : undefined,
      updatedAt: now,
    };

    const saveBtn = shell.querySelector('#form-save');
    const saveBtn2 = shell.querySelector('#form-save2');
    const disable = (flag) => {
      saveBtn.disabled = flag;
      saveBtn2.disabled = flag;
      saveBtn2.textContent = flag ? 'Saving…' : state.activeId != null ? 'Update artwork' : 'Add to collection';
    };

    try {
      disable(true);
      if (state.activeId != null) {
        art.createdAt = state.artworks.find((a) => a.id === state.activeId)?.createdAt ?? now;
        await CollectorDB.updateArt(state.activeId, art);
      } else {
        await CollectorDB.addArt(art);
      }
      resetForm();
      state.formSetId = null;
      restoreAfter();
      await reload();
    } catch (e) {
      disable(false);
      errBox.hidden = false;
      errBox.textContent = 'Could not save. Storage may be full.';
    }
  }

  /* ---------------- detail ---------------- */

  /* ---------------- full-screen photo viewer ----------------
     Swipe left/right between photos, pinch or double-tap to zoom, drag to pan
     while zoomed, swipe down (or ✕ / Esc) to close. Pointer Events only. */

  function openViewer(art, startIndex, onChange) {
    const n = imgs(art).length;
    if (!n) return;
    const ov = document.createElement('div');
    ov.className = 'viewer';
    ov.innerHTML = `
      <div class="viewer-top">
        <span class="viewer-count"></span>
        <button type="button" class="viewer-close" aria-label="Close">✕</button>
      </div>
      <div class="viewer-track">${imgs(art).map((b, i) => {
        if (isVideo(b)) {
          const t = thumbForId(art.id, i);
          const d = durationsOf(art)[i];
          return `<div class="viewer-slide"><video src="${esc(urlForId(art.id, i) || '')}"${t ? ` poster="${esc(t)}"` : ''} controls playsinline preload="metadata" data-i="${i}"></video>${d ? `<span class="viewer-dur">${esc(fmtDur(d))}</span>` : ''}</div>`;
        }
        return `<div class="viewer-slide"><img src="${esc(urlForId(art.id, i) || '')}" alt="" draggable="false" /></div>`;
      }).join('')}</div>
      ${n > 1 ? `<button type="button" class="viewer-arrow prev" aria-label="Previous">‹</button>
                 <button type="button" class="viewer-arrow next" aria-label="Next">›</button>` : ''}`;
    document.body.appendChild(ov);

    const track = ov.querySelector('.viewer-track');
    const counter = ov.querySelector('.viewer-count');
    const W = () => ov.clientWidth || 1;
    const H = () => ov.clientHeight || 1;
    let index = Math.max(0, Math.min(n - 1, startIndex || 0));
    let scale = 1, tx = 0, ty = 0;

    const zoomEl = () => {
      const el = track.children[index].querySelector('img');
      return el && el.tagName === 'IMG' ? el : null; // zoom applies to photos only
    };
    const curIsVideo = () => !!track.children[index].querySelector('video');
    const pauseAll = () => track.querySelectorAll('video').forEach((v) => v.pause());
    const applyZoom = (animate) => {
      const el = zoomEl();
      if (!el) return;
      el.style.transition = animate ? 'transform .2s ease' : 'none';
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const resetZoom = (animate) => { scale = 1; tx = 0; ty = 0; applyZoom(animate); };
    const clampPan = () => {
      const el = zoomEl();
      if (!el) { tx = 0; ty = 0; return; }
      const mx = Math.max(0, (el.offsetWidth * scale - W()) / 2);
      const my = Math.max(0, (el.offsetHeight * scale - H()) / 2);
      tx = Math.max(-mx, Math.min(mx, tx));
      ty = Math.max(-my, Math.min(my, ty));
    };
    const goTo = (i, animate = true) => {
      i = Math.max(0, Math.min(n - 1, i));
      if (i !== index) { pauseAll(); resetZoom(false); index = i; onChange?.(index); }
      track.style.transition = animate ? 'transform .28s ease' : 'none';
      track.style.transform = `translateX(${-index * 100}%)`;
      counter.textContent = `${index + 1} / ${n}`;
      ov.classList.toggle('at-start', index === 0);
      ov.classList.toggle('at-end', index === n - 1);
    };
    const close = () => {
      pauseAll();
      document.removeEventListener('keydown', onKey);
      ov.remove();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'ArrowRight') goTo(index + 1);
    };
    document.addEventListener('keydown', onKey);
    ov.querySelector('.viewer-close').addEventListener('click', close);
    ov.querySelector('.viewer-arrow.prev')?.addEventListener('click', () => goTo(index - 1));
    ov.querySelector('.viewer-arrow.next')?.addEventListener('click', () => goTo(index + 1));
    goTo(index, false);

    /* gestures */
    const pts = new Map();
    let mode = null;     // 'drag' (swipe between photos) | 'pan' (move zoomed photo) | 'pinch'
    let start = null;
    let lastTap = 0, lastTapAt = null;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const rel = (p) => ({ x: p.x - W() / 2, y: p.y - H() / 2 }); // relative to slide centre
    const zoomAt = (p, s) => {
      // keep the photo point under `p` fixed while scaling from the current transform
      const px = (p.x - tx) / scale, py = (p.y - ty) / scale;
      scale = s; tx = p.x - px * s; ty = p.y - py * s;
      clampPan(); applyZoom(true);
    };

    ov.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.target.closest('video')) return; // native playback controls own the tap
      e.preventDefault();
      try { ov.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      track.style.transition = 'none';
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        mode = 'pinch';
        start = { dist: dist(a, b), mid: rel(mid(a, b)), scale, tx, ty };
      } else if (pts.size === 1) {
        mode = scale > 1 ? 'pan' : 'drag';
        start = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() };
      }
    });

    ov.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const s = Math.max(1, Math.min(6, start.scale * dist(a, b) / Math.max(1, start.dist)));
        const m = rel(mid(a, b));
        const px = (start.mid.x - start.tx) / start.scale, py = (start.mid.y - start.ty) / start.scale;
        scale = s; tx = m.x - px * s; ty = m.y - py * s;
        clampPan(); applyZoom(false);
      } else if (mode === 'pan') {
        tx = start.tx + (e.clientX - start.x);
        ty = start.ty + (e.clientY - start.y);
        clampPan(); applyZoom(false);
      } else if (mode === 'drag') {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dy) > Math.abs(dx)) {
          track.style.transform = `translate(${-index * 100}%, ${Math.max(0, dy)}px)`;
          ov.style.background = `rgba(0,0,0,${Math.max(0.4, 1 - Math.max(0, dy) / 400)})`;
        } else {
          track.style.transform = `translateX(calc(${-index * 100}% + ${dx}px))`;
        }
      }
    });

    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (mode === 'pinch') {
        if (pts.size === 1) {
          const q = [...pts.values()][0];
          if (scale <= 1.02) resetZoom(true);
          mode = scale > 1 ? 'pan' : 'drag';
          start = { x: q.x, y: q.y, tx, ty, t: Date.now() };
          return;
        }
        if (scale <= 1.02) resetZoom(true);
        mode = null;
        return;
      }
      if (mode === 'drag' || mode === 'pan') {
        const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = Date.now() - start.t;
        const isTap = Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 350;
        if (isTap) {
          const now = Date.now();
          if (now - lastTap < 300 && lastTapAt && dist(lastTapAt, p) < 40) {
            lastTap = 0;
            if (!curIsVideo()) {
              if (scale > 1) resetZoom(true);
              else zoomAt(rel(p), 2.5);
            }
          } else {
            lastTap = now; lastTapAt = p;
          }
          if (mode === 'drag') goTo(index, true);
        } else if (mode === 'drag') {
          ov.style.background = '';
          if (Math.abs(dy) > Math.abs(dx) && dy > 90) { close(); return; }
          const fast = Math.abs(dx) > 40 && dt < 250;
          if (Math.abs(dx) > W() * 0.2 || fast) goTo(index + (dx < 0 ? 1 : -1));
          else goTo(index);
        }
      }
      mode = null;
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', end);
    ov.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function detailHTML() {
    const art = state.artworks.find((a) => a.id === state.activeId);
    if (!art) return '<div class="app empty"><button class="ghost" id="back-empty">Back</button></div>';

    const photos = imgs(art);
    if (detail.index >= photos.length) detail.index = 0;

    const row = (label, value) =>
      value !== undefined && value !== null && String(value).trim() !== ''
        ? `<div class="meta-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`
        : '';

    const hasUrls = !!urlForId(art.id, 0);
    const durs = durationsOf(art);
    const stageMedia = (b, i) => {
      if (isVideo(b)) {
        const t = thumbForId(art.id, i);
        return `<video src="${esc(urlForId(art.id, i) || '')}"${t ? ` poster="${esc(t)}"` : ''} preload="metadata" playsinline controls data-i="${i}"></video>
          <button type="button" class="stage-expand" data-i="${i}" aria-label="View video full screen">⤢</button>
          ${durs[i] ? `<span class="stage-dur">${esc(fmtDur(durs[i]))}</span>` : ''}`;
      }
      return `<img src="${esc(urlForId(art.id, i) || '')}" alt="${esc(art.title || 'artwork')}" data-i="${i}" draggable="false" />`;
    };
    const slides = photos
      .map((b, i) => `<div class="stage-slide">${stageMedia(b, i)}</div>`)
      .join('');
    const dots = photos.length > 1
      ? `<div class="stage-dots" id="stage-dots">${photos.map((_, i) => `<span class="${i === detail.index ? 'on' : ''}"></span>`).join('')}</div>`
      : '';
    const arrows = photos.length > 1
      ? `<button type="button" class="stage-arrow prev" id="stage-prev" aria-label="Previous photo">‹</button>
         <button type="button" class="stage-arrow next" id="stage-next" aria-label="Next photo">›</button>`
      : '';
    const strip =
      photos.length > 1
      ? `<div class="thumb-strip">${photos
          .map(
            (b, i) => {
              const video = isVideo(b);
              return `<button type="button" class="strip-thumb${i === detail.index ? ' on' : ''}${video ? ' is-video' : ''}" data-i="${i}" aria-label="${video ? 'Video' : 'Photo'} ${i + 1}"><img src="${esc(thumbForId(art.id, i) || '')}" alt="" loading="lazy" />${video ? '<span class="strip-play">▶</span>' : ''}</button>`;
            }
            )
            .join('')}</div>`
      : '';

    const setMeta = art.setId ? (state.sets.find((s) => s.id === art.setId) || {}).name : '';
    const meta =
      (setMeta ? row('Set', setMeta) : '') +
      row('Artist', art.artist) +
      row('Year', art.year) +
      row('Era', art.era) +
      row('Style', art.style) +
      row('Category', art.category) +
      row('Medium', art.medium) +
      row('Materials', art.materials) +
      row('Dimensions', art.dimensions) +
      row('Edition', art.edition) +
      row('Location', art.location) +
      (art.tags?.length ? `<div class="meta-row"><dt>Tags</dt><dd class="tags">${art.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</dd></div>` : '') +
      row('Price (USD)', art.price != null ? `$${Number(art.price).toLocaleString()}` : undefined) +
      row('Acquired', art.acquired) +
      row('Provenance', art.provenance) +
      row('Notes', art.notes);
    return `
      <div class="app detail">
        <header class="sheet-header detail-header">
          <button class="icon-btn" id="detail-back" aria-label="Back">←</button>
          <h1>${esc(art.title || 'Untitled')}</h1>
          <button class="text-btn" id="detail-edit">Edit</button>
        </header>
        <div class="detail-scroll">
          <div class="stage">
            ${hasUrls ? `<div class="stage-track" id="stage-track">${slides}</div>${dots}${arrows}` : '<div class="no-img stage-empty"></div>'}
            ${VISIBILITY_LABELS[art.visibility] ? `<span class="badge badge-${esc(art.visibility)}">${VISIBILITY_LABELS[art.visibility]}</span>` : ''}
          </div>
          ${strip}
          ${art.palette?.length ? `<div class="palette-row big">${art.palette.map((c) => `<span style="background:${esc(c)}" title="${esc(c)}"></span>`).join('')}</div>` : ''}
          <div class="meta">${meta}</div>
          <div class="detail-actions">
            <button class="ghost wide" id="detail-edit2">Edit</button>
            <button class="ghost wide" id="detail-share">Share photos</button>
            <button class="ghost wide" id="detail-link">Get link</button>
            <button class="ghost danger-ghost wide" id="detail-delete">Delete</button>
            <div class="confirm-row" id="confirm-row" hidden>
              <span>Delete this piece?</span>
              <button class="danger" id="confirm-delete">Yes, delete</button>
              <button class="ghost" id="confirm-cancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function attachDetail() {
    const shell = root;
    shell.querySelector('#detail-back')?.addEventListener('click', () => {
      restoreAfter();
      render();
    });
    shell.querySelector('#back-empty')?.addEventListener('click', () => {
      restoreAfter();
      render();
    });
    const edit = () => openEdit(state.activeId);
    shell.querySelector('#detail-edit')?.addEventListener('click', edit);
    shell.querySelector('#detail-edit2')?.addEventListener('click', edit);
    const track = shell.querySelector('#stage-track');
    if (track) {
      const art = state.artworks.find((a) => a.id === state.activeId);
      const count = track.children.length;
      const syncUI = () => {
        shell.querySelectorAll('.strip-thumb').forEach((t) => t.classList.toggle('on', Number(t.dataset.i) === detail.index));
        shell.querySelectorAll('#stage-dots span').forEach((d, i) => d.classList.toggle('on', i === detail.index));
        shell.querySelector('.strip-thumb.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      };
      const setIndex = (i, smooth = true) => {
        i = Math.max(0, Math.min(count - 1, i));
        track.querySelectorAll('video').forEach((v) => v.pause());
        track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
        if (i !== detail.index) { detail.index = i; syncUI(); }
      };
      if (detail.index) requestAnimationFrame(() => setIndex(detail.index, false));
      let timer;
      track.addEventListener('scroll', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
          if (i !== detail.index && i >= 0 && i < count) {
            track.querySelectorAll('video').forEach((v) => v.pause());
            detail.index = i; syncUI();
          }
        }, 60);
      }, { passive: true });
      for (const thumb of shell.querySelectorAll('.strip-thumb')) {
        thumb.addEventListener('click', () => setIndex(Number(thumb.dataset.i)));
      }
      shell.querySelector('#stage-prev')?.addEventListener('click', () => setIndex(detail.index - 1));
      shell.querySelector('#stage-next')?.addEventListener('click', () => setIndex(detail.index + 1));
      track.addEventListener('click', (e) => {
        if (!art) return;
        // Taps on video go to its own playback controls — ⤢ opens full screen.
        const exp = e.target.closest('.stage-expand');
        if (exp) { openViewer(art, Number(exp.dataset.i), (i) => setIndex(i, false)); return; }
        const img = e.target.closest('img');
        if (img) openViewer(art, Number(img.dataset.i), (i) => setIndex(i, false));
      });
    }
    shell.querySelector('#detail-delete')?.addEventListener('click', () => {
      shell.querySelector('#confirm-row').hidden = false;
    });
    shell.querySelector('#confirm-cancel')?.addEventListener('click', () => {
      shell.querySelector('#confirm-row').hidden = true;
    });
    shell.querySelector('#confirm-delete')?.addEventListener('click', async () => {
      await CollectorDB.deleteArt(state.activeId);
      state.activeId = null;
      state.view = 'gallery';
      await reload();
    });
    shell.querySelector('#detail-share')?.addEventListener('click', () => {
      const art = state.artworks.find((a) => a.id === state.activeId);
      if (!art) return;
      shareContent({
        title: art.title || 'Untitled',
        subject: art.title || 'Untitled',
        text: artToText(art),
        files: allFiles(art),
      });
    });
    shell.querySelector('#detail-link')?.addEventListener('click', () => {
      const art = state.artworks.find((a) => a.id === state.activeId);
      if (!art) return;
      publishLink({ title: art.title || 'Untitled', groups: [{ name: '', pieces: [art] }] });
    });
  }

  /* ---------------- export / import ---------------- */

  async function exportBackup() {
    const [rows, sets] = await Promise.all([CollectorDB.getAll(), CollectorDB.getAllSets()]);
    const out = await Promise.all(
      rows.map(async (a) => {
        const { image, ...rest } = a;
        const dataUrls = await Promise.all(
          imgs(a).map((b) => (b && b.size ? blobToDataURL(b) : null))
        );
        const posterUrls = await Promise.all(
          postersOf(a).map((b) => (b && b.size ? blobToDataURL(b) : null))
        );
        return {
          ...rest,
          imagesDataUrl: dataUrls.filter(Boolean),
          imageDataUrl: dataUrls[0] || null,
          postersDataUrl: posterUrls,
          durations: durationsOf(a),
        };
      })
    );
    const name = `collector-backup-${new Date().toISOString().slice(0, 10)}.json`;
    download(name, new Blob([JSON.stringify({ sets, artworks: out }, null, 2)], { type: 'application/json' }));
  }

  async function importBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.artworks;
      if (!Array.isArray(list)) throw new Error('bad file');

      const setIdMap = {};
      let setCount = 0;
      if (!Array.isArray(data) && Array.isArray(data.sets)) {
        for (const s of data.sets) {
          if (!s || !s.name) continue;
          const newId = await CollectorDB.addSet({
            name: s.name,
            createdAt: s.createdAt || Date.now(),
          });
          setIdMap[s.id] = newId;
          setCount++;
        }
      }

      let count = 0;
      for (const item of list) {
        const sources = Array.isArray(item.imagesDataUrl) && item.imagesDataUrl.length
          ? item.imagesDataUrl
          : item.imageDataUrl
            ? [item.imageDataUrl]
            : [];
        const images = sources.map(dataURLToBlob).filter((b) => b.size);
        if (!images.length) continue;
        const srcPosters = Array.isArray(item.postersDataUrl) ? item.postersDataUrl : [];
        const srcDurs = Array.isArray(item.durations) ? item.durations : [];
        const posters = images.map((_, i) => {
          try { return srcPosters[i] ? dataURLToBlob(srcPosters[i]) : null; } catch { return null; }
        });
        const durations = images.map((_, i) => (typeof srcDurs[i] === 'number' ? srcDurs[i] : null));
        const { imagesDataUrl, imageDataUrl, postersDataUrl, durations: _d, id, ...rest } = item;
        await CollectorDB.addArt({
          ...rest,
          images,
          image: images[0],
          posters,
          durations,
          setId: setIdMap[item.setId] || undefined,
          createdAt: item.createdAt || Date.now(),
        });
        count++;
      }
      const extra = setCount ? ` and ${setCount} set${setCount === 1 ? '' : 's'}` : '';
      alert(`Imported ${count} artwork${count === 1 ? '' : 's'}${extra}.`);
      await reload();
    } catch {
      alert('Could not read that file. Expected a Collector backup JSON.');
    }
  }

  /* ---------------- filters ---------------- */

  function clearFilters() {
    state.filters = { query: '', artist: '', category: '', era: '', style: '', color: '' };
    render();
  }

  /* ---------------- render / init ---------------- */

  function render() {
    const el = root;
    if (state.view === 'form') {
      el.innerHTML = formHTML();
      attachForm();
    } else if (state.view === 'detail') {
      el.innerHTML = detailHTML();
      attachDetail();
    } else if (state.view === 'set') {
      el.innerHTML = setViewHTML();
      attachSet();
    } else {
      el.innerHTML = galleryHTML();
      attachGallery();
    }
    window.scrollTo(0, 0);
  }

  async function init() {
    applyTheme(currentTheme());
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker
        .register('./sw.js')
        .catch(() => {});
    }
    let rows = [];
    try {
      rows = await CollectorDB.getAll();
    } catch (err) {
      root.innerHTML = `<div class="app empty"><div class="empty-icon">⚠️</div><p>This browser can't use its local database here. Serve the folder over HTTP and reload, e.g. open a terminal in this folder and run:<br><code>ruby -run -e httpd . -p 8000</code><br><code>python3 -m http.server 8000</code></p></div>`;
      return;
    }
    const purged = await purgeShells(rows);
    await repairPalettes(rows);
    rows = await CollectorDB.getAll();
    if (purged) {
      state.notice = `Removed ${purged} damaged record${purged === 1 ? '' : 's'} — photos erased by an earlier bug can't be restored. Anything you add from now on is saved safely.`;
    }
    state.artworks = rows;
    state.urls = refreshUrls(rows);
    let sets = [];
    try {
      sets = await CollectorDB.getAllSets();
    } catch {
      sets = [];
    }
    state.sets = (sets || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    render();
  }

  init();
})();