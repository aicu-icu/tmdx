import { Terminal } from './lib/xterm.mjs';
import { FitAddon } from './lib/addon-fit.mjs';
import { WebLinksAddon } from './lib/addon-web-links.mjs';

// tmdx - Mobile-first terminal pane management
(function() {
  'use strict';

  // Map of note pane ID -> { monacoEditor, resizeObserver }
  const noteEditors = new Map();

  const RESIZE_HOLD_DURATION = 150;
  const SNAP_THRESHOLD = 38; // px in canvas space
  const SNAP_GAP = 10; // px gap between snapped panes

  // Single source of truth for default pane sizes (client-authoritative)
  const PANE_DEFAULTS = {
    'terminal':  { width: 600, height: 400 },
    'file':      { width: 600, height: 400 },
    'note':      { width: 400, height: 250 },
    'git-graph': { width: 500, height: 450 },
    'iframe':    { width: 800, height: 600 },
    'folder':    { width: 400, height: 500 },
    'todo':      { width: 420, height: 500 },
  };

  let state = {
    panes: [],        // Panes can be type: 'terminal' or 'file'
    zoom: 1,
    panX: 0,
    panY: 0,
    nextZIndex: 1
  };

  // File editors map (paneId -> { originalContent, hasChanges, fileHandle })
  const fileEditors = new Map();

  // === Placement Mode State ===
  let placementMode = null; // { type: 'terminal'|'file'|'note'|'git-graph', cursorEl: HTMLElement }

  // Git graph panes map (paneId -> { refreshInterval })
  const gitGraphPanes = new Map();

  // Folder panes map (paneId -> { refreshInterval })
  const folderPanes = new Map();

  // Todo panes map (paneId -> { todoData })
  const todoPanes = new Map();

  // === Notification System State ===
  let notificationContainer = null;
  const activeToasts = new Map(); // terminalId -> toast element
  const snoozedNotifications = new Map(); // terminalId -> { snoozeUntil, state, info }
  const snoozeCount = new Map(); // key -> count (escalation tracking)
  let snoozeDurationMs = 90 * 1000;
  let notificationSoundEnabled = true;
  let autoRemoveDoneNotifs = false;
  let focusMode = 'hover'; // 'hover' (default) or 'click' — how mouse selects panes
  let isComposing = false; // true during IME composition (Chinese/Japanese/Korean input)
  window.__VERSION__ = ''; // replaced by build script
  let tutorialsCompleted = {};
  const originalTitle = 'TmdX';

  // Expanded pane state
  let expandedPaneId = null;

  // Quick View state
  let quickViewActive = false;
  let deviceHoverActive = false;

  // Last focused pane tracking (for auto-refocus on keypress)
  let lastFocusedPaneId = null;

  // Move Mode state (WASD pane navigation)
  let moveModeActive = false;
  let moveModePaneId = null;   // pane currently highlighted in move mode
  let lastTabUpTime = 0;       // timestamp for double-tap Tab detection
  let moveModeOriginalZoom = 1;  // zoom before entering move mode (for Esc restore)

  // Shortcut number helpers (Tab+1..9 quick-jump)
  function getNextShortcutNumber() {
    const used = new Set(state.panes.map(p => p.shortcutNumber).filter(Boolean));
    for (let n = 1; n <= 9; n++) {
      if (!used.has(n)) return n;
    }
    return null; // all 1-9 taken
  }

  function shortcutBadgeHtml(paneData) {
    const num = paneData.shortcutNumber;
    if (!num) return '';
    return `<span class="pane-shortcut-badge" data-tooltip="Tab+${num} to jump here (click to reassign)">${num}</span>`;
  }

  function paneNameHtml(paneData) {
    const name = paneData.paneName || '';
    const display = name ? escapeHtml(name) : 'Name';
    const cls = name ? 'pane-name' : 'pane-name empty';
    return `<span class="${cls}">${display}</span>`;
  }

  function jumpToPane(paneData) {
    // Same zoom/center behavior as move mode confirm
    const targetZoom = calcMoveModeZoom(paneData);
    state.zoom = targetZoom;
    const paneCenterX = paneData.x + paneData.width / 2;
    const paneCenterY = paneData.y + paneData.height / 2;
    state.panX = window.innerWidth / 2 - paneCenterX * state.zoom;
    state.panY = window.innerHeight / 2 - paneCenterY * state.zoom;

    canvas.style.transition = 'transform 100ms ease';
    updateCanvasTransform();
    setTimeout(() => { canvas.style.transition = ''; }, 120);

    focusPane(paneData);
    setTimeout(() => { focusTerminalInput(paneData.id); }, 50);
    saveViewState();
  }

  function reassignShortcutNumber(paneData, newNum) {
    // Swap if another pane has this number
    const existing = state.panes.find(p => p.shortcutNumber === newNum && p.id !== paneData.id);
    if (existing) {
      existing.shortcutNumber = paneData.shortcutNumber || null;
      updateShortcutBadge(existing);
      cloudSaveLayout(existing);
    }
    paneData.shortcutNumber = newNum;
    updateShortcutBadge(paneData);
    cloudSaveLayout(paneData);
  }

  function updateShortcutBadge(paneData) {
    const paneEl = document.getElementById(`pane-${paneData.id}`);
    if (!paneEl) return;
    // Remove any existing badge or input
    paneEl.querySelectorAll('.pane-shortcut-badge').forEach(el => el.remove());
    if (paneData.shortcutNumber) {
      const headerRight = paneEl.querySelector('.pane-header-right');
      if (headerRight) {
        const badge = document.createElement('span');
        badge.className = 'pane-shortcut-badge';
        badge.dataset.tooltip = `Tab+${paneData.shortcutNumber} (click to reassign)`;
        badge.textContent = paneData.shortcutNumber;
        headerRight.insertBefore(badge, headerRight.firstChild);
      }
    }
  }

  // Shortcut assign popup — floating overlay that captures a single keypress
  let shortcutPopup = null;
  function showShortcutAssignPopup(paneData) {
    closeShortcutAssignPopup();
    const paneEl = document.getElementById(`pane-${paneData.id}`);
    if (!paneEl) return;
    const badge = paneEl.querySelector('.pane-shortcut-badge');
    if (!badge) return;

    const rect = badge.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'shortcut-assign-popup';
    popup.innerHTML = `<span class="shortcut-assign-label">Press 1-9</span>`;
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.top = `${rect.bottom + 6}px`;
    document.body.appendChild(popup);

    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        closeShortcutAssignPopup();
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        reassignShortcutNumber(paneData, parseInt(e.key, 10));
        closeShortcutAssignPopup();
      }
    };
    const onClickOutside = (e) => {
      if (!popup.contains(e.target)) {
        closeShortcutAssignPopup();
      }
    };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('mousedown', onClickOutside, true), 0);

    shortcutPopup = { popup, onKey, onClickOutside };
  }

  function closeShortcutAssignPopup() {
    if (!shortcutPopup) return;
    const { popup, onKey, onClickOutside } = shortcutPopup;
    popup.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onClickOutside, true);
    shortcutPopup = null;
  }

  // ── Minimap ──────────────────────────────────────────────────────────
  let minimapEnabled = true;   // Tab+M toggle
  let minimapVisible = false;
  let minimapRafId = null;
  let minimapCollapsed = false; // UI collapse state (persisted to localStorage)

  function createMinimap() {
    const wrap = document.createElement('div');
    wrap.id = 'minimap';
    wrap.style.display = 'none';
    wrap.innerHTML = '<canvas id="minimap-canvas" width="400" height="300"></canvas>';

    const collapseBtn = document.createElement('button');
    collapseBtn.id = 'minimap-collapse';
    collapseBtn.setAttribute('aria-label', 'Hide minimap');
    collapseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    wrap.appendChild(collapseBtn);

    document.body.appendChild(wrap);

    const cvs = document.getElementById('minimap-canvas');
    const ctx = cvs.getContext('2d');

    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMinimapCollapsed(true);
    });
    collapseBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    // Click to navigate
    wrap.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      navigateFromMinimap(e, rect, cvs);

      const onMove = (me) => navigateFromMinimap(me, rect, cvs);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    return { wrap, cvs, ctx };
  }

  function navigateFromMinimap(e, rect, cvs) {
    if (state.panes.length === 0) return;
    const bounds = getCanvasBounds();
    if (!bounds) return;
    const padding = 40;
    const bw = bounds.maxX - bounds.minX + padding * 2;
    const bh = bounds.maxY - bounds.minY + padding * 2;
    const scale = Math.min(cvs.width / bw, cvs.height / bh);
    const offsetX = (cvs.width - bw * scale) / 2;
    const offsetY = (cvs.height - bh * scale) / 2;

    const mx = (e.clientX - rect.left) * (cvs.width / rect.width);
    const my = (e.clientY - rect.top) * (cvs.height / rect.height);

    // Convert minimap coords to canvas coords
    const canvasX = (mx - offsetX) / scale + bounds.minX - padding;
    const canvasY = (my - offsetY) / scale + bounds.minY - padding;

    state.panX = window.innerWidth / 2 - canvasX * state.zoom;
    state.panY = window.innerHeight / 2 - canvasY * state.zoom;
    updateCanvasTransform();
    saveViewState();
  }

  function getCanvasBounds() {
    if (state.panes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of state.panes) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + p.width > maxX) maxX = p.x + p.width;
      if (p.y + p.height > maxY) maxY = p.y + p.height;
    }
    return { minX, minY, maxX, maxY };
  }

  let minimapEls = null;

  function renderMinimap() {
    if (!minimapEls) minimapEls = createMinimap();
    const { wrap, cvs, ctx } = minimapEls;

    if (state.panes.length === 0) {
      wrap.style.display = 'none';
      if (minimapVisible) { minimapVisible = false; document.body.classList.add('minimap-hidden'); }
      return;
    }

    const shouldShow = minimapEnabled && !minimapCollapsed;
    if (!shouldShow) {
      if (minimapVisible) {
        wrap.style.display = 'none';
        minimapVisible = false;
        document.body.classList.add('minimap-hidden');
      }
      return;
    }

    if (!minimapVisible) {
      wrap.style.display = 'block';
      minimapVisible = true;
      document.body.classList.remove('minimap-hidden');
    }

    const bounds = getCanvasBounds();
    if (!bounds) return;

    const padding = 40;
    const bw = bounds.maxX - bounds.minX + padding * 2;
    const bh = bounds.maxY - bounds.minY + padding * 2;
    const scale = Math.min(cvs.width / bw, cvs.height / bh);
    const offsetX = (cvs.width - bw * scale) / 2;
    const offsetY = (cvs.height - bh * scale) / 2;

    const toMiniX = (x) => offsetX + (x - bounds.minX + padding) * scale;
    const toMiniY = (y) => offsetY + (y - bounds.minY + padding) * scale;

    // Clear
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(0, 0, cvs.width, cvs.height, 8);
    ctx.fill();

    // Pane type colors
    const typeColors = {
      terminal: 'rgba(78, 201, 176, 0.6)',
      file: 'rgba(100, 149, 237, 0.6)',
      note: 'rgba(255, 213, 79, 0.6)',
      'git-graph': 'rgba(255, 138, 101, 0.6)',
      iframe: 'rgba(171, 130, 255, 0.6)',
      folder: 'rgba(139, 195, 74, 0.6)',
    };
    const typeColorsActive = {
      terminal: 'rgba(78, 201, 176, 0.9)',
      file: 'rgba(100, 149, 237, 0.9)',
      note: 'rgba(255, 213, 79, 0.9)',
      'git-graph': 'rgba(255, 138, 101, 0.9)',
      iframe: 'rgba(171, 130, 255, 0.9)',
      folder: 'rgba(139, 195, 74, 0.9)',
    };

    // Draw panes
    const focusedEl = document.querySelector('.pane.focused');
    const focusedId = focusedEl ? focusedEl.dataset.paneId : null;

    for (const p of state.panes) {
      const rx = toMiniX(p.x);
      const ry = toMiniY(p.y);
      const rw = p.width * scale;
      const rh = p.height * scale;

      const isFocused = p.id === focusedId;
      const isMoveTarget = moveModeActive && p.id === moveModePaneId;

      // Pane fill
      ctx.fillStyle = (isFocused || isMoveTarget)
        ? (typeColorsActive[p.type] || 'rgba(255,255,255,0.9)')
        : (typeColors[p.type] || 'rgba(255,255,255,0.4)');
      ctx.beginPath();
      ctx.roundRect(rx, ry, Math.max(rw, 2), Math.max(rh, 2), 2);
      ctx.fill();

      // Border for active pane
      if (isFocused || isMoveTarget) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Shortcut number
      if (p.shortcutNumber && rw > 10 && rh > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.min(Math.max(rh * 0.5, 8), 14)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.shortcutNumber), rx + rw / 2, ry + rh / 2);
      }
    }

    // Viewport indicator
    const vpLeft = (0 - state.panX) / state.zoom;
    const vpTop = (0 - state.panY) / state.zoom;
    const vpWidth = window.innerWidth / state.zoom;
    const vpHeight = window.innerHeight / state.zoom;

    const vrx = toMiniX(vpLeft);
    const vry = toMiniY(vpTop);
    const vrw = vpWidth * scale;
    const vrh = vpHeight * scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(vrx, vry, vrw, vrh);
    ctx.setLineDash([]);

  }

  let minimapTimerId = null;

  function hideMinimap() {
    if (minimapTimerId) { clearTimeout(minimapTimerId); minimapTimerId = null; }
    if (minimapRafId) { cancelAnimationFrame(minimapRafId); minimapRafId = null; }
    if (minimapEls) {
      minimapEls.wrap.style.display = 'none';
      minimapVisible = false;
    }
    document.body.classList.add('minimap-hidden');
  }

  // Single loop: renders at 60fps when visible, polls at 5fps when hidden
  function startMinimapLoop() {
    if (minimapRafId || minimapTimerId) return; // already running
    function tick() {
      renderMinimap();
      if (minimapVisible) {
        minimapRafId = requestAnimationFrame(tick);
      } else {
        minimapTimerId = setTimeout(() => {
          minimapRafId = requestAnimationFrame(tick);
        }, 200);
      }
    }
    minimapRafId = requestAnimationFrame(tick);
  }

  function toggleMinimapCollapsed(collapsed) {
    minimapCollapsed = collapsed;
    try { localStorage.setItem('minimap-collapsed', collapsed); } catch (_) {}

    const expandBtn = document.getElementById('minimap-expand');
    if (collapsed) {
      hideMinimap();
      if (expandBtn) expandBtn.style.display = 'flex';
    } else {
      if (expandBtn) expandBtn.style.display = 'none';
      if (minimapEnabled) startMinimapLoop();
    }
  }

  // Calculate pane placement position from click or center of viewport
  function calcPlacementPos(placementPos, halfW, halfH) {
    if (placementPos) {
      return { x: placementPos.x - halfW, y: placementPos.y - halfH };
    }
    const viewCenterX = (window.innerWidth / 2 - state.panX) / state.zoom;
    const viewCenterY = (window.innerHeight / 2 - state.panY) / state.zoom;
    return { x: viewCenterX - halfW, y: viewCenterY - halfH };
  }

  // Pane type to REST endpoint mapping (shared)
  const PANE_ENDPOINT_MAP = { file: 'file-panes', note: 'notes', terminal: 'terminals', 'git-graph': 'git-graphs', iframe: 'iframes', folder: 'folder-panes', todo: 'todos' };

  // Shared SVG icon inner content (without <svg> wrapper, for flexible reuse with different sizes/styles)
  const ICON_GIT_GRAPH = '<circle cx="7" cy="6" r="2.5" fill="currentColor"/><circle cx="17" cy="6" r="2.5" fill="currentColor"/><circle cx="7" cy="18" r="2.5" fill="currentColor"/><line x1="7" y1="8.5" x2="7" y2="15.5" stroke="currentColor" stroke-width="2"/><path d="M17 8.5c0 4-10 4-10 7" stroke="currentColor" stroke-width="2" fill="none"/>';
  const ICON_FOLDER = '<path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" fill="none" stroke="currentColor" stroke-width="2"/>';

  // Check if an interactive element outside of panes currently has focus
  // (e.g. HUD search inputs, modal inputs). Used to prevent focus-stealing.
  function isExternalInputFocused() {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    if (el.closest('.pane')) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  // File handles for native file picker (for saving back)
  const fileHandles = new Map(); // paneId -> FileSystemFileHandle

  // Save view state to cloud
  function saveViewState() {
    cloudSaveViewState();
  }

  // Terminal instances and WebSocket
  const terminals = new Map(); // paneId -> { xterm, fitAddon }
  let terminalMouseDown = false; // pause output writes while mouse is held on any terminal

  // Deferred output buffer — only used when selection is active or mouse is held
  const termDeferredBuffers = new Map(); // terminalId -> Uint8Array[]
  let deferFlushPending = false;

  function flushDeferredOutputs() {
    deferFlushPending = false;
    for (const [terminalId, chunks] of termDeferredBuffers) {
      if (chunks.length === 0) continue;
      const termInfo = terminals.get(terminalId);
      if (!termInfo) { chunks.length = 0; continue; }
      if (terminalMouseDown || termInfo.xterm.hasSelection()) {
        // Still selecting — cap at 512KB to prevent memory bloat
        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        if (totalLen < 524288) {
          if (!deferFlushPending) {
            deferFlushPending = true;
            requestAnimationFrame(flushDeferredOutputs);
          }
          continue;
        }
      }
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      chunks.length = 0;
      termInfo.xterm.write(merged);
    }
  }

  // Write terminal output immediately, unless selection is active
  function writeTermOutput(terminalId, data) {
    const termInfo = terminals.get(terminalId);
    if (!termInfo) return;

    // If selecting, defer writes to avoid clearing selection
    if (terminalMouseDown || termInfo.xterm.hasSelection()) {
      let buf = termDeferredBuffers.get(terminalId);
      if (!buf) {
        buf = [];
        termDeferredBuffers.set(terminalId, buf);
      }
      buf.push(data);
      if (!deferFlushPending) {
        deferFlushPending = true;
        requestAnimationFrame(flushDeferredOutputs);
      }
      return;
    }

    // Flush any deferred data first, then write new data
    const deferred = termDeferredBuffers.get(terminalId);
    if (deferred && deferred.length > 0) {
      const totalLen = deferred.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of deferred) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      deferred.length = 0;
      termInfo.xterm.write(merged);
    }

    termInfo.xterm.write(data);
  }
  // Ctrl+Shift+D — dump full terminal diagnostic state to console
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      console.log('=== TERMINAL DIAGNOSTICS (Ctrl+Shift+D) ===');
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`terminalMouseDown: ${terminalMouseDown}`);
      console.log(`deferFlushPending: ${deferFlushPending}`);
      console.log(`Relay WS state: ${ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState] : 'null'}`);
      console.log(`Agents: ${JSON.stringify(agents.map(a => ({ id: a.agentId?.slice(0,8), online: a.online })))}`);
      console.log('--- Per-terminal state ---');
      for (const [id, termInfo] of terminals) {
        const pane = state.panes.find(p => p.id === id);
        const bufChunks = termDeferredBuffers.get(id);
        const pendingBytes = bufChunks ? bufChunks.reduce((s, c) => s + c.length, 0) : 0;
        const xterm = termInfo.xterm;
        const altScreen = xterm.buffer.active === xterm.buffer.alternate;
        const hasSel = xterm.hasSelection();
        const viewportY = xterm.buffer.active.viewportY;
        const baseY = xterm.buffer.active.baseY;
        const cursorY = xterm.buffer.active.cursorY;
        const cursorX = xterm.buffer.active.cursorX;
        const rows = xterm.rows;
        const cols = xterm.cols;
        const paneZoom = pane ? (pane.zoomLevel || 100) : 100;
        // Sample first visible line content (to see if screen is blank)
        let firstLine = '';
        try {
          const line = xterm.buffer.active.getLine(viewportY);
          if (line) firstLine = line.translateToString(true).slice(0, 60);
        } catch {}
        let lastLine = '';
        try {
          const line = xterm.buffer.active.getLine(viewportY + rows - 1);
          if (line) lastLine = line.translateToString(true).slice(0, 60);
        } catch {}
        console.log(
          `  ${id.slice(0,8)}: altScreen=${altScreen} hasSel=${hasSel} ` +
          `pending=${pendingBytes}B size=${cols}x${rows} zoom=${paneZoom}% ` +
          `cursor=${cursorX},${cursorY} viewport=${viewportY} base=${baseY} ` +
          `initialAttach=${!!termInfo._initialAttachDone} ` +
          `connected=${pane ? 'yes' : 'orphan'}`
        );
        console.log(`    firstLine: "${firstLine}"`);
        console.log(`    lastLine:  "${lastLine}"`);
      }
      console.log('=== END DIAGNOSTICS ===');
    }
  });
  let ws = null;
  let wsReconnectTimer = null;
  let wsReconnectDelay = 2000;
  const WS_RECONNECT_MAX = 30000;
  let pendingAttachments = new Set();

  // Agent/relay state
  let agents = [];          // populated from agents:list message
  let activeAgentId = null; // currently selected agent
  const agentUpdates = new Map(); // agentId -> { currentVersion, latestVersion }

  // === Cloud-Direct Persistence (Phase 4) ===
  // These are direct fetch() calls to the cloud server, NOT relayed through agent.

  function cloudFetch(method, path, body) {
    const opts = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    return fetch(path, opts).then(r => r.ok ? r.json() : Promise.reject(new Error(`Cloud ${method} ${path}: ${r.status}`)));
  }

  // Cloud layout persistence (debounced per-pane, 500ms)
  const cloudLayoutTimers = new Map();
  function cloudSaveLayout(pane) {
    if (cloudLayoutTimers.has(pane.id)) clearTimeout(cloudLayoutTimers.get(pane.id));
    cloudLayoutTimers.set(pane.id, setTimeout(() => {
      cloudLayoutTimers.delete(pane.id);
      const metadata = {};
      if (pane.zoomLevel && pane.zoomLevel !== 100) metadata.zoomLevel = pane.zoomLevel;
      if (pane.textOnly) metadata.textOnly = true;
      if (pane.type === 'folder' && pane.folderPath) metadata.folderPath = pane.folderPath;
      if (pane.device) metadata.device = pane.device;
      if (pane.filePath) metadata.filePath = pane.filePath;
      if (pane.fileName) metadata.fileName = pane.fileName;
      if (pane.url) metadata.url = pane.url;
      if (pane.repoPath) metadata.repoPath = pane.repoPath;
      if (pane.repoName) metadata.repoName = pane.repoName;
      if (pane.projectPath) metadata.projectPath = pane.projectPath;
      if (pane.workingDir) metadata.workingDir = pane.workingDir;
      if (pane.shortcutNumber) metadata.shortcutNumber = pane.shortcutNumber;
      if (pane.paneName) metadata.paneName = pane.paneName;
      cloudFetch('PUT', `/api/layouts/${pane.id}`, {
        paneType: pane.type,
        positionX: pane.x,
        positionY: pane.y,
        width: pane.width,
        height: pane.height,
        zIndex: pane.zIndex || 0,
        agentId: pane.agentId || activeAgentId,
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
      }).catch(e => console.error('[Cloud] Layout save failed:', e.message));
    }, 500));
  }

  function cloudDeleteLayout(paneId) {
    if (cloudLayoutTimers.has(paneId)) {
      clearTimeout(cloudLayoutTimers.get(paneId));
      cloudLayoutTimers.delete(paneId);
    }
    cloudFetch('DELETE', `/api/layouts/${paneId}`)
      .catch(e => console.error('[Cloud] Layout delete failed:', e.message));
  }

  // Cloud view state (debounced 1s)
  let cloudViewStateTimer = null;
  function cloudSaveViewState() {
    if (cloudViewStateTimer) clearTimeout(cloudViewStateTimer);
    cloudViewStateTimer = setTimeout(() => {
      cloudFetch('PUT', '/api/view-state', {
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY
      }).catch(e => console.error('[Cloud] View state save failed:', e.message));
    }, 1000);
  }

  // Cloud note sync (debounced per-note, 500ms)
  const cloudNoteTimers = new Map();
  function cloudSaveNote(noteId, content, fontSize, images) {
    if (cloudNoteTimers.has(noteId)) clearTimeout(cloudNoteTimers.get(noteId));
    cloudNoteTimers.set(noteId, setTimeout(() => {
      cloudNoteTimers.delete(noteId);
      const payload = { content, fontSize };
      if (images !== undefined) payload.images = images;
      cloudFetch('PUT', `/api/cloud-notes/${noteId}`, payload)
        .catch(e => console.error('[Cloud] Note sync failed:', e.message));
    }, 500));
  }

  let canvas, canvasContainer;
  let isPanning = false;
  let panStartX, panStartY;
  let lastPanX, lastPanY;

  // Touch/drag state
  let activePane = null;
  let holdTimer = null;
  let isDragging = false;
  let isResizing = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Broadcast mode state (unified multi-select + broadcast)
  const selectedPaneIds = new Set();

  function clearMultiSelect() {
    selectedPaneIds.forEach(id => {
      const el = document.getElementById(`pane-${id}`);
      if (el) el.classList.remove('broadcast-selected');
    });
    selectedPaneIds.clear();
    updateBroadcastIndicator();
  }

  function togglePaneSelection(paneId) {
    const el = document.getElementById(`pane-${paneId}`);
    if (!el) return;
    if (selectedPaneIds.has(paneId)) {
      selectedPaneIds.delete(paneId);
      el.classList.remove('broadcast-selected');
    } else {
      selectedPaneIds.add(paneId);
      el.classList.add('broadcast-selected');
    }
  }

  // Check if a DOM element is inside a broadcast-selected pane
  function isInsideBroadcastPane(el) {
    const paneEl = el.closest('.pane');
    if (!paneEl) return false;
    return selectedPaneIds.has(paneEl.dataset.paneId);
  }

  // Show/hide the broadcast indicator (unified yellow for all modes)
  function updateBroadcastIndicator() {
    let indicator = document.getElementById('broadcast-indicator');
    const count = selectedPaneIds.size;

    if (count >= 2) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'broadcast-indicator';
        document.body.appendChild(indicator);
      }
      indicator.className = 'broadcast-indicator';
      indicator.innerHTML = `<span class="broadcast-icon">◉</span> BROADCAST — ${count} panes`;
      indicator.style.display = 'flex';
    } else {
      if (indicator) indicator.style.display = 'none';
    }
  }

  // Pinch zoom state
  let initialPinchDistance = 0;
  let initialZoom = 1;

  // HUD overlay state
  let hudData = { devices: [] };
  let hudPollingTimer = null;
  let hudRenderTimer = null;
  let hudIsHovered = false;
  let hudExpanded = false;
  let deviceColorOverrides = {}; // { deviceName: colorIndex } — persisted in hudState.device_colors
  let deviceSwatchOpenFor = null; // device name whose color swatches are currently shown
  let hoveredDeviceName = null;
  const HUD_POLL_SLOW = 30000;
  const HUD_POLL_FAST = 1000;

  // Agents HUD state
  let hudHidden = false;
  let fleetPaneHidden = false;

  // Terminal themes loaded from themes.js (external file)
  let currentTerminalTheme = 'default';
  const TERMINAL_THEMES = window.TERMINAL_THEMES || {};
