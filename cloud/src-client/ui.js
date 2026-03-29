  function sendWs(type, payload, agentId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload, agentId: agentId || activeAgentId }));
    }
  }

  // Simple notification for relay messages (tier limits, etc.)
  function showRelayNotification(message, type, duration) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:100001; background:${type === 'warning' ? '#b58900' : '#333'}; color:#fff; padding:10px 20px; border-radius:8px; font-size:13px; font-family:inherit; box-shadow:0 4px 20px rgba(0,0,0,0.4); pointer-events:auto;`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, duration || 5000);
  }

  async function fetchAgentToken(hostname) {
    const res = await fetch('/api/agents/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname, os: 'linux' })
    });
    const data = await res.json();
    if (!data.token) throw new Error(data.error || 'Unknown');
    return data;
  }

  function getCloudUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host;
  }

  // --- Agent Update Notification Helpers ---

  function isAgentVersionOutdated(current, latest) {
    if (!current || !latest) return false;
    const c = current.split('.').map(Number);
    const l = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(c.length, l.length); i++) {
      const cv = c[i] || 0;
      const lv = l[i] || 0;
      if (cv < lv) return true;
      if (cv > lv) return false;
    }
    return false;
  }

  function showUpdateToast(agentId, hostname, currentVersion, latestVersion) {
    // Remove any existing update toast for this agent
    const existingToast = document.querySelector(`.update-toast[data-agent-id="${agentId}"]`);
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'notification-toast update-toast visible';
    toast.dataset.agentId = agentId;
    toast.style.borderLeft = '3px solid #f59e0b';
    toast.innerHTML = `
      <div class="notification-icon" style="color:#f59e0b;">⬆</div>
      <div class="notification-body">
        <div class="notification-title">Update available for ${escapeHtml(hostname)}</div>
        <div class="notification-device">v${escapeHtml(currentVersion)} → v${escapeHtml(latestVersion)}</div>
      </div>
      <button class="update-now-btn" style="background:#f59e0b;color:#000;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:bold;white-space:nowrap;margin-left:8px;">Update</button>
      <button class="notification-dismiss" title="Dismiss">&times;</button>
    `;

    const updateBtn = toast.querySelector('.update-now-btn');
    updateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerAgentUpdate(agentId);
      updateBtn.textContent = 'Updating...';
      updateBtn.disabled = true;
      updateBtn.style.opacity = '0.6';
    });

    const dismissBtn = toast.querySelector('.notification-dismiss');
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast.classList.add('dismissing');
      setTimeout(() => toast.remove(), 300);
    });

    if (notificationContainer) {
      notificationContainer.prepend(toast);
    }
  }

  function showUpdateProgressToast(agentId, hostname, status, payload) {
    const existingToast = document.querySelector(`.update-toast[data-agent-id="${agentId}"]`);
    const pct = (payload && payload.percent) || 0;
    const statusText = {
      checking: 'Checking for updates...',
      downloading: pct > 0 ? `Downloading... ${pct}%` : 'Downloading update...',
      installing: 'Installing update...',
      restarting: 'Restarting agent...',
      complete: 'Update complete!',
      failed: 'Update failed!',
    }[status] || status;

    if (existingToast) {
      const titleEl = existingToast.querySelector('.notification-title');
      const deviceEl = existingToast.querySelector('.notification-device');
      if (titleEl) titleEl.textContent = `${hostname}: ${statusText}`;
      // Show progress bar for downloading
      let progressWrap = existingToast.querySelector('.update-progress-wrap');
      if (status === 'downloading') {
        if (!progressWrap) {
          progressWrap = document.createElement('div');
          progressWrap.className = 'update-progress-wrap';
          progressWrap.innerHTML = '<div class="update-progress-bar"><div class="update-progress-fill"></div></div><span class="update-progress-detail"></span>';
          const body = existingToast.querySelector('.notification-body');
          if (body) body.appendChild(progressWrap);
        }
        const fill = progressWrap.querySelector('.update-progress-fill');
        const detail = progressWrap.querySelector('.update-progress-detail');
        if (fill) fill.style.width = pct + '%';
        if (detail && payload) {
          const dl = payload.downloaded || 0;
          const tot = payload.total || 0;
          if (tot > 0) {
            const dlMB = (dl / 1048576).toFixed(1);
            const totMB = (tot / 1048576).toFixed(1);
            detail.textContent = `${dlMB} MB / ${totMB} MB`;
          }
        }
      } else if (progressWrap && status !== 'downloading') {
        progressWrap.remove();
      }
      if (deviceEl) deviceEl.textContent = status === 'failed' ? (payload && payload.error) || 'Please try again later' : '';
      const btn = existingToast.querySelector('.update-now-btn');
      if (btn) btn.style.display = 'none';
      if (status === 'failed') {
        existingToast.style.borderLeftColor = '#ef4444';
        const icon = existingToast.querySelector('.notification-icon');
        if (icon) { icon.textContent = '\u2717'; icon.style.color = '#ef4444'; }
        setTimeout(() => {
          existingToast.classList.add('dismissing');
          setTimeout(() => existingToast.remove(), 300);
        }, 5000);
      }
    }
  }

  function showUpdateCompleteToast(agentId, hostname, newVersion) {
    // Remove progress toast
    const existingToast = document.querySelector(`.update-toast[data-agent-id="${agentId}"]`);
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'notification-toast update-toast visible';
    toast.dataset.agentId = agentId;
    toast.style.borderLeft = '3px solid #10b981';
    toast.innerHTML = `
      <div class="notification-icon" style="color:#10b981;">✓</div>
      <div class="notification-body">
        <div class="notification-title">${escapeHtml(hostname)} updated</div>
        <div class="notification-device">Now running v${escapeHtml(newVersion)}</div>
      </div>
      <button class="notification-dismiss" title="Dismiss">&times;</button>
    `;

    const dismissBtn = toast.querySelector('.notification-dismiss');
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast.classList.add('dismissing');
      setTimeout(() => toast.remove(), 300);
    });

    if (notificationContainer) {
      notificationContainer.prepend(toast);
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('dismissing');
        setTimeout(() => toast.remove(), 300);
      }
    }, 8000);
  }

  function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast error-toast visible';
    toast.innerHTML = `
      <div class="notification-icon" style="color:#ef4444;">&#x2717;</div>
      <div class="notification-body">
        <div class="notification-title">Error</div>
        <div class="notification-device">${escapeHtml(message)}</div>
      </div>
      <button class="notification-dismiss" title="Dismiss">&times;</button>
    `;
    const dismissBtn = toast.querySelector('.notification-dismiss');
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast.classList.add('dismissing');
      setTimeout(() => toast.remove(), 300);
    });
    notificationContainer.prepend(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('dismissing');
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

  function triggerAgentUpdate(agentId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'update:install',
        agentId,
        payload: {},
      }));
    }
  }

  // "Connect a Machine" overlay
  function updateAgentOverlay() {
    let overlay = document.getElementById('agent-connect-overlay');
    const hasOnlineAgents = agents.some(a => a.online);

    // Suppress overlay when tutorial hasn't been completed (user will be redirected)
    const tutorialState = localStorage.getItem('tc_tutorial');
    if (!hasOnlineAgents && !tutorialState && !tutorialsCompleted['getting-started']) {
      if (overlay) overlay.style.display = 'none';
      return;
    }

    if (!hasOnlineAgents) {
      // Instead of auto-popup overlay, highlight the HUD add-machine button
      if (overlay) overlay.style.display = 'none';
      pulseAddMachineButton(true);
    } else {
      if (overlay) {
        overlay.style.display = 'none';
      }
      pulseAddMachineButton(false);
    }
  }

  // Inject pulse animation style once
  let pulseStyleInjected = false;
  function injectPulseStyle() {
    if (pulseStyleInjected) return;
    pulseStyleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes addMachinePulse {
        0% { box-shadow: 0 0 4px rgba(78, 201, 176, 0.4), 0 0 8px rgba(78, 201, 176, 0.2); }
        50% { box-shadow: 0 0 12px rgba(78, 201, 176, 0.7), 0 0 24px rgba(78, 201, 176, 0.3); }
        100% { box-shadow: 0 0 4px rgba(78, 201, 176, 0.4), 0 0 8px rgba(78, 201, 176, 0.2); }
      }
      .add-machine-fleet-btn.pulsing {
        animation: addMachinePulse 2s ease-in-out infinite !important;
        background: #4ec9b0 !important;
        border: 1px solid rgba(78, 201, 176, 0.6) !important;
        font-weight: 700 !important;
        transform: scale(1.02);
        transition: transform 0.2s ease;
      }
      .add-machine-fleet-btn.pulsing:hover {
        transform: scale(1.06);
        animation: none !important;
        box-shadow: 0 0 16px rgba(78, 201, 176, 0.8), 0 0 32px rgba(78, 201, 176, 0.4) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function pulseAddMachineButton(enable) {
    if (enable) injectPulseStyle();
    // The HUD fleet button gets re-rendered, so we set a flag and apply in renderHud
    window.__pulseAddMachine = enable;
    // Also apply immediately if the button exists
    const btn = document.querySelector('.add-machine-fleet-btn');
    if (btn) {
      if (enable) btn.classList.add('pulsing');
      else btn.classList.remove('pulsing');
    }
  }

  // Show "Add Machine" dialog (can be called from HUD even when agents are connected)
  async function showAddMachineDialog() {
    let overlay = document.getElementById('add-machine-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'add-machine-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#1a1a2e;border:1px solid #4ec9b0;border-radius:12px;padding:32px;max-width:560px;width:90%;color:#e0e0e0;font-family:monospace;';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;color:#4ec9b0;">Add Machine</h3>
        <button id="add-machine-close" style="background:transparent;color:#6a6a8a;border:none;font-size:20px;cursor:pointer;padding:0 4px;">✕</button>
      </div>
      <div id="add-machine-loading" style="text-align:center;padding:20px;color:#6a6a8a;">Generating config...</div>
      <div id="add-machine-fields" style="display:none;"></div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close handler (only close button, not overlay click)
    document.getElementById('add-machine-close').addEventListener('click', () => overlay.remove());

    // Auto-generate token
    const cloudUrl = getCloudUrl();
    const hostname = `machine-${Date.now().toString(36)}`;

    try {
      const data = await fetchAgentToken(hostname);
      const token = data.token;
      const configParam = `${cloudUrl}@${token}`;
      const downloadUrl = 'https://github.com/aicu-icu/tmdx/releases';
      const command = `./tmd-agent config ${configParam} && ./tmd-agent start`;

      document.getElementById('add-machine-loading').style.display = 'none';
      const fieldsContainer = document.getElementById('add-machine-fields');
      fieldsContainer.style.display = 'block';

      // Download URL field (with open link button)
      const downloadField = makeLinkField('Download Agent', downloadUrl);
      downloadField.style.marginBottom = '12px';
      fieldsContainer.appendChild(downloadField);

      // Config Agent field
      const configField = makeCopyField('Config Agent', configParam);
      configField.style.marginBottom = '12px';
      fieldsContainer.appendChild(configField);

      // Start Agent field
      const cmdField = makeCopyField('Start Agent', command);
      fieldsContainer.appendChild(cmdField);

    } catch (e) {
      document.getElementById('add-machine-loading').innerHTML =
        `<div style="color:#f44;font-size:12px;">Error: ${escapeHtml(e.message || 'try again')}</div>`;
    }
  }

  function makeCopyField(label, value) {
    const container = document.createElement('div');
    container.style.position = 'relative';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:block;margin-bottom:4px;opacity:0.6;font-size:12px;';
    lbl.textContent = label;
    container.appendChild(lbl);

    const inputWrapper = document.createElement('div');
    inputWrapper.style.position = 'relative';

    const input = document.createElement('textarea');
    input.readOnly = true;
    input.value = value;
    input.style.cssText = 'width:100%;padding:8px 10px;padding-right:36px;background:#0a0a1a;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-family:monospace;font-size:12px;outline:none;box-sizing:border-box;cursor:text;resize:none;field-sizing:content;';
    inputWrapper.appendChild(input);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '\u{1F4CB}';
    copyBtn.title = 'Copy';
    copyBtn.style.cssText = 'position:absolute;right:6px;top:8px;background:transparent;border:none;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;transition:background 0.15s;';
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = 'rgba(255,255,255,0.1)'; });
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = 'transparent'; });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => {
        copyBtn.textContent = '\u2705';
        setTimeout(() => { copyBtn.textContent = '\u{1F4CB}'; }, 1500);
      });
    });
    inputWrapper.appendChild(copyBtn);

    container.appendChild(inputWrapper);
    return container;
  }

  function makeLinkField(label, url) {
    const container = document.createElement('div');
    container.style.position = 'relative';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:block;margin-bottom:4px;opacity:0.6;font-size:12px;';
    lbl.textContent = label;
    container.appendChild(lbl);

    const inputWrapper = document.createElement('div');
    inputWrapper.style.position = 'relative';

    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.style.cssText = 'width:100%;padding:8px 10px;padding-right:36px;background:#0a0a1a;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-family:monospace;font-size:12px;outline:none;box-sizing:border-box;cursor:text;';
    inputWrapper.appendChild(input);

    const linkBtn = document.createElement('button');
    linkBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    linkBtn.title = 'Open in new tab';
    linkBtn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;border:none;cursor:pointer;color:#4ec9b0;padding:2px 4px;border-radius:4px;transition:background 0.15s;';
    linkBtn.addEventListener('mouseenter', () => { linkBtn.style.background = 'rgba(255,255,255,0.1)'; });
    linkBtn.addEventListener('mouseleave', () => { linkBtn.style.background = 'transparent'; });
    linkBtn.addEventListener('click', () => {
      window.open(url, '_blank');
    });
    inputWrapper.appendChild(linkBtn);

    container.appendChild(inputWrapper);
    return container;
  }

  // Update agents HUD with relay agent list
  function updateAgentsHud() {
    // Re-render the Machines HUD with agent data mapped to device format
    hudData.devices = agents.map(a => ({
      name: a.displayName || a.hostname || a.agentId,
      hostname: a.hostname,
      ip: a.agentId,
      os: a.os || 'linux',
      online: a.online !== false,
      isLocal: agents.length === 1
    }));
    if (hudHidden) updateHudDotColor();
    renderHud();
  }

  // Helper: get devices list from local agents array (replaces fetch('/api/devices'))
  function getDevicesFromAgents() {
    return agents.filter(a => a.online).map(a => ({
      name: a.displayName || a.hostname || a.agentId,
      hostname: a.hostname,
      ip: a.agentId,
      os: a.os || 'linux',
      online: a.online !== false,
      isLocal: agents.length === 1
    }));
  }

  // Helper: resolve the owning agentId for a given pane
  function getPaneAgentId(paneId) {
    const pane = state.panes.find(p => p.id === paneId);
    return (pane && pane.agentId) || activeAgentId;
  }

  // Pending request/response correlation
  const pendingRequests = new Map();
  const pendingScanCallbacks = new Map(); // id -> onPartial callback for streaming scan results

  // REST-over-WS: replaces fetch() for agent-proxied endpoints
  // Falls back to direct fetch() when no relay/agent is available (local server mode)
  // Optional agentId param routes to a specific agent (defaults to activeAgentId)
  // options.onPartial: callback(repos[]) called as scan results stream in
  function agentRequest(method, path, body, agentId, options) {
    const { onPartial } = options || {};
    const resolvedAgentId = agentId || activeAgentId;
    // Local mode: no relay WebSocket or no agent — use direct fetch
    if (!ws || ws.readyState !== WebSocket.OPEN || !resolvedAgentId) {
      const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
      if (body && method !== 'GET') opts.body = JSON.stringify(body);
      return fetch(path, opts).then(r => {
        if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
        return r.json();
      });
    }

    // Relay mode: send through WebSocket
    return new Promise((resolve, reject) => {
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        pendingScanCallbacks.delete(id);
        reject(new Error('Agent request timeout'));
      }, 15000);

      pendingRequests.set(id, { resolve, reject, timeout });
      if (onPartial) pendingScanCallbacks.set(id, onPartial);

      ws.send(JSON.stringify({
        type: 'request',
        id,
        agentId: resolvedAgentId,
        payload: { method, path, body }
      }));
    });
  }

  // Update connection status indicator
  function updateConnectionStatus(paneId, status) {
    const indicator = document.querySelector(`#pane-${paneId} .connection-status`);
    if (indicator) {
      indicator.className = `connection-status ${status}`;
      indicator.setAttribute('data-tooltip', status.charAt(0).toUpperCase() + status.slice(1));
    }
  }

  // Wifi-off SVG icon for disconnect overlay
  const WIFI_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <line x1="12" y1="20" x2="12.01" y2="20"/>
  </svg>`;

  // Find an online agent that matches a pane's device (hostname).
  // Used when the pane's original agent is dead but the same physical machine
  // may have re-registered under a new agent ID.
  function findOnlineAgentForDevice(pane) {
    // First check if the pane's own agent is online
    const ownAgent = agents.find(a => a.agentId === pane.agentId && a.online);
    if (ownAgent) return ownAgent;
    // Match by device name → agent hostname
    if (pane.device) {
      return agents.find(a => a.online && a.hostname === pane.device);
    }
    return null;
  }

  // Show or hide disconnect overlay on a pane element
  // mode: 'offline' (device offline), 'reconnect' (device online), or false to hide
  function setDisconnectOverlay(paneEl, mode) {
    let overlay = paneEl.querySelector('.disconnect-overlay');
    if (mode) {
      if (overlay) overlay.remove();
      overlay = document.createElement('div');
      overlay.className = 'disconnect-overlay';
      const paneId = paneEl.id.replace('pane-', '');

      if (mode === 'reconnect') {
        overlay.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span class="disconnect-label">Terminal closed</span>
          <button class="disconnect-action-btn reconnect-btn" data-pane-id="${paneId}">Reconnect</button>`;
      } else {
        // 'offline' — original behavior
        overlay.innerHTML = `${WIFI_OFF_SVG}<span class="disconnect-label">Disconnected</span>`;
      }

      paneEl.appendChild(overlay);
      overlay.offsetHeight; // Force reflow
      overlay.classList.add('visible');
    } else if (overlay) {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }
  }

  function renderOfflinePlaceholder(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) return; // already rendered

    const pane = document.createElement('div');
    const typeClass = {
      file: 'file-pane', note: 'note-pane', 'git-graph': 'git-graph-pane',
      iframe: 'iframe-pane', folder: 'folder-pane'
    }[paneData.type] || '';
    pane.className = `pane ${typeClass} agent-offline`.trim();
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    const deviceTag = paneData.device ? deviceLabelHtml(paneData.device) : '';

    // Build title based on pane type
    let titleHtml = '';
    switch (paneData.type) {
      case 'terminal':
        titleHtml = `${deviceTag}<span style="opacity:0.7;">Terminal</span>`;
        break;
      case 'file':
        titleHtml = `${deviceTag}📄 ${escapeHtml(paneData.fileName || 'Untitled')}`;
        break;
      case 'folder': {
        const shortPath = (paneData.folderPath || '').replace(/^\/home\/[^/]+/, '~');
        titleHtml = `${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_FOLDER}</svg> ${escapeHtml(shortPath)}`;
        break;
      }
      case 'git-graph':
        titleHtml = `${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_GIT_GRAPH}</svg> ${escapeHtml(paneData.repoName || 'Git Graph')}`;
        break;
      case 'iframe':
        titleHtml = `🌐 ${escapeHtml(paneData.url ? truncateUrl(paneData.url) : 'Web')}`;
        break;
      case 'note':
        titleHtml = `${deviceTag}📝 Note`;
        break;
      default:
        titleHtml = `${deviceTag}${paneData.type}`;
    }

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">${titleHtml}</span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <span class="connection-status disconnected" data-tooltip="Disconnected"></span>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content"></div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    canvas.appendChild(pane);
    // Check if another online agent can handle this pane's device
    const altAgent = findOnlineAgentForDevice(paneData);
    if (altAgent && paneData.type === 'terminal') {
      setDisconnectOverlay(pane, 'reconnect');
    } else {
      setDisconnectOverlay(pane, 'offline');
    }
  }

  // Load all 6 pane types from a single agent, tagging each with agentId
  // Pane type configuration for data-driven loading
  const PANE_TYPES = [
    { type: 'terminal', endpoint: '/api/terminals',
      defPos: { x: 50, y: 50 }, defSize: PANE_DEFAULTS['terminal'],
      extraFields: (t) => ({ tmuxSession: t.tmuxSession, device: t.device || null }),
      render: renderPane },
    { type: 'file', endpoint: '/api/file-panes',
      defPos: { x: 100, y: 100 }, defSize: PANE_DEFAULTS['file'],
      extraFields: (f) => ({ fileName: f.fileName, filePath: f.filePath, content: f.content, device: f.device || null }),
      render: renderFilePane },
    { type: 'note', endpoint: '/api/notes',
      defPos: { x: 100, y: 100 }, defSize: PANE_DEFAULTS['note'],
      extraFields: (n) => ({ content: n.content || '', fontSize: n.fontSize || 11, images: n.images || [] }),
      render: renderNotePane },
    { type: 'git-graph', endpoint: '/api/git-graphs',
      defPos: { x: 100, y: 100 }, defSize: PANE_DEFAULTS['git-graph'],
      extraFields: (g) => ({ repoPath: g.repoPath, repoName: g.repoName, device: g.device }),
      render: renderGitGraphPane },
    { type: 'iframe', endpoint: '/api/iframes',
      defPos: { x: 100, y: 100 }, defSize: PANE_DEFAULTS['iframe'],
      extraFields: (f) => ({ url: f.url }),
      render: renderIframePane },
    { type: 'folder', endpoint: '/api/folder-panes',
      defPos: { x: 100, y: 100 }, defSize: PANE_DEFAULTS['folder'],
      extraFields: (f) => ({ folderPath: f.folderPath, device: f.device || null }),
      render: renderFolderPane },
  ];

  async function loadPanesFromAgent(agentId, cloudLayoutMap) {
    const agent = agents.find(a => a.agentId === agentId);
    const agentHostname = agent && agent.hostname ? agent.hostname : null;

    const results = await Promise.all(
      PANE_TYPES.map(cfg => agentRequest('GET', cfg.endpoint, null, agentId).catch(() => []))
    );

    PANE_TYPES.forEach((cfg, i) => {
      for (const item of results[i]) {
        if (state.panes.some(p => p.id === item.id)) continue;
        // Prefer cloud-saved layout, then agent-provided, then defaults
        const cl = cloudLayoutMap && cloudLayoutMap.get(item.id);
        const position = cl ? { x: cl.position_x, y: cl.position_y } : (item.position || cfg.defPos);
        const size = cl ? { width: cl.width, height: cl.height } : (item.size || cfg.defSize);
        const pane = {
          id: item.id,
          type: cfg.type,
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          zIndex: (cl && cl.z_index) ? cl.z_index : state.nextZIndex++,
          ...cfg.extraFields(item),
          agentId: agentId
        };
        // Restore metadata from cloud layout
        if (cl && cl.metadata) {
          const meta = typeof cl.metadata === 'string' ? JSON.parse(cl.metadata) : cl.metadata;
          if (meta.device && !pane.device) pane.device = meta.device;
          if (meta.zoomLevel) pane.zoomLevel = meta.zoomLevel;
          if (meta.textOnly) pane.textOnly = meta.textOnly;
          if (meta.folderPath) pane.folderPath = meta.folderPath;
          if (meta.workingDir) pane.workingDir = meta.workingDir;
          if (meta.shortcutNumber) pane.shortcutNumber = meta.shortcutNumber;
          if (meta.paneName) pane.paneName = meta.paneName;
        }
        // Fill in device from agent hostname if the agent didn't return one
        if (!pane.device && agentHostname) pane.device = agentHostname;
        state.panes.push(pane);
        cfg.render(pane);
      }
    });
  }


  async function loadTerminalsFromServer() {
    try {
      // Fetch cloud layouts FIRST so panes render with correct positions immediately
      let cloudLayoutMap = new Map();
      let cloudLayouts = [];
      try {
        const cloudData = await cloudFetch('GET', '/api/layouts');
        if (cloudData.layouts && cloudData.layouts.length > 0) {
          cloudLayouts = cloudData.layouts;
          cloudLayoutMap = new Map(cloudLayouts.map(l => [l.id, l]));
        }
      } catch (e) {
        console.warn('[Cloud] Failed to pre-fetch cloud layouts:', e.message);
      }

      // Load panes from all online agents, passing cloud layout data for correct positioning
      const onlineAgents = agents.filter(a => a.online);
      if (onlineAgents.length > 0) {
        await Promise.all(onlineAgents.map(a => loadPanesFromAgent(a.agentId, cloudLayoutMap)));
      }

      // Apply cloud layout data to any panes that were already in state before this load
      // (e.g. panes added by earlier agent loads or other code paths)
      for (const pane of state.panes) {
        const cl = cloudLayoutMap.get(pane.id);
        if (cl) {
          if (cl.agent_id && !pane.agentId) pane.agentId = cl.agent_id;
        }
      }

      // Create offline placeholder panes for cloud layouts whose agents are not online.
      // This ensures panes from disconnected devices remain visible on the canvas.
      if (cloudLayouts.length > 0) {
        const existingIds = new Set(state.panes.map(p => p.id));
        for (const cl of cloudLayouts) {
            if (existingIds.has(cl.id)) continue; // already loaded from online agent
            if (cl.pane_type === 'todo') continue; // handled separately by loadTodoPane
            const meta = cl.metadata ? (typeof cl.metadata === 'string' ? JSON.parse(cl.metadata) : cl.metadata) : {};
            // Resolve device name: metadata > agent hostname from DB > agents array
            const agentEntry = agents.find(a => a.agentId === cl.agent_id);
            const deviceName = meta.device || cl.agent_hostname || (agentEntry && agentEntry.hostname) || null;
            const pane = {
              id: cl.id,
              type: cl.pane_type,
              x: cl.position_x,
              y: cl.position_y,
              width: cl.width,
              height: cl.height,
              zIndex: cl.z_index || state.nextZIndex++,
              agentId: cl.agent_id || null,
              device: deviceName,
              _offlinePlaceholder: true,
            };
            // Restore type-specific fields from metadata
            if (meta.filePath) pane.filePath = meta.filePath;
            if (meta.fileName) pane.fileName = meta.fileName;
            if (meta.folderPath) pane.folderPath = meta.folderPath;
            if (meta.url) pane.url = meta.url;
            if (meta.repoPath) pane.repoPath = meta.repoPath;
            if (meta.repoName) pane.repoName = meta.repoName;
            if (meta.projectPath) pane.projectPath = meta.projectPath;
            if (meta.workingDir) pane.workingDir = meta.workingDir;
            if (meta.shortcutNumber) pane.shortcutNumber = meta.shortcutNumber;
            if (meta.paneName) pane.paneName = meta.paneName;
            state.panes.push(pane);
            renderOfflinePlaceholder(pane);
          }
      }

      // Sync any panes the cloud doesn't know about yet
      for (const pane of state.panes) {
        cloudSaveLayout(pane);
      }

      // Cloud Phase 3.5: Load Todo pane (device-independent, from cloud API)
      await loadTodoPane(cloudLayoutMap);

      // Cloud Phase 4: Load cloud view state
      try {
        const vs = await cloudFetch('GET', '/api/view-state');
        if (vs && vs.zoom !== undefined) {
          state.zoom = vs.zoom;
          state.panX = vs.pan_x || 0;
          state.panY = vs.pan_y || 0;
          updateCanvasTransform();
        }
      } catch (e) {
        console.warn('[Cloud] Failed to load cloud view state:', e.message);
      }

    } catch (e) {
      console.error('[App] Failed to load panes:', e);
    }
  }

  function createCustomSelect(options, defaultValue, onChange) {
    // options: [{ value: '...', label: '...' }, ...]
    let currentValue = defaultValue || options[0].value;

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    const updateLabel = () => {
      const opt = options.find(o => o.value === currentValue) || options[0];
      trigger.textContent = '';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = opt.label;
      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'cs-arrow';
      arrowSpan.textContent = '\u25BE';
      trigger.appendChild(labelSpan);
      trigger.appendChild(arrowSpan);
    };
    updateLabel();

    // Prevent drag/pan on canvas
    trigger.addEventListener('mousedown', (e) => e.stopPropagation());

    let panel = null;
    let outsideHandler = null;
    let escHandler = null;
    const closePanel = () => {
      if (panel) { panel.remove(); panel = null; trigger.classList.remove('open'); }
      if (outsideHandler) { document.removeEventListener('click', outsideHandler); outsideHandler = null; }
      if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel) { closePanel(); return; }

      panel = document.createElement('div');
      panel.className = 'pane-menu custom-select-panel';

      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'menu-item' + (opt.value === currentValue ? ' cs-active' : '');
        btn.textContent = opt.label;
        btn.style.cssText = 'font-size:11px; padding:6px 12px;';
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          currentValue = opt.value;
          updateLabel();
          closePanel();
          if (onChange) onChange(currentValue);
        });
        panel.appendChild(btn);
      }

      // Position below trigger
      const rect = trigger.getBoundingClientRect();
      panel.style.top = (rect.bottom + 4) + 'px';
      panel.style.left = rect.left + 'px';
      panel.style.minWidth = Math.max(rect.width, 80) + 'px';

      document.body.appendChild(panel);
      trigger.classList.add('open');

      // Close on click outside
      outsideHandler = (ev) => {
        if (!panel?.contains(ev.target) && ev.target !== trigger) {
          closePanel();
        }
      };
      setTimeout(() => document.addEventListener('click', outsideHandler), 0);

      // Close on Escape
      escHandler = (ev) => {
        if (ev.key === 'Escape') {
          closePanel();
        }
      };
      document.addEventListener('keydown', escHandler);
    });

    return {
      el: trigger,
      get value() { return currentValue; },
      set value(v) {
        const opt = options.find(o => o.value === v);
        if (opt) { currentValue = v; updateLabel(); }
      }
    };
  }

  // Show device picker and create terminal on selected device
  // Shared device picker — all 7 picker functions delegate to this
  const osIcons = { linux: '\u{1F427}', windows: '\u{1FA9F}', macos: '\u{1F34E}' };

  // --- Shared keyboard navigation for picker/browser modals ---
  // Attaches W/S + Up/Down arrow navigation, Enter to select, Escape to close.
  // Items must have [data-nav-item] attribute. Call refresh() after content changes.
  function attachPickerKeyboardNav(container, { onEscape, onExtraKey } = {}) {
    let highlightIdx = -1;
    let alive = true;

    function getItems() {
      return Array.from(container.querySelectorAll('[data-nav-item]'));
    }

    function setHighlight(idx) {
      const items = getItems();
      container.querySelectorAll('[data-nav-highlighted]').forEach(el => el.removeAttribute('data-nav-highlighted'));
      if (idx >= 0 && idx < items.length) {
        highlightIdx = idx;
        items[idx].setAttribute('data-nav-highlighted', '');
        items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        highlightIdx = -1;
      }
    }

    function handler(e) {
      if (!alive || !document.body.contains(container)) { cleanup(); return; }
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

      const key = e.key;
      const items = getItems();

      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        if (onEscape) onEscape();
        return;
      }

      // Skip W/S when modifier keys are held (Ctrl+S, Tab+W chords, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (items.length === 0) return;
      if (highlightIdx >= items.length || highlightIdx < 0) highlightIdx = 0;

      if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        e.preventDefault();
        e.stopPropagation();
        setHighlight(highlightIdx <= 0 ? items.length - 1 : highlightIdx - 1);
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        setHighlight(highlightIdx >= items.length - 1 ? 0 : highlightIdx + 1);
      } else if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (highlightIdx >= 0 && highlightIdx < items.length) {
          items[highlightIdx].click();
        }
      } else if (onExtraKey) {
        onExtraKey(e, items, cleanup);
      }
    }

    document.addEventListener('keydown', handler, true);

    function cleanup() {
      alive = false;
      document.removeEventListener('keydown', handler, true);
    }

    function refresh() {
      if (!alive) return;
      const items = getItems();
      highlightIdx = items.length > 0 ? 0 : -1;
      if (highlightIdx >= 0) setHighlight(highlightIdx);
    }

    requestAnimationFrame(() => { if (alive) refresh(); });

    return { cleanup, refresh };
  }

  async function showDevicePickerGeneric(onDeviceSelected, onFallback) {
    try {
      const devices = getDevicesFromAgents();

      if (devices.length === 1) {
        onDeviceSelected(devices[0]);
        return;
      }

      const existing = document.getElementById('device-picker');
      if (existing) existing.remove();

      const picker = document.createElement('div');
      picker.id = 'device-picker';
      picker.className = 'pane-menu';
      picker.style.cssText = 'min-width:180px;';

      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        const btn = document.createElement('button');
        btn.className = 'menu-item';
        btn.setAttribute('data-nav-item', '');
        const icon = osIcons[device.os] || '\u{1F4BB}';
        const localBadge = device.isLocal ? ' <span style="opacity:0.5; font-size:11px;">(local)</span>' : '';
        const onlineColor = device.online ? '#4ec9b0' : '#6a6a8a';
        const numLabel = i < 9 ? `<span style="opacity:0.5; font-size:11px; margin-right:4px;">${i + 1}</span>` : '';
        btn.innerHTML = `${numLabel}<span style="font-size:16px;">${icon}</span><span style="flex:1;">${device.name}${localBadge}</span><span style="width:8px; height:8px; border-radius:50%; background:${onlineColor}; display:inline-block;"></span>`;
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.1)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
        btn.addEventListener('click', () => {
          nav.cleanup();
          document.removeEventListener('click', closeHandler);
          picker.remove();
          onDeviceSelected(device);
        });
        picker.appendChild(btn);
      }

      const closeHandler = (e) => {
        if (!picker.contains(e.target)) {
          nav.cleanup();
          document.removeEventListener('click', closeHandler);
          picker.remove();
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
      document.body.appendChild(picker);

      // Keyboard nav: W/S, Up/Down, Enter, Escape + number keys 1-9
      const nav = attachPickerKeyboardNav(picker, {
        onEscape: () => {
          document.removeEventListener('click', closeHandler);
          picker.remove();
        },
        onExtraKey: (e, items, cleanup) => {
          const num = parseInt(e.key);
          if (num >= 1 && num <= 9 && num <= devices.length) {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
            document.removeEventListener('click', closeHandler);
            picker.remove();
            onDeviceSelected(devices[num - 1]);
          }
        }
      });
    } catch (e) {
      console.error('[App] Device picker error:', e);
      if (onFallback) onFallback(e);
    }
  }

  async function showDevicePicker(placementPos) {
    showDevicePickerGeneric(
      (d) => createPane(d.name, placementPos, d.ip),
      () => createPane(undefined, placementPos)
    );
  }

  // Serialize terminal creation to avoid concurrent pty attaches on the agent.
  // Back-to-back createPane calls queue up so each terminal fully completes
  // (POST + render + attach) before the next one starts.
  let createPaneQueue = Promise.resolve();

  // Create a new terminal pane
  function createPane(device, placementPos, targetAgentId) {
    const task = createPaneQueue.then(() => _createPaneImpl(device, placementPos, targetAgentId));
    createPaneQueue = task.catch(() => {});
    return task;
  }

  async function _createPaneImpl(device, placementPos, targetAgentId) {
    const resolvedAgentId = targetAgentId || activeAgentId;

    const position = calcPlacementPos(placementPos, 300, 200);

    try {
      const reqBody = { workingDir: '~', position, size: PANE_DEFAULTS['terminal'] };
      if (device) reqBody.device = device;
      const terminal = await agentRequest('POST', '/api/terminals', reqBody, resolvedAgentId);

      const pane = {
        id: terminal.id,
        type: 'terminal',
        x: terminal.position.x,
        y: terminal.position.y,
        width: terminal.size.width,
        height: terminal.size.height,
        zIndex: state.nextZIndex++,
        tmuxSession: terminal.tmuxSession,
        device: terminal.device || device || null,
        agentId: resolvedAgentId
      };

      state.panes.push(pane);
      renderPane(pane);
      cloudSaveLayout(pane);
      // attachTerminal is called from initTerminal after a 100ms setTimeout.
      // Wait for that to fire before releasing the queue so the next terminal's
      // pty attach doesn't contend with this one on the agent side.
      await new Promise(r => setTimeout(r, 200));

    } catch (e) {
      console.error('[App] Failed to create terminal:', e);
      alert('Failed to create terminal: ' + e.message);
    }
  }

  // Reconnect a dead terminal in an existing pane
  async function resumeTerminalPane(paneId) {
    const pane = state.panes.find(p => p.id === paneId);
    if (!pane) return;

    const el = document.getElementById(`pane-${paneId}`);
    if (!el) return;

    // Find an online agent that can handle this pane (may differ from original agent)
    const targetAgent = findOnlineAgentForDevice(pane);
    if (!targetAgent) {
      console.error('[App] No online agent available for reconnect');
      return;
    }

    // Hide overlay, show connecting state
    setDisconnectOverlay(el, false);
    updateConnectionStatus(paneId, 'connecting');

    try {
      const terminal = await agentRequest('POST', '/api/terminals/resume', {
        terminalId: paneId,
        workingDir: pane.workingDir || '~',
        command: null
      }, targetAgent.agentId);

      // Update pane to point to the new agent and tmux session
      pane.agentId = targetAgent.agentId;
      pane.tmuxSession = terminal.tmuxSession;
      // Clear placeholder flag so agent:online won't remove it
      delete pane._offlinePlaceholder;

      // If this was an offline placeholder, it has no xterm instance —
      // re-render as a full terminal pane (which initializes xterm + attaches)
      if (!terminals.has(paneId)) {
        el.remove();
        el.classList.remove('agent-offline');
        renderPane(pane);
      } else {
        // Already has xterm — just reattach
        el.classList.remove('agent-offline');
        attachTerminal(pane);
      }

      // Persist the agent reassignment to cloud
      cloudSaveLayout(pane);

    } catch (e) {
      console.error('[App] Failed to reconnect terminal:', e);
      setDisconnectOverlay(el, 'reconnect');
      updateConnectionStatus(paneId, 'error');
    }
  }

  // Show device picker for opening a file, then show file browser
  async function openFileWithDevicePicker(placementPos) {
    showDevicePickerGeneric(
      (d) => showFileBrowser(d.name, '~', placementPos, false, d.ip),
      (e) => alert('Failed to list devices: ' + e.message)
    );
  }

  // Show the file browser overlay for a given device
  // === Shared browser overlay infrastructure ===

  function createBrowserOverlay(id, headerContentHTML) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; z-index:10001; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.7);';

    const browser = document.createElement('div');
    browser.style.cssText = 'width:500px; max-width:90vw; max-height:70vh; background:rgba(15,20,35,0.98); border:1px solid rgba(var(--accent-rgb),0.3); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6);';

    const header = document.createElement('div');
    header.style.cssText = 'padding:12px 16px; background:rgba(0,0,0,0.3); border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; gap:10px; flex-shrink:0;';
    header.innerHTML = headerContentHTML + '<button class="browser-overlay-close" style="margin-left:auto; background:none; border:none; color:rgba(255,255,255,0.4); font-size:20px; cursor:pointer; padding:2px 6px; border-radius:4px;">&times;</button>';

    const breadcrumbBar = document.createElement('div');
    breadcrumbBar.style.cssText = 'padding:8px 16px; background:rgba(0,0,0,0.15); border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; gap:4px; flex-shrink:0; overflow-x:auto; font-size:12px;';

    const contentArea = document.createElement('div');
    contentArea.className = 'tc-scrollbar';
    contentArea.style.cssText = 'flex:1; overflow-y:auto; padding:4px 0; min-height:200px;';

    browser.appendChild(header);
    browser.appendChild(breadcrumbBar);
    browser.appendChild(contentArea);
    overlay.appendChild(browser);
    document.body.appendChild(overlay);

    const cleanupFns = [];
    const closeBrowser = () => { overlay.remove(); cleanupFns.forEach(fn => fn()); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBrowser(); });
    header.querySelector('.browser-overlay-close').addEventListener('click', closeBrowser);
    // Fallback Escape handler — keyboard nav also handles Escape, but this ensures
    // Escape works even if attachPickerKeyboardNav is not attached by the caller.
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && document.body.contains(overlay)) { closeBrowser(); document.removeEventListener('keydown', escHandler); }
    });

    return { overlay, header, breadcrumbBar, contentArea, closeBrowser, addCleanup: (fn) => cleanupFns.push(fn) };
  }

  function renderBreadcrumb(breadcrumbBar, resolvedPath, onNavigate) {
    breadcrumbBar.innerHTML = '';
    const parts = resolvedPath.split('/').filter(p => p);

    const rootBtn = document.createElement('button');
    rootBtn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.6); cursor:pointer; font-size:12px; padding:2px 4px; border-radius:3px;';
    rootBtn.textContent = '/';
    rootBtn.addEventListener('click', () => onNavigate('/'));
    rootBtn.addEventListener('mouseenter', () => { rootBtn.style.color = '#fff'; });
    rootBtn.addEventListener('mouseleave', () => { rootBtn.style.color = 'rgba(255,255,255,0.6)'; });
    breadcrumbBar.appendChild(rootBtn);

    parts.forEach((part, i) => {
      const sep = document.createElement('span');
      sep.style.cssText = 'color:rgba(255,255,255,0.2); margin:0 2px;';
      sep.textContent = '/';
      breadcrumbBar.appendChild(sep);

      const btn = document.createElement('button');
      btn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.6); cursor:pointer; font-size:12px; padding:2px 4px; border-radius:3px;';
      btn.textContent = part;
      const targetPath = '/' + parts.slice(0, i + 1).join('/');
      btn.addEventListener('click', () => onNavigate(targetPath));
      btn.addEventListener('mouseenter', () => { btn.style.color = '#fff'; });
      btn.addEventListener('mouseleave', () => { btn.style.color = 'rgba(255,255,255,0.6)'; });
      breadcrumbBar.appendChild(btn);
    });
  }

  function createFolderItem(name, onClick) {
    const item = document.createElement('div');
    item.setAttribute('data-nav-item', '');
    item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:7px 16px; cursor:pointer; transition:background 0.1s; font-size:13px;';
    const icon = name === '..' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' : '\u{1F4C1}';
    item.innerHTML = `<span style="width:20px; text-align:center;">${icon}</span><span style="color:rgba(255,255,255,0.85); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(name)}</span>`;
    item.addEventListener('click', onClick);
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(var(--accent-rgb),0.15)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
    return item;
  }

  // Shared folder-browse-then-scan picker used by git repo pickers.
  // config: { id, headerHTML, scanLabel, onScan(folderPath, contentArea, closeBrowser, navigateFolder, navRefresh), device, targetAgentId }
  function showFolderScanPicker(config) {
    const { id, headerHTML, scanLabel, onScan, device, targetAgentId } = config;
    const { overlay, header, breadcrumbBar, contentArea, closeBrowser, addCleanup } = createBrowserOverlay(id, headerHTML);

    // Attach keyboard nav to the overlay (lives for entire overlay lifetime)
    const nav = attachPickerKeyboardNav(overlay, { onEscape: closeBrowser });
    addCleanup(nav.cleanup);

    async function navigateFolder(path) {
      contentArea.innerHTML = '<div style="padding:40px; text-align:center; color:rgba(255,255,255,0.4); font-size:13px;">Loading...</div>';

      try {
        const deviceParam = device ? `&device=${encodeURIComponent(device)}` : '';
        const data = await agentRequest('GET', `/api/files/browse?path=${encodeURIComponent(path)}${deviceParam}&showHidden=1`, null, targetAgentId);

        renderBreadcrumb(breadcrumbBar, data.path, navigateFolder);
        contentArea.innerHTML = '';

        if (data.path !== '/') {
          const parentPath = data.path.split('/').slice(0, -1).join('/') || '/';
          contentArea.appendChild(createFolderItem('..', () => navigateFolder(parentPath)));
        }

        // "Scan this folder" / "Open this folder" button
        const selectBtn = document.createElement('div');
        selectBtn.setAttribute('data-nav-item', '');
        selectBtn.style.cssText = 'display:flex; align-items:center; gap:10px; padding:9px 16px; cursor:pointer; transition:background 0.1s; font-size:13px; background:rgba(var(--accent-rgb),0.1); border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:2px;';
        selectBtn.innerHTML = `<span style="width:20px; text-align:center; color:#da7756;">\u2713</span><span style="color:#e8a882; font-weight:500;">${escapeHtml(scanLabel)}</span>`;
        selectBtn.addEventListener('click', () => onScan(data.path, contentArea, closeBrowser, navigateFolder, () => nav.refresh()));
        selectBtn.addEventListener('mouseenter', () => { selectBtn.style.background = 'rgba(var(--accent-rgb),0.25)'; });
        selectBtn.addEventListener('mouseleave', () => { selectBtn.style.background = 'rgba(var(--accent-rgb),0.1)'; });
        contentArea.appendChild(selectBtn);

        const dirs = data.entries.filter(e => e.type === 'dir');
        if (dirs.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = 'padding:20px; text-align:center; color:rgba(255,255,255,0.3); font-size:12px;';
          empty.textContent = 'No subdirectories';
          contentArea.appendChild(empty);
        }

        for (const entry of dirs) {
          const fullPath = data.path === '/' ? `/${entry.name}` : `${data.path}/${entry.name}`;
          contentArea.appendChild(createFolderItem(entry.name, () => navigateFolder(fullPath)));
        }

        // Refresh keyboard nav to highlight first item in new content
        nav.refresh();
      } catch (e) {
        contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#f44747; font-size:12px;">Error: ${escapeHtml(e.message)}</div>`;
      }
    }

    navigateFolder('~');
    return { closeBrowser };
  }

  async function showFileBrowser(device, startPath = '~', placementPos, thenPlace = false, targetAgentId) {
    const headerHTML = `
      ${deviceLabelHtml(device, 'font-size:11px; padding:2px 8px;')}
      <span style="color:rgba(255,255,255,0.7); font-size:13px; font-weight:500;">Browse Files</span>
      <button id="file-browser-new" style="margin-left:auto; background:rgba(var(--accent-rgb),0.2); border:1px solid rgba(var(--accent-rgb),0.3); color:rgba(255,255,255,0.7); font-size:12px; cursor:pointer; padding:4px 10px; border-radius:6px; transition:all 0.15s;">+ New File</button>`;
    const { overlay, header, breadcrumbBar, contentArea, closeBrowser, addCleanup } = createBrowserOverlay('file-browser', headerHTML);

    // Attach keyboard nav to the overlay
    const nav = attachPickerKeyboardNav(overlay, { onEscape: closeBrowser });
    addCleanup(nav.cleanup);

    let currentBrowsePath = startPath;

    // New File button handler
    const newFileBtn = header.querySelector('#file-browser-new');
    newFileBtn.addEventListener('mouseenter', () => { newFileBtn.style.background = 'rgba(var(--accent-rgb),0.35)'; newFileBtn.style.color = '#fff'; });
    newFileBtn.addEventListener('mouseleave', () => { newFileBtn.style.background = 'rgba(var(--accent-rgb),0.2)'; newFileBtn.style.color = 'rgba(255,255,255,0.7)'; });
    newFileBtn.addEventListener('click', () => {
      const existing = contentArea.querySelector('.new-file-input-row');
      if (existing) { existing.querySelector('input').focus(); return; }

      const row = document.createElement('div');
      row.className = 'new-file-input-row';
      row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 16px; background:rgba(var(--accent-rgb),0.1); border-bottom:1px solid rgba(var(--accent-rgb),0.2);';

      const icon = document.createElement('span');
      icon.style.cssText = 'width:20px; text-align:center; font-size:13px;';
      icon.textContent = '\u{1F4C4}';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'filename.txt';
      input.style.cssText = 'flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(var(--accent-rgb),0.4); border-radius:4px; color:#fff; padding:5px 8px; font-size:12px; font-family:inherit; outline:none;';
      input.addEventListener('focus', () => { input.style.borderColor = 'rgba(var(--accent-rgb),0.7)'; });
      input.addEventListener('blur', () => { input.style.borderColor = 'rgba(var(--accent-rgb),0.4)'; });

      const createBtn = document.createElement('button');
      createBtn.textContent = 'Create';
      createBtn.style.cssText = 'background:rgba(var(--accent-rgb),0.4); border:none; color:#fff; font-size:11px; padding:5px 12px; border-radius:4px; cursor:pointer; transition:background 0.15s;';
      createBtn.addEventListener('mouseenter', () => { createBtn.style.background = 'rgba(var(--accent-rgb),0.6)'; });
      createBtn.addEventListener('mouseleave', () => { createBtn.style.background = 'rgba(var(--accent-rgb),0.4)'; });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '\u00D7';
      cancelBtn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.4); font-size:16px; cursor:pointer; padding:2px 6px;';
      cancelBtn.addEventListener('click', () => row.remove());

      async function doCreate() {
        const fileName = input.value.trim();
        if (!fileName) return;
        if (fileName.includes('/') || fileName.includes('\\')) {
          input.style.borderColor = '#f44747';
          return;
        }
        createBtn.textContent = '...';
        createBtn.disabled = true;
        const fullPath = currentBrowsePath === '/' ? `/${fileName}` : `${currentBrowsePath}/${fileName}`;
        try {
          await agentRequest('POST', '/api/files/create', { path: fullPath, device }, targetAgentId);
          closeBrowser();
          if (thenPlace) {
            enterPlacementMode('file', (pos) => createFilePaneFromRemote(device, fullPath, pos, targetAgentId));
          } else {
            createFilePaneFromRemote(device, fullPath, placementPos, targetAgentId);
          }
        } catch (e) {
          createBtn.textContent = 'Create';
          createBtn.disabled = false;
          input.style.borderColor = '#f44747';
          console.error('[App] Failed to create file:', e);
        }
      }

      createBtn.addEventListener('click', doCreate);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doCreate();
        if (e.key === 'Escape') row.remove();
      });

      row.appendChild(icon);
      row.appendChild(input);
      row.appendChild(createBtn);
      row.appendChild(cancelBtn);
      contentArea.insertBefore(row, contentArea.firstChild);
      setTimeout(() => input.focus(), 0);
    });

    async function navigateTo(path) {
      contentArea.innerHTML = '<div style="padding:40px; text-align:center; color:rgba(255,255,255,0.4); font-size:13px;">Loading...</div>';

      try {
        const data = await agentRequest('GET', `/api/files/browse?path=${encodeURIComponent(path)}&device=${encodeURIComponent(device)}&showHidden=1`, null, targetAgentId);
        currentBrowsePath = data.path;
        renderBreadcrumb(breadcrumbBar, data.path, navigateTo);
        contentArea.innerHTML = '';

        if (data.path !== '/') {
          const parentPath = data.path.split('/').slice(0, -1).join('/') || '/';
          const parentItem = createBrowserItem('..', 'dir', null, () => navigateTo(parentPath));
          contentArea.appendChild(parentItem);
        }

        if (data.entries.length === 0) {
          contentArea.innerHTML = '<div style="padding:20px; text-align:center; color:rgba(255,255,255,0.3); font-size:12px;">Empty directory</div>';
          nav.refresh();
          return;
        }

        for (const entry of data.entries) {
          const fullPath = data.path === '/' ? `/${entry.name}` : `${data.path}/${entry.name}`;
          const item = createBrowserItem(entry.name, entry.type, entry.size, () => {
            if (entry.type === 'dir') {
              navigateTo(fullPath);
            } else {
              closeBrowser();
              if (thenPlace) {
                enterPlacementMode('file', (pos) => createFilePaneFromRemote(device, fullPath, pos, targetAgentId));
              } else {
                createFilePaneFromRemote(device, fullPath, placementPos, targetAgentId);
              }
            }
          });
          contentArea.appendChild(item);
        }

        // Refresh keyboard nav to highlight first item in new content
        nav.refresh();
      } catch (e) {
        contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#f44747; font-size:12px;">Error: ${escapeHtml(e.message)}</div>`;
      }
    }

    function createBrowserItem(name, type, size, onClick) {
      const item = document.createElement('div');
      item.setAttribute('data-nav-item', '');
      item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:7px 16px; cursor:pointer; transition:background 0.1s; font-size:13px;';
      const icon = name === '..' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' : type === 'dir' ? '\u{1F4C1}' : '\u{1F4C4}';
      const sizeStr = type === 'file' && size !== null ? `<span style="color:rgba(255,255,255,0.3); font-size:11px; margin-left:auto;">${formatBytes(size)}</span>` : '';
      item.innerHTML = `<span style="width:20px; text-align:center;">${icon}</span><span style="color:rgba(255,255,255,0.85); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(name)}</span>${sizeStr}`;
      item.addEventListener('click', onClick);
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(var(--accent-rgb),0.15)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
      return item;
    }

    navigateTo(startPath);
  }

  // Create a file pane from a remote (or local) device + path
  async function createFilePaneFromRemote(device, filePath, placementPos, targetAgentId) {
    const resolvedAgentId = targetAgentId || activeAgentId;

    const position = calcPlacementPos(placementPos, 300, 200);

    try {
      const filePane = await agentRequest('POST', '/api/file-panes', {
        filePath,
        device,
        position,
        size: PANE_DEFAULTS['file']
      }, resolvedAgentId);

      const pane = {
        id: filePane.id,
        type: 'file',
        x: filePane.position.x,
        y: filePane.position.y,
        width: filePane.size.width,
        height: filePane.size.height,
        zIndex: state.nextZIndex++,
        fileName: filePane.fileName,
        filePath: filePane.filePath,
        content: filePane.content,
        device: filePane.device || device,
        agentId: resolvedAgentId
      };

      state.panes.push(pane);
      renderFilePane(pane);
      cloudSaveLayout(pane);

    } catch (e) {
      console.error('[App] Failed to create file pane:', e);
      alert(e.message || 'Failed to open file');
    }
  }



  // Create a new sticky note pane
  async function createNotePane(placementPos, initialContent, initialImages) {

    const position = calcPlacementPos(placementPos, PANE_DEFAULTS['note'].width / 2, PANE_DEFAULTS['note'].height / 2);

    try {
      const notePane = await agentRequest('POST', '/api/notes', { position, size: PANE_DEFAULTS['note'] });

      const pane = {
        id: notePane.id,
        type: 'note',
        x: notePane.position.x,
        y: notePane.position.y,
        width: notePane.size?.width || 600,
        height: notePane.size?.height || 400,
        zIndex: state.nextZIndex++,
        content: initialContent || notePane.content || '',
        images: initialImages || notePane.images || [],
        fontSize: notePane.fontSize || 11,
        agentId: activeAgentId
      };

      state.panes.push(pane);
      renderNotePane(pane);
      cloudSaveLayout(pane);

      // If initial content or images provided, save immediately and focus the note
      if (initialContent || (initialImages && initialImages.length > 0)) {
        agentRequest('PATCH', `/api/notes/${pane.id}`, { content: initialContent || '', images: pane.images }, pane.agentId)
          .catch(e => console.error('Failed to save initial note content:', e));
        cloudSaveNote(pane.id, initialContent || '', pane.fontSize, pane.images);
      }

      // Focus the new note pane
      focusPane(pane);
      const noteInfo = noteEditors.get(pane.id);
      if (noteInfo?.monacoEditor) {
        noteInfo.monacoEditor.focus();
      } else {
        const paneEl = document.getElementById(`pane-${pane.id}`);
        const noteEditor = paneEl?.querySelector('.note-editor');
        if (noteEditor) noteEditor.focus();
      }

      return pane;

    } catch (e) {
      console.error('[App] Failed to create note pane:', e);
      alert('Failed to create note pane: ' + e.message);
    }
  }

  // ============================
  // Todo Pane
  // ============================

  const TODO_PANE_ID = 'todo-global-pane';

  async function createTodoPane() {
    // Idempotent: if todo pane already exists, just focus it
    const existing = state.panes.find(p => p.type === 'todo');
    if (existing) {
      focusPane(existing);
      return;
    }

    const defSize = PANE_DEFAULTS['todo'];
    const viewCenterX = (window.innerWidth / 2 - state.panX) / state.zoom;
    const viewCenterY = (window.innerHeight / 2 - state.panY) / state.zoom;
    const position = { x: viewCenterX - defSize.width / 2, y: viewCenterY - defSize.height / 2 };

    // Load groups from cloud
    let groups = [];
    try {
      const data = await cloudFetch('GET', '/api/todos');
      groups = data.groups || [];
    } catch (e) {
      console.error('[App] Failed to load todo data:', e);
    }

    // Create a default group if none exist
    if (groups.length === 0) {
      try {
        const group = await cloudFetch('POST', '/api/todos/groups', { name: 'Default', sortOrder: 0 });
        groups = [group];
      } catch (e) {
        console.error('[App] Failed to create default todo group:', e);
      }
    }

    const pane = {
      id: TODO_PANE_ID,
      type: 'todo',
      x: position.x,
      y: position.y,
      width: defSize.width,
      height: defSize.height,
      zIndex: state.nextZIndex++,
      agentId: null,
      todoGroups: groups,
    };

    state.panes.push(pane);
    renderTodoPane(pane);
    cloudSaveLayout(pane);
    return pane;
  }

  async function loadTodoPane(cloudLayoutMap) {
    // Prevent duplicate
    if (state.panes.some(p => p.type === 'todo')) return;

    const defSize = PANE_DEFAULTS['todo'];
    let pane;

    // Check if there's a saved layout for the todo pane
    const cl = cloudLayoutMap && cloudLayoutMap.get(TODO_PANE_ID);
    if (cl) {
      pane = {
        id: TODO_PANE_ID,
        type: 'todo',
        x: cl.position_x,
        y: cl.position_y,
        width: cl.width,
        height: cl.height,
        zIndex: cl.z_index || state.nextZIndex++,
        agentId: null,
        todoGroups: [],
      };
    } else {
      const viewCenterX = (window.innerWidth / 2 - state.panX) / state.zoom;
      const viewCenterY = (window.innerHeight / 2 - state.panY) / state.zoom;
      pane = {
        id: TODO_PANE_ID,
        type: 'todo',
        x: viewCenterX - defSize.width / 2,
        y: viewCenterY - defSize.height / 2,
        width: defSize.width,
        height: defSize.height,
        zIndex: state.nextZIndex++,
        agentId: null,
        todoGroups: [],
      };
    }

    // Load groups from cloud
    try {
      const data = await cloudFetch('GET', '/api/todos');
      pane.todoGroups = data.groups || [];
    } catch (e) {
      console.error('[App] Failed to load todo data:', e);
      pane.todoGroups = [];
    }

    state.panes.push(pane);
    renderTodoPane(pane);
    cloudSaveLayout(pane);
  }

  function renderTodoPane(paneData) {
    const existingEl = document.getElementById(`pane-${paneData.id}`);
    if (existingEl) existingEl.remove();

    const pane = document.createElement('div');
    pane.className = 'pane todo-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();

    const groups = paneData.todoGroups || [];

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">\u2705 Todo</span>
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <div class="todo-container">
          <div class="todo-toolbar">
            <button class="todo-add-group-btn">+ Add Group</button>
          </div>
          <div class="todo-groups-list">
            ${renderTodoGroupsHTML(groups)}
          </div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    canvas.appendChild(pane);

    // Store todo pane info
    todoPanes.set(paneData.id, { paneData });

    // Setup event handlers
    setupTodoHandlers(pane, paneData);
  }

  function renderTodoGroupsHTML(groups) {
    if (!groups || groups.length === 0) {
      return '<div class="todo-empty">No groups yet. Click "+ Add Group" to get started.</div>';
    }
    return groups.map((g, gi) => {
      const items = g.items || [];
      return `
        <div class="todo-group" data-group-id="${g.id}">
          <div class="todo-group-header">
            <span class="todo-group-toggle" data-group-id="${g.id}">\u25BC</span>
            <span class="todo-group-name" data-group-id="${g.id}">${escapeHtml(g.name)}</span>
            <span class="todo-group-count">${items.filter(i => i.completed_at).length}/${items.length}</span>
            <button class="todo-group-menu-btn" data-group-id="${g.id}" data-tooltip="Group actions">\u22EF</button>
          </div>
          <div class="todo-group-items" data-group-id="${g.id}">
            ${items.map(item => renderTodoItemHTML(item)).join('')}
            <div class="todo-add-item-row">
              <button class="todo-add-item-btn" data-group-id="${g.id}">+ Add todo</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTodoItemHTML(item) {
    const done = !!item.completed_at;
    const completedClass = done ? ' completed' : '';
    const timeLabel = formatTodoTime(item);
    const notesClass = item.notes ? 'has-notes' : 'no-notes';
    const notesTooltip = item.notes ? 'Edit notes' : 'Add notes';
    return `
      <div class="todo-item${completedClass}" data-item-id="${item.id}">
        <button class="todo-item-checkbox" data-item-id="${item.id}" data-completed="${done}" aria-label="Toggle complete">
          ${done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
        </button>
        <span class="todo-item-title" data-item-id="${item.id}">${escapeHtml(item.title)}</span>
        ${item.notes ? '<span class="todo-item-has-notes">\u{1F4DD}</span>' : ''}
        ${timeLabel ? `<span class="todo-item-time">${timeLabel}</span>` : ''}
        <div class="todo-item-actions">
          <button class="todo-item-notes-btn ${notesClass}" data-item-id="${item.id}" data-tooltip="${notesTooltip}">\u{1F4DD}</button>
          <button class="todo-item-delete-btn" data-item-id="${item.id}" data-tooltip="Delete">\u{1F5D1}</button>
        </div>
      </div>
    `;
  }

  function parseTodoDate(str) {
    if (!str) return null;
    // Handle old SQLite format with space separator (YYYY-MM-DD HH:MM:SS)
    const iso = str.includes('T') ? str : str.replace(' ', 'T');
    const d = new Date(iso + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }

  function formatTodoTime(item) {
    if (item.completed_at) {
      const d = parseTodoDate(item.completed_at);
      return d ? 'done ' + formatDateShort(d) : '';
    }
    if (item.created_at) {
      const d = parseTodoDate(item.created_at);
      return d ? formatDateShort(d) : '';
    }
    return '';
  }

  function formatDateShort(d) {
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function setupTodoHandlers(paneEl, paneData) {
    const container = paneEl.querySelector('.todo-container');
    if (!container) return;

    // Add Group button
    const addGroupBtn = container.querySelector('.todo-add-group-btn');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', async () => {
        const name = prompt('Group name:');
        if (!name || !name.trim()) return;
        try {
          const groups = paneData.todoGroups || [];
          const group = await cloudFetch('POST', '/api/todos/groups', { name: name.trim(), sortOrder: groups.length });
          group.items = group.items || [];
          groups.push(group);
          paneData.todoGroups = groups;
          refreshTodoPane(paneEl, paneData);
        } catch (e) {
          console.error('[Todo] Failed to create group:', e);
        }
      });
    }

    // Delegate click events within the container
    container.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('.todo-group-toggle');
      if (toggleBtn) {
        const gid = toggleBtn.dataset.groupId;
        const itemsEl = container.querySelector(`.todo-group-items[data-group-id="${gid}"]`);
        if (itemsEl) {
          const hidden = itemsEl.style.display === 'none';
          itemsEl.style.display = hidden ? '' : 'none';
          toggleBtn.textContent = hidden ? '\u25BC' : '\u25B6';
        }
        return;
      }

      const groupName = e.target.closest('.todo-group-name');
      if (groupName && !groupName.querySelector('input')) {
        const gid = groupName.dataset.groupId;
        const currentName = groupName.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-inline-input';
        input.value = currentName;
        groupName.textContent = '';
        groupName.appendChild(input);
        input.focus();
        input.select();

        const finish = async () => {
          const newName = input.value.trim();
          if (newName && newName !== currentName) {
            try {
              await cloudFetch('PATCH', `/api/todos/groups/${gid}`, { name: newName });
              const group = (paneData.todoGroups || []).find(g => g.id === gid);
              if (group) group.name = newName;
            } catch (e) {
              console.error('[Todo] Failed to rename group:', e);
            }
          }
          refreshTodoPane(paneEl, paneData);
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { input.value = currentName; input.blur(); }
        });
        return;
      }

      const groupMenuBtn = e.target.closest('.todo-group-menu-btn');
      if (groupMenuBtn) {
        e.stopPropagation();
        const gid = groupMenuBtn.dataset.groupId;
        showTodoContextMenu(groupMenuBtn, paneEl, paneData, 'group', gid);
        return;
      }

      const addBtn = e.target.closest('.todo-add-item-btn');
      if (addBtn) {
        const gid = addBtn.dataset.groupId;
        const row = addBtn.closest('.todo-add-item-row');
        // Replace button with inline input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-inline-input';
        input.placeholder = 'New todo...';
        row.innerHTML = '';
        row.appendChild(input);
        input.focus();

        const finishAdd = async () => {
          const title = input.value.trim();
          if (title) {
            try {
              const group = (paneData.todoGroups || []).find(g => g.id === gid);
              const items = group?.items || [];
              const item = await cloudFetch('POST', `/api/todos/groups/${gid}/items`, { title, sortOrder: items.length });
              if (group) {
                item.notes = item.notes || '';
                items.push(item);
              }
              refreshTodoPane(paneEl, paneData);
            } catch (e) {
              console.error('[Todo] Failed to create item:', e);
              refreshTodoPane(paneEl, paneData);
            }
          } else {
            refreshTodoPane(paneEl, paneData);
          }
        };
        input.addEventListener('blur', finishAdd);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { input.value = ''; input.blur(); }
        });
        return;
      }

      const checkbox = e.target.closest('.todo-item-checkbox');
      if (checkbox) {
        const itemId = checkbox.dataset.itemId;
        const wasCompleted = checkbox.dataset.completed === 'true';
        handleTodoToggle(paneEl, paneData, itemId, !wasCompleted);
        return;
      }

      const itemTitle = e.target.closest('.todo-item-title');
      if (itemTitle && !itemTitle.querySelector('input')) {
        const itemId = itemTitle.dataset.itemId;
        const currentTitle = itemTitle.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-inline-input';
        input.value = currentTitle;
        itemTitle.textContent = '';
        itemTitle.appendChild(input);
        input.focus();
        input.select();

        const finish = async () => {
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== currentTitle) {
            try {
              await cloudFetch('PATCH', `/api/todos/items/${itemId}`, { title: newTitle });
              updateTodoItemData(paneData, itemId, { title: newTitle });
            } catch (e) {
              console.error('[Todo] Failed to update item:', e);
            }
          }
          refreshTodoPane(paneEl, paneData);
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { input.value = currentTitle; input.blur(); }
        });
        return;
      }

      const notesBtn = e.target.closest('.todo-item-notes-btn');
      if (notesBtn) {
        e.stopPropagation();
        const itemId = notesBtn.dataset.itemId;
        const item = findTodoItem(paneData, itemId);
        if (item) showTodoNotesEditor(paneEl, paneData, item);
        return;
      }

      const deleteBtn = e.target.closest('.todo-item-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const itemId = deleteBtn.dataset.itemId;
        const item = findTodoItem(paneData, itemId);
        if (!item) return;
        if (!confirm(`Delete "${item.title}"?`)) return;
        try {
          await cloudFetch('DELETE', `/api/todos/items/${itemId}`);
          removeTodoItemFromData(paneData, itemId);
          const paneElRef = document.getElementById(`pane-${paneData.id}`);
          if (paneElRef) refreshTodoPane(paneElRef, paneData);
        } catch (e) {
          console.error('[Todo] Failed to delete item:', e);
        }
        return;
      }
    });
  }

  async function handleTodoToggle(paneEl, paneData, itemId, completed) {
    try {
      await cloudFetch('PATCH', `/api/todos/items/${itemId}/toggle`, { completed });
      updateTodoItemData(paneData, itemId, {
        completed_at: completed ? new Date().toISOString() : null
      });
      refreshTodoPane(paneEl, paneData);
    } catch (e) {
      console.error('[Todo] Failed to toggle item:', e);
    }
  }

  function updateTodoItemData(paneData, itemId, updates) {
    for (const group of (paneData.todoGroups || [])) {
      for (const item of (group.items || [])) {
        if (item.id === itemId) {
          Object.assign(item, updates);
          return;
        }
      }
    }
  }

  function refreshTodoPane(paneEl, paneData) {
    const groupsList = paneEl.querySelector('.todo-groups-list');
    if (groupsList) {
      groupsList.innerHTML = renderTodoGroupsHTML(paneData.todoGroups || []);
    }
  }

  function showTodoContextMenu(anchorEl, paneEl, paneData, type, id) {
    // Only used for group actions now; item actions are inline buttons
    if (type !== 'group') return;

    // Remove any existing menu
    const existing = document.querySelector('.todo-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'todo-context-menu';
    menu.innerHTML = `
      <button class="todo-ctx-item todo-ctx-delete-group" data-group-id="${id}">\u{1F5D1} Delete Group</button>
    `;

    document.body.appendChild(menu);

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 2}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 160)}px`;

    const close = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    const closeMenu = (ev) => { if (!menu.contains(ev.target)) close(); };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);

    menu.addEventListener('click', async (ev) => {
      const delGroup = ev.target.closest('.todo-ctx-delete-group');
      if (delGroup) {
        close();
        const gid = delGroup.dataset.groupId;
        if (!confirm('Delete this group and all its items?')) return;
        try {
          await cloudFetch('DELETE', `/api/todos/groups/${gid}`);
          paneData.todoGroups = (paneData.todoGroups || []).filter(g => g.id !== gid);
          refreshTodoPane(paneEl.querySelector('.todo-container')?.closest('.pane') || paneEl, paneData);
          // Re-render fully
          renderTodoPane(paneData);
        } catch (e) {
          console.error('[Todo] Failed to delete group:', e);
        }
      }
    });
  }

  function showTodoNotesEditor(paneEl, paneData, item) {
    // Remove any existing editor
    const existing = document.querySelector('.todo-notes-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'todo-notes-overlay';
    overlay.innerHTML = `
      <div class="todo-notes-modal">
        <div class="todo-notes-header">
          <span class="todo-notes-title">${escapeHtml(item.title)} — Notes</span>
          <button class="todo-notes-close">\u2715</button>
        </div>
        <textarea class="todo-notes-textarea" placeholder="Add detailed notes...">${escapeHtml(item.notes || '')}</textarea>
        <div class="todo-notes-footer">
          <button class="todo-notes-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('.todo-notes-textarea');
    textarea.focus();

    let saveTimer = null;
    const saveNotes = async () => {
      const notes = textarea.value;
      try {
        await cloudFetch('PATCH', `/api/todos/items/${item.id}`, { notes });
        item.notes = notes;
        const paneElRef = document.getElementById(`pane-${paneData.id}`);
        if (paneElRef) refreshTodoPane(paneElRef, paneData);
      } catch (e) {
        console.error('[Todo] Failed to save notes:', e);
      }
    };

    // Auto-save on typing (debounced)
    textarea.addEventListener('input', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNotes, 800);
    });

    const closeEditor = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveNotes(); // Save on close
      overlay.remove();
    };

    overlay.querySelector('.todo-notes-close').addEventListener('click', closeEditor);
    overlay.querySelector('.todo-notes-save').addEventListener('click', closeEditor);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closeEditor();
    });
  }

  function findTodoItem(paneData, itemId) {
    for (const group of (paneData.todoGroups || [])) {
      for (const item of (group.items || [])) {
        if (item.id === itemId) return item;
      }
    }
    return null;
  }

  function removeTodoItemFromData(paneData, itemId) {
    for (const group of (paneData.todoGroups || [])) {
      const idx = group.items.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        group.items.splice(idx, 1);
        return;
      }
    }
  }

  // Show device picker then git repo picker
  async function showGitRepoPickerWithDevice(placementPos) {
    showDevicePickerGeneric(
      (d) => showGitRepoPicker(d.name, placementPos, false, d.ip),
      () => showGitRepoPicker(undefined, placementPos)
    );
  }

  // Show folder browser then repo picker for git graph pane
  async function showGitRepoPicker(device, placementPos, thenPlace = false, targetAgentId) {
    const deviceLabel = device ? deviceLabelHtml(device, 'font-size:11px; padding:2px 8px;') : '';
    const headerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" style="color:rgba(255,255,255,0.6);">${ICON_GIT_GRAPH}</svg>
      ${deviceLabel}
      <span style="color:rgba(255,255,255,0.7); font-size:13px; font-weight:500;">Choose Folder</span>`;

    let masterOnly = true;

    showFolderScanPicker({
      id: 'git-repo-browser',
      headerHTML,
      scanLabel: 'Scan this folder for repos',
      device,
      targetAgentId,
      onScan: async (folderPath, contentArea, closeBrowser, navigateFolder, navRefresh) => {
        // Set up progressive UI immediately
        contentArea.innerHTML = '';
        const allRepos = [];
        let scanDone = false;

        // Toggle bar (back + master/main filter)
        const toggleBar = document.createElement('div');
        toggleBar.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 16px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0;';

        const backBtn = document.createElement('button');
        backBtn.setAttribute('data-nav-item', '');
        backBtn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:12px; padding:2px 6px; border-radius:3px;';
        backBtn.textContent = '\u2190 Back';
        backBtn.addEventListener('click', () => navigateFolder(folderPath));
        backBtn.addEventListener('mouseenter', () => { backBtn.style.color = '#fff'; });
        backBtn.addEventListener('mouseleave', () => { backBtn.style.color = 'rgba(255,255,255,0.5)'; });
        toggleBar.appendChild(backBtn);

        const scanStatus = document.createElement('span');
        scanStatus.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.3); margin-left:4px;';
        scanStatus.textContent = 'Scanning...';
        toggleBar.appendChild(scanStatus);

        const spacer = document.createElement('div');
        spacer.style.cssText = 'flex:1;';
        toggleBar.appendChild(spacer);

        const toggleWrap = document.createElement('label');
        toggleWrap.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;';

        const toggleTrack = document.createElement('div');
        toggleTrack.style.cssText = `width:32px; height:18px; border-radius:9px; position:relative; transition:background 0.2s; ${masterOnly ? 'background:rgba(255,255,255,0.15);' : 'background:rgba(var(--accent-rgb),0.6);'}`;

        const toggleThumb = document.createElement('div');
        toggleThumb.style.cssText = `width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; transition:left 0.2s; ${masterOnly ? 'left:2px;' : 'left:16px;'}`;
        toggleTrack.appendChild(toggleThumb);

        const toggleLabel = document.createElement('span');
        toggleLabel.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.5);';
        toggleLabel.textContent = masterOnly ? 'master/main only' : 'all branches';

        toggleWrap.appendChild(toggleTrack);
        toggleWrap.appendChild(toggleLabel);
        toggleWrap.addEventListener('click', (e) => {
          e.preventDefault();
          masterOnly = !masterOnly;
          toggleTrack.style.background = masterOnly ? 'rgba(255,255,255,0.15)' : 'rgba(var(--accent-rgb),0.6)';
          toggleThumb.style.left = masterOnly ? '2px' : '16px';
          toggleLabel.textContent = masterOnly ? 'master/main only' : 'all branches';
          rebuildRepoList();
        });
        toggleBar.appendChild(toggleWrap);
        contentArea.appendChild(toggleBar);

        const repoListEl = document.createElement('div');
        repoListEl.style.cssText = 'overflow-y:auto; flex:1;';
        contentArea.appendChild(repoListEl);

        function makeRepoItem(repo) {
          const item = document.createElement('div');
          item.setAttribute('data-nav-item', '');
          item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:9px 16px; cursor:pointer; transition:background 0.1s; font-size:13px;';
          const branchColor = (repo.branch === 'master' || repo.branch === 'main') ? '#4ec9b0' : '#b392f0';
          item.innerHTML = `
            <span style="color:#f97583; font-size:14px;">&#9679;</span>
            <span style="flex:1; overflow:hidden;">
              <strong style="color:rgba(255,255,255,0.9);">${escapeHtml(repo.name)}</strong><br>
              <span style="opacity:0.4; font-size:11px;">${escapeHtml(repo.path)}</span>
            </span>
            <span style="color:${branchColor}; font-size:11px; white-space:nowrap;">${escapeHtml(repo.branch)}</span>
          `;
          item.addEventListener('click', () => {
            closeBrowser();
            if (thenPlace) {
              enterPlacementMode('git-graph', (pos) => createGitGraphPane(repo.path, device, pos, targetAgentId));
            } else {
              createGitGraphPane(repo.path, device, placementPos, targetAgentId);
            }
          });
          item.addEventListener('mouseenter', () => { item.style.background = 'rgba(var(--accent-rgb),0.15)'; });
          item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
          return item;
        }

        function shouldShow(repo) {
          return !masterOnly || repo.branch === 'master' || repo.branch === 'main';
        }

        function rebuildRepoList() {
          repoListEl.innerHTML = '';
          const filtered = allRepos.filter(shouldShow);
          if (filtered.length === 0 && scanDone) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px; text-align:center; color:rgba(255,255,255,0.3); font-size:12px;';
            empty.textContent = masterOnly ? 'No repos on master/main in this folder' : 'No git repos found in this folder';
            repoListEl.appendChild(empty);
          }
          for (const repo of filtered) repoListEl.appendChild(makeRepoItem(repo));
          if (navRefresh) navRefresh();
        }

        function appendRepo(repo) {
          scanStatus.textContent = `Scanning... (${allRepos.length} found)`;
          if (shouldShow(repo)) {
            repoListEl.appendChild(makeRepoItem(repo));
            if (navRefresh) navRefresh();
          }
        }

        try {
          const deviceParam = device ? `&device=${encodeURIComponent(device)}` : '';
          const finalRepos = await agentRequest('GET', `/api/git-repos/in-folder?path=${encodeURIComponent(folderPath)}${deviceParam}`, null, targetAgentId, {
            onPartial: (repos) => {
              for (const repo of repos) {
                allRepos.push(repo);
                appendRepo(repo);
              }
            }
          });
          scanDone = true;
          // Use final complete list (authoritative) and rebuild
          allRepos.length = 0;
          allRepos.push(...finalRepos);
          scanStatus.textContent = `${allRepos.length} repos`;
          rebuildRepoList();
        } catch (e) {
          contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#f44747; font-size:12px;">Error: ${escapeHtml(e.message)}</div>`;
        }
      }
    });
  }

  // Create a new iframe pane
  async function createIframePane(placementPos) {
    let url = prompt('Enter URL to embed:');
    if (!url || !url.trim()) return;
    url = url.trim();

    // Auto-add protocol if missing
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }

    try {
      new URL(url);
    } catch {
      alert('Invalid URL format');
      return;
    }


    const position = calcPlacementPos(placementPos, 400, 300);

    try {
      const iframeData = await agentRequest('POST', '/api/iframes', { url, position, size: PANE_DEFAULTS['iframe'] });

      const pane = {
        id: iframeData.id,
        type: 'iframe',
        x: iframeData.position.x,
        y: iframeData.position.y,
        width: iframeData.size.width,
        height: iframeData.size.height,
        zIndex: state.nextZIndex++,
        url: iframeData.url,
        agentId: activeAgentId
      };

      state.panes.push(pane);
      renderIframePane(pane);
      cloudSaveLayout(pane);
    } catch (e) {
      console.error('[App] Failed to create iframe pane:', e);
      alert('Failed to create iframe: ' + e.message);
    }
  }

  async function createGitGraphPane(repoPath, device, placementPos, targetAgentId) {
    const resolvedAgentId = targetAgentId || activeAgentId;

    const position = calcPlacementPos(placementPos, 250, 225);

    try {
      const reqBody = { repoPath, position, size: PANE_DEFAULTS['git-graph'] };
      if (device) reqBody.device = device;
      const ggPane = await agentRequest('POST', '/api/git-graphs', reqBody, resolvedAgentId);

      const pane = {
        id: ggPane.id,
        type: 'git-graph',
        x: ggPane.position.x,
        y: ggPane.position.y,
        width: ggPane.size.width,
        height: ggPane.size.height,
        zIndex: state.nextZIndex++,
        repoPath: ggPane.repoPath,
        repoName: ggPane.repoName,
        device: device || ggPane.device,
        agentId: resolvedAgentId
      };

      state.panes.push(pane);
      renderGitGraphPane(pane);
      cloudSaveLayout(pane);

    } catch (e) {
      console.error('[App] Failed to create git graph pane:', e);
      alert('Failed to create git graph pane: ' + e.message);
    }
  }

  function renderGitGraphPane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) {
      existingPane.remove();
    }

    const pane = document.createElement('div');
    pane.className = 'pane git-graph-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    const deviceTag = paneData.device ? deviceLabelHtml(paneData.device) : '';

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title git-graph-title">
          ${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_GIT_GRAPH}</svg>
          ${paneData.repoName || 'Git Graph'}
        </span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <div class="pane-zoom-controls">
            <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">−</button>
            <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
          </div>
          <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">⛶</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <div class="git-graph-container">
          <div class="git-graph-header">
            <span class="git-graph-branch"></span>
            <span class="git-graph-status"></span>
            <button class="git-graph-push-btn" data-tooltip="Push to remote"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push</button>
          </div>
          <div class="git-graph-output"><span class="git-graph-loading">Loading git graph...</span></div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    setupGitGraphListeners(pane, paneData);
    canvas.appendChild(pane);

    // Initial data fetch
    fetchGitGraphData(pane, paneData);
  }

  function setupGitGraphListeners(paneEl, paneData) {
    const graphOutput = paneEl.querySelector('.git-graph-output');
    const pushBtn = paneEl.querySelector('.git-graph-push-btn');

    // Push to remote button
    pushBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      pushBtn.disabled = true;
      pushBtn.textContent = 'Pushing…';
      pushBtn.classList.add('pushing');
      try {
        const data = await agentRequest('POST', `/api/git-graphs/${paneData.id}/push`, null, paneData.agentId);
        pushBtn.textContent = 'Pushed!';
        pushBtn.classList.add('push-success');
        // Refresh the graph to show updated remote indicators
        fetchGitGraphData(paneEl, paneData);
      } catch (err) {
        pushBtn.textContent = 'Failed';
        pushBtn.classList.add('push-failed');
        showErrorToast('Git push failed: ' + err.message);
      }
      setTimeout(() => {
        pushBtn.disabled = false;
        pushBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push';
        pushBtn.classList.remove('pushing', 'push-success', 'push-failed');
      }, 2000);
    });

    // Allow scrolling inside the graph output
    graphOutput.addEventListener('mousedown', (e) => e.stopPropagation());
    graphOutput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    graphOutput.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Auto-refresh every 5 seconds
    const refreshInterval = setInterval(() => {
      fetchGitGraphData(paneEl, paneData);
    }, 5000);

    gitGraphPanes.set(paneData.id, { refreshInterval });
  }

  // ---------------------------------------------------------------------------
  // SVG Git Graph Renderer
  // ---------------------------------------------------------------------------
  const GG = {
    ROW_H: 28,        // height per commit row
    LANE_W: 16,       // horizontal spacing between lanes
    NODE_R: 4,        // commit dot radius
    LEFT_PAD: 12,     // left padding before first lane
    COLORS: [
      '#85e89d', // green  (master/main)
      '#79b8ff', // blue
      '#b392f0', // purple
      '#ffab70', // orange
      '#f97583', // red
      '#4ec9b0', // teal
      '#d1bcf9', // light purple
      '#ffd33d', // yellow
    ],
  };

  /**
   * Assign each commit a lane (column) and resolve branch colors.
   * Returns { lanes: Map<hash, lane>, maxLane, branchColors: Map<lane, colorIdx> }
   */
  function assignLanes(commits) {
    const hashIndex = new Map();
    commits.forEach((c, i) => hashIndex.set(c.hash, i));

    const lanes = new Map();       // hash -> lane number
    const activeLanes = [];        // activeLanes[lane] = hash that "owns" this lane (or null if free)
    let maxLane = 0;
    const branchColors = new Map(); // lane -> color index
    let nextColor = 1;             // 0 reserved for master/main

    // Detect which commit is master/main HEAD
    let masterHash = null;
    for (const c of commits) {
      if (c.refs && (/HEAD -> main\b/.test(c.refs) || /HEAD -> master\b/.test(c.refs))) {
        masterHash = c.hash;
        break;
      }
    }

    for (const commit of commits) {
      let lane = -1;

      // Check if any active lane expects this commit (i.e. it was set as the target)
      for (let i = 0; i < activeLanes.length; i++) {
        if (activeLanes[i] === commit.hash) {
          lane = i;
          break;
        }
      }

      // If no lane claimed this commit, find the first free lane
      if (lane === -1) {
        for (let i = 0; i < activeLanes.length; i++) {
          if (activeLanes[i] === null) { lane = i; break; }
        }
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(null);
        }
      }

      lanes.set(commit.hash, lane);
      if (lane > maxLane) maxLane = lane;

      // Assign color for this lane if not yet assigned
      if (!branchColors.has(lane)) {
        if (commit.hash === masterHash) {
          branchColors.set(lane, 0);
        } else {
          branchColors.set(lane, nextColor);
          nextColor = (nextColor + 1) % GG.COLORS.length;
          if (nextColor === 0) nextColor = 1; // skip master color
        }
      }

      // Free this lane since we've consumed the commit
      activeLanes[lane] = null;

      // Assign parents to lanes
      if (commit.parents.length > 0) {
        const firstParent = commit.parents[0];
        // First parent continues in the same lane
        if (hashIndex.has(firstParent) && !lanes.has(firstParent)) {
          // Check if another lane already claims this parent
          const existingLane = activeLanes.indexOf(firstParent);
          if (existingLane === -1) {
            activeLanes[lane] = firstParent;
          }
        }

        // Additional parents (merges) get new or existing lanes
        for (let p = 1; p < commit.parents.length; p++) {
          const parentHash = commit.parents[p];
          if (!hashIndex.has(parentHash)) continue;
          if (lanes.has(parentHash)) continue;

          // Check if an active lane already targets this parent
          const existing = activeLanes.indexOf(parentHash);
          if (existing !== -1) continue;

          // Find a free lane for this merge parent
          let mergeLane = -1;
          for (let i = 0; i < activeLanes.length; i++) {
            if (activeLanes[i] === null) { mergeLane = i; break; }
          }
          if (mergeLane === -1) {
            mergeLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[mergeLane] = parentHash;
          if (mergeLane > maxLane) maxLane = mergeLane;
          if (!branchColors.has(mergeLane)) {
            branchColors.set(mergeLane, nextColor);
            nextColor = (nextColor + 1) % GG.COLORS.length;
            if (nextColor === 0) nextColor = 1;
          }
        }
      }
    }

    return { lanes, maxLane, branchColors };
  }

  /**
   * Format relative time from unix timestamp
   */
  function gitRelativeTime(ts) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return '1m';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  /**
   * Render commits into the outputEl as an SVG graph + HTML rows.
   */
  function renderSvgGitGraph(outputEl, commits, currentBranch) {
    if (!commits || commits.length === 0) {
      outputEl.innerHTML = '<span class="git-graph-loading">No commits found</span>';
      return;
    }

    const { lanes, maxLane, branchColors } = assignLanes(commits);
    const svgWidth = GG.LEFT_PAD + (maxLane + 1) * GG.LANE_W + 8;
    const totalHeight = commits.length * GG.ROW_H;

    // Build SVG paths for connections and nodes
    const paths = [];  // { d, color } for connection lines
    const nodes = [];  // { cx, cy, color, hash }
    const hashIndex = new Map();
    commits.forEach((c, i) => hashIndex.set(c.hash, i));

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const lane = lanes.get(commit.hash);
      const colorIdx = branchColors.get(lane) ?? 1;
      const color = GG.COLORS[colorIdx];
      const cx = GG.LEFT_PAD + lane * GG.LANE_W;
      const cy = i * GG.ROW_H + GG.ROW_H / 2;

      nodes.push({ cx, cy, color, hash: commit.hash });

      // Draw connections to parents
      for (const parentHash of commit.parents) {
        const pi = hashIndex.get(parentHash);
        if (pi === undefined) continue;
        const parentLane = lanes.get(parentHash);
        if (parentLane === undefined) continue;
        const parentColorIdx = branchColors.get(parentLane) ?? 1;
        const px = GG.LEFT_PAD + parentLane * GG.LANE_W;
        const py = pi * GG.ROW_H + GG.ROW_H / 2;

        let d;
        if (lane === parentLane) {
          // Straight vertical line
          d = `M${cx} ${cy} L${px} ${py}`;
        } else {
          // Bezier curve for merge/branch connections
          const midY = cy + GG.ROW_H * 0.8;
          d = `M${cx} ${cy} C${cx} ${midY}, ${px} ${py - GG.ROW_H * 0.8}, ${px} ${py}`;
        }
        // Use the color of the branch being merged from
        const lineColor = lane !== parentLane ? GG.COLORS[parentColorIdx] : color;
        paths.push({ d, color: lineColor });
      }
    }

    // Also draw vertical continuation lines for active lanes between commits
    // This fills gaps where a lane is active but the commit isn't on that lane
    for (let i = 0; i < commits.length - 1; i++) {
      const commit = commits[i];
      const nextCommit = commits[i + 1];
      const y1 = i * GG.ROW_H + GG.ROW_H / 2;
      const y2 = (i + 1) * GG.ROW_H + GG.ROW_H / 2;

      // For each parent of the current commit, if the parent is further down than i+1,
      // we may need continuation lines. But the parent connections already handle this
      // via straight/bezier lines. The issue is when a lane passes *through* a row
      // without a commit on it. We handle this by checking all active connections.
    }

    // Build SVG
    const svgPaths = paths.map(p =>
      `<path d="${p.d}" stroke="${p.color}" stroke-width="2" fill="none" stroke-opacity="0.7"/>`
    ).join('');
    const svgNodes = nodes.map(n =>
      `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.NODE_R}" fill="${n.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`
    ).join('');

    // Build commit rows HTML
    const rowsHtml = commits.map((commit, i) => {
      const lane = lanes.get(commit.hash);
      const colorIdx = branchColors.get(lane) ?? 1;
      const color = GG.COLORS[colorIdx];
      const timeStr = commit.timestamp ? gitRelativeTime(commit.timestamp) : '';

      // Parse refs for display
      let refsHtml = '';
      if (commit.refs) {
        const refParts = commit.refs.split(',').map(r => r.trim()).filter(Boolean);
        for (const ref of refParts) {
          if (ref.startsWith('HEAD -> ')) {
            const brName = escapeHtml(ref.replace('HEAD -> ', ''));
            refsHtml += `<span class="gg-ref gg-ref-head">${brName}</span>`;
          } else if (ref.startsWith('tag: ')) {
            const tagName = escapeHtml(ref.replace('tag: ', ''));
            refsHtml += `<span class="gg-ref gg-ref-tag">${tagName}</span>`;
          } else if (ref.startsWith('origin/')) {
            const remoteName = escapeHtml(ref);
            refsHtml += `<span class="gg-ref gg-ref-remote">${remoteName}</span>`;
          } else {
            refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
          }
        }
      }

      const subject = escapeHtml(commit.subject || '');
      const author = escapeHtml(commit.author || '');

      return `<div class="gg-row" data-hash="${commit.hash}" style="height:${GG.ROW_H}px">
        <div class="gg-graph-spacer" style="width:${svgWidth}px"></div>
        <div class="gg-info">
          <span class="gg-hash" style="color:${color}">${commit.hash}</span>
          <span class="gg-time">${timeStr}</span>
          ${refsHtml}
          <span class="gg-subject">${subject}</span>
          <span class="gg-author">${author}</span>
        </div>
      </div>`;
    }).join('');

    outputEl.innerHTML = `
      <div class="gg-scroll-container">
        <svg class="gg-svg" width="${svgWidth}" height="${totalHeight}"
             viewBox="0 0 ${svgWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
          ${svgPaths}
          ${svgNodes}
        </svg>
        <div class="gg-rows">${rowsHtml}</div>
      </div>`;
  }

  async function fetchGitGraphData(paneEl, paneData) {
    try {
      const outputEl = paneEl.querySelector('.git-graph-output');
      const maxCommits = 200;
      const data = await agentRequest('GET', `/api/git-graphs/${paneData.id}/data?maxCommits=${maxCommits}`, null, paneData.agentId);

      const branchEl = paneEl.querySelector('.git-graph-branch');
      const statusEl = paneEl.querySelector('.git-graph-status');

      if (data.error) {
        outputEl.innerHTML = `<span class="git-graph-error">Error: ${data.error}</span>`;
        return;
      }

      branchEl.innerHTML = `<span class="git-graph-branch-name">${escapeHtml(data.branch)}</span>`;

      if (data.clean) {
        statusEl.innerHTML = '<span class="git-graph-clean">&#x25cf; clean</span>';
      } else {
        const u = data.uncommitted;
        const details = [];
        if (u.staged > 0) details.push(`<span class="git-detail-staged">\u2713${u.staged}</span>`);
        if (u.unstaged > 0) details.push(`<span class="git-detail-modified">\u270E${u.unstaged}</span>`);
        if (u.untracked > 0) details.push(`<span class="git-detail-new">+${u.untracked}</span>`);
        const detailHtml = details.length ? `<span class="git-graph-detail">${details.join(' ')}</span>` : '';
        statusEl.innerHTML = `<span class="git-graph-dirty">&#x25cf; ${u.total} uncommitted</span>${detailHtml}`;
      }

      // Render SVG graph (supports both new structured data and old graphHtml fallback)
      if (data.commits) {
        renderSvgGitGraph(outputEl, data.commits, data.branch);
      } else if (data.graphHtml) {
        // Fallback for old agent versions that still return graphHtml
        outputEl.innerHTML = `<pre style="margin:0;padding:8px 10px;white-space:pre;font-family:inherit;font-size:inherit;color:inherit;">${data.graphHtml}</pre>`;
      }
    } catch (e) {
      console.error('[App] Failed to fetch git graph data:', e);
    }
  }

  // Delete a pane (terminal or file)
  async function deletePane(paneId) {

    // Remove from broadcast selection if present
    if (selectedPaneIds.delete(paneId)) {
      updateBroadcastIndicator();
    }

    // If this pane is expanded, collapse it first
    if (expandedPaneId === paneId) {
      collapsePane();
    }

    try {
      const pane = state.panes.find(p => p.id === paneId);
      const paneType = pane?.type || 'terminal';

      if (paneType === 'terminal') {
        // Close terminal via WebSocket
        sendWs('terminal:close', { terminalId: paneId }, getPaneAgentId(paneId));

        // Clean up xterm instance
        const termInfo = terminals.get(paneId);
        if (termInfo) {
          termInfo.xterm.dispose();
          terminals.delete(paneId);
          termDeferredBuffers.delete(paneId);
        }
      } else if (paneType === 'file') {
        // Check for unsaved changes
        const editorInfo = fileEditors.get(paneId);
        if (editorInfo?.hasChanges) {
          if (!confirm('You have unsaved changes. Close anyway?')) {
            return;
          }
        }
        // Stop auto-refresh and label update
        if (editorInfo?.refreshInterval) {
          clearInterval(editorInfo.refreshInterval);
        }
        if (editorInfo?.labelInterval) {
          clearInterval(editorInfo.labelInterval);
        }
        // Dispose Monaco editor and ResizeObserver
        if (editorInfo?.monacoEditor) {
          editorInfo.monacoEditor.dispose();
        }
        if (editorInfo?.resizeObserver) {
          editorInfo.resizeObserver.disconnect();
        }
        fileEditors.delete(paneId);
        fileHandles.delete(paneId); // Clean up file handle

        // Delete from server (best-effort — agent may be offline)
        agentRequest('DELETE', `/api/file-panes/${paneId}`, null, pane?.agentId).catch(() => {});
      } else if (paneType === 'note') {
        // Dispose Monaco editor if this is a note pane
        const noteInfo = noteEditors.get(paneId);
        if (noteInfo) {
          if (noteInfo.monacoEditor) noteInfo.monacoEditor.dispose();
          if (noteInfo.resizeObserver) noteInfo.resizeObserver.disconnect();
          noteEditors.delete(paneId);
        }
        // Delete from server (best-effort — agent may be offline)
        agentRequest('DELETE', `/api/notes/${paneId}`, null, pane?.agentId).catch(() => {});
      } else if (paneType === 'git-graph') {
        // Stop auto-refresh
        const ggInfo = gitGraphPanes.get(paneId);
        if (ggInfo?.refreshInterval) {
          clearInterval(ggInfo.refreshInterval);
        }
        gitGraphPanes.delete(paneId);
        // Delete from server (best-effort — agent may be offline)
        agentRequest('DELETE', `/api/git-graphs/${paneId}`, null, pane?.agentId).catch(() => {});
      } else if (paneType === 'iframe') {
        agentRequest('DELETE', `/api/iframes/${paneId}`, null, pane?.agentId).catch(() => {});
      } else if (paneType === 'folder') {
        const fpInfo = folderPanes.get(paneId);
        if (fpInfo?.refreshInterval) clearInterval(fpInfo.refreshInterval);
        folderPanes.delete(paneId);
        agentRequest('DELETE', `/api/folder-panes/${paneId}`, null, pane?.agentId).catch(() => {});
      } else if (paneType === 'todo') {
        // Clean up todo pane data
        todoPanes.delete(paneId);
      }

      // Remove from state
      const index = state.panes.findIndex(p => p.id === paneId);
      if (index !== -1) {
        state.panes.splice(index, 1);
      }

      // Remove from DOM
      const paneEl = document.getElementById(`pane-${paneId}`);
      if (paneEl) {
        paneEl.remove();
      }
      if (lastFocusedPaneId === paneId) lastFocusedPaneId = null;

      // Remove from cloud layout
      cloudDeleteLayout(paneId);

    } catch (e) {
      console.error('[App] Error deleting pane:', e);
    }
  }

  // Attach terminal to WebSocket
  function attachTerminal(pane) {
    const termInfo = terminals.get(pane.id);
    if (!termInfo) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
      sendWs('terminal:attach', {
        terminalId: pane.id,
        tmuxSession: pane.tmuxSession,
        cols: termInfo.xterm.cols,
        rows: termInfo.xterm.rows
      }, pane.agentId);
    } else {
      pendingAttachments.add(pane.id);
    }
  }

  // Re-attach a terminal — equivalent to what a page reload does.
  // Clears xterm buffer, resets all flags, and sends terminal:attach
  // which triggers the full history capture + force redraw on the agent.
  function reattachTerminal(pane) {
    const termInfo = terminals.get(pane.id);
    if (!termInfo) return;

    // Clear xterm buffer (scrollback + visible area)
    termInfo.xterm.clear();
    termInfo.xterm.reset();

    // Reset flags so history injection runs again
    termInfo._historyLoaded = false;
    termInfo._initialAttachDone = false;

    // Re-attach — agent will re-capture history, send it, then force redraw.
    // Agent skips history capture when a TUI app is in alternate screen mode,
    // so no stale scrollback is created.
    attachTerminal(pane);
  }

  // Render a single pane with terminal
  function renderPane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) {
      existingPane.remove();
    }

    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    const deviceTag = paneData.device ? deviceLabelHtml(paneData.device) : '';
    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">${deviceTag}<span style="opacity:0.7;">Terminal</span></span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <button class="term-refresh-history" aria-label="Reload history" data-tooltip="Reload history"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 3a7 7 0 1 0 1 5"/><polyline points="14 1 14 5 10 5"/></svg></button>
          <div class="pane-zoom-controls">
            <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">−</button>
            <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
          </div>
          <span class="connection-status connecting" data-tooltip="Connecting"></span>
          <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">⛶</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <div class="terminal-container"></div>
        <div class="terminal-loading-overlay">Restoring history…</div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    // Fallback: remove loading overlay after 5s if terminal:attached never arrives
    setTimeout(() => {
      const overlay = pane.querySelector('.terminal-loading-overlay');
      if (overlay) {
        overlay.classList.add('fade-out');
        overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      }
    }, 5000);

    setupPaneListeners(pane, paneData);
    canvas.appendChild(pane);

    // Initialize xterm.js
    initTerminal(pane, paneData);
  }

  // Render a file pane
  function renderFilePane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) {
      existingPane.remove();
    }

    const pane = document.createElement('div');
    pane.className = 'pane file-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    const deviceTag = paneData.device ? deviceLabelHtml(paneData.device) : '';

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">${deviceTag}📄 ${escapeHtml(paneData.fileName || 'Untitled')}</span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <div class="pane-zoom-controls">
            <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">−</button>
            <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
          </div>
          <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">⛶</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <div class="file-container">
          <div class="file-toolbar">
            <button class="file-toolbar-btn save-btn" data-tooltip="Save file">Save</button>
            <button class="file-toolbar-btn discard-btn" data-tooltip="Discard changes">Discard</button>
            <button class="file-toolbar-btn reload-btn" data-tooltip="Reload file">Reload</button>
            <span class="file-status"></span>
            <span class="file-refreshed"></span>
          </div>
          <div class="file-editor"></div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    canvas.appendChild(pane);

    // Store original content for change detection (before Monaco init)
    fileEditors.set(paneData.id, {
      originalContent: paneData.content || '',
      hasChanges: false,
      monacoEditor: null
    });

    // Initialize Monaco editor
    initMonacoEditor(pane, paneData);
  }

  // Detect language from filename for Monaco
  function getLanguageFromFileName(fileName) {
    if (!fileName) return 'plaintext';
    const ext = fileName.split('.').pop().toLowerCase();
    const langMap = {
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', pyw: 'python',
      rb: 'ruby', rs: 'rust', go: 'go',
      java: 'java', kt: 'kotlin', scala: 'scala',
      c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
      cs: 'csharp', fs: 'fsharp',
      html: 'html', htm: 'html',
      css: 'css', scss: 'scss', less: 'less',
      json: 'json', jsonc: 'json',
      xml: 'xml', svg: 'xml',
      yaml: 'yaml', yml: 'yaml',
      md: 'markdown', mdx: 'markdown',
      sql: 'sql',
      sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
      ps1: 'powershell',
      php: 'php',
      swift: 'swift', m: 'objective-c',
      r: 'r', R: 'r',
      lua: 'lua', perl: 'perl', pl: 'perl',
      dockerfile: 'dockerfile',
      makefile: 'makefile', mk: 'makefile',
      toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
      vue: 'html', svelte: 'html',
      graphql: 'graphql', gql: 'graphql',
      proto: 'protobuf',
      tf: 'hcl',
      dart: 'dart', elixir: 'elixir', ex: 'elixir', exs: 'elixir',
      clj: 'clojure', cljs: 'clojure',
      zig: 'zig',
    };
    // Also check full filename for special files
    const baseName = fileName.split('/').pop().toLowerCase();
    if (baseName === 'dockerfile') return 'dockerfile';
    if (baseName === 'makefile' || baseName === 'gnumakefile') return 'makefile';
    if (baseName === '.gitignore' || baseName === '.dockerignore') return 'ignore';
    if (baseName === '.env' || baseName.startsWith('.env.')) return 'ini';
    return langMap[ext] || 'plaintext';
  }

  // Initialize Monaco Editor for a file pane
  async function initMonacoEditor(paneEl, paneData) {
    const container = paneEl.querySelector('.file-editor');
    if (!container) return;

    // Wait for Monaco to be ready
    const monaco = await window.monacoReady;

    const language = getLanguageFromFileName(paneData.fileName || paneData.filePath || '');
    const content = paneData.content || '';

    const editor = monaco.editor.create(container, {
      value: content,
      language: language,
      theme: 'tmdx-dark',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      folding: true,
      glyphMargin: false,
      lineNumbersMinChars: 3,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      contextmenu: true,
      fixedOverflowWidgets: true,
    });

    // Store the Monaco instance
    const editorInfo = fileEditors.get(paneData.id);
    if (editorInfo) {
      editorInfo.monacoEditor = editor;
    }

    // Now setup file editor listeners (needs Monaco instance)
    setupFileEditorListeners(paneEl, paneData);

    // Handle layout on pane resize
    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });
    resizeObserver.observe(container);
    if (editorInfo) {
      editorInfo.resizeObserver = resizeObserver;
    }

    // Prevent pane drag when clicking inside editor
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    container.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: true });
  }

  // Pastel color palette for device labels
  const DEVICE_COLORS = [
    { bg: 'rgba(244,143,177,0.25)', border: 'rgba(244,143,177,0.4)', text: 'rgba(244,180,200,0.9)', rgb: '244,143,177' },  // Rose
    { bg: 'rgba(179,157,219,0.25)', border: 'rgba(179,157,219,0.4)', text: 'rgba(200,185,235,0.9)', rgb: '179,157,219' },  // Lavender
    { bg: 'rgba(129,212,250,0.25)', border: 'rgba(129,212,250,0.4)', text: 'rgba(160,220,250,0.9)', rgb: '129,212,250' },  // Sky
    { bg: 'rgba(128,203,196,0.25)', border: 'rgba(128,203,196,0.4)', text: 'rgba(160,215,210,0.9)', rgb: '128,203,196' },  // Mint
    { bg: 'rgba(165,214,167,0.25)', border: 'rgba(165,214,167,0.4)', text: 'rgba(185,225,185,0.9)', rgb: '165,214,167' },  // Sage
    { bg: 'rgba(255,204,128,0.25)', border: 'rgba(255,204,128,0.4)', text: 'rgba(255,215,160,0.9)', rgb: '255,204,128' },  // Peach
    { bg: 'rgba(239,154,154,0.25)', border: 'rgba(239,154,154,0.4)', text: 'rgba(245,180,180,0.9)', rgb: '239,154,154' },  // Coral
    { bg: 'rgba(255,245,157,0.25)', border: 'rgba(255,245,157,0.4)', text: 'rgba(255,245,180,0.9)', rgb: '255,245,157' },  // Lemon
    { bg: 'rgba(159,168,218,0.25)', border: 'rgba(159,168,218,0.4)', text: 'rgba(185,192,230,0.9)', rgb: '159,168,218' },  // Periwinkle
    { bg: 'rgba(248,187,208,0.25)', border: 'rgba(248,187,208,0.4)', text: 'rgba(248,200,220,0.9)', rgb: '248,187,208' },  // Blush
  ];

  function getDeviceColor(deviceName) {
    if (!deviceName) return null;
    // User-chosen color takes priority
    if (deviceColorOverrides[deviceName] != null) {
      return DEVICE_COLORS[deviceColorOverrides[deviceName] % DEVICE_COLORS.length];
    }
    // Fall back to hash-based
    let hash = 0;
    for (let i = 0; i < deviceName.length; i++) {
      hash = ((hash << 5) - hash + deviceName.charCodeAt(i)) | 0;
    }
    return DEVICE_COLORS[Math.abs(hash) % DEVICE_COLORS.length];
  }

  function deviceLabelHtml(deviceName, extraStyle = '') {
    // Device identity is now shown via header background tint, not a label
    return '';
  }

  function applyDeviceHeaderColor(paneEl, deviceName) {
    if (!deviceName) return;
    const color = getDeviceColor(deviceName);
    if (!color || !color.rgb) return;
    const header = paneEl.querySelector('.pane-header');
    if (!header) return;
    header.style.background = `rgba(${color.rgb}, 0.15)`;
    header.style.borderBottom = `1px solid rgba(${color.rgb}, 0.2)`;
  }

  // Escape HTML for safe insertion
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expand a pane to full screen
  function expandPane(paneId) {
    if (expandedPaneId) return; // Already have an expanded pane
    clearMultiSelect();

    const pane = state.panes.find(p => p.id === paneId);
    if (!pane) return;

    const paneEl = document.getElementById(`pane-${paneId}`);
    if (!paneEl) return;

    expandedPaneId = paneId;

    // Store original position/size for restoration
    paneEl.dataset.originalStyle = paneEl.getAttribute('style') || '';

    // Create backdrop overlay
    const backdrop = document.createElement('div');
    backdrop.className = 'expand-backdrop';
    backdrop.id = 'expand-backdrop';
    backdrop.addEventListener('click', () => collapsePane());
    document.body.appendChild(backdrop);

    // Move pane to body (outside canvas transform) for proper fixed positioning
    document.body.appendChild(paneEl);

    // Add expanded class to pane (CSS will handle fullscreen positioning)
    paneEl.classList.add('expanded');

    // Hide close button, change expand button to collapse button
    const expandBtn = paneEl.querySelector('.pane-expand');
    const closeBtn = paneEl.querySelector('.pane-close');
    if (expandBtn) {
      expandBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1v5H1"/><path d="M10 1v5h5"/><path d="M6 15v-5H1"/><path d="M10 15v-5h5"/></svg>';
      expandBtn.setAttribute('data-tooltip', 'Minimize (Esc)');
    }
    if (closeBtn) {
      closeBtn.style.display = 'none';
    }


    // Refit terminal if this is a terminal pane
    if (pane.type === 'terminal') {
      const termInfo = terminals.get(paneId);
      if (termInfo) {
        const doFit = () => {
          try {
            if (termInfo.safeFitAndSync) termInfo.safeFitAndSync();
            else termInfo.fitAddon.fit();
            termInfo.xterm.focus();
          } catch (e) {
            console.error('[App] Fit error on expand:', e);
          }
        };
        setTimeout(doFit, 50);
        setTimeout(doFit, 150);

        // Refresh terminal to enable scrolling
        termInfo.xterm.refresh(0, termInfo.xterm.rows - 1);
      }
    }

    // Refit and focus Monaco editor if this is a file pane
    if (pane.type === 'file') {
      const editorInfo = fileEditors.get(pane.id);
      if (editorInfo?.monacoEditor) {
        const doLayout = () => {
          editorInfo.monacoEditor.layout();
          editorInfo.monacoEditor.focus();
        };
        setTimeout(doLayout, 50);
        setTimeout(doLayout, 150);
      }
    }

  }

  // Collapse expanded pane back to normal
  function collapsePane() {
    if (!expandedPaneId) return;

    const paneId = expandedPaneId;
    const pane = state.panes.find(p => p.id === paneId);
    const paneEl = document.getElementById(`pane-${paneId}`);
    const backdrop = document.getElementById('expand-backdrop');


    // Remove backdrop
    if (backdrop) {
      backdrop.remove();
    }

    if (paneEl) {
      // Remove expanded class
      paneEl.classList.remove('expanded');

      // Restore original style
      const originalStyle = paneEl.dataset.originalStyle;
      if (originalStyle) {
        paneEl.setAttribute('style', originalStyle);
      }
      delete paneEl.dataset.originalStyle;

      // Move pane back to canvas
      canvas.appendChild(paneEl);

      // Restore expand button and close button
      const expandBtn = paneEl.querySelector('.pane-expand');
      const closeBtn = paneEl.querySelector('.pane-close');
      if (expandBtn) {
        expandBtn.innerHTML = '⛶';
        expandBtn.setAttribute('data-tooltip', 'Expand');
      }
      if (closeBtn) {
        closeBtn.style.display = '';
      }
    }

    // Clear expanded state
    expandedPaneId = null;


    // Refit terminal if this is a terminal pane
    if (pane && pane.type === 'terminal') {
      const termInfo = terminals.get(paneId);
      if (termInfo) {
        setTimeout(() => {
          try {
            if (termInfo.safeFitAndSync) termInfo.safeFitAndSync();
            else termInfo.fitAddon.fit();
          } catch (e) {
            console.error('[App] Fit error on collapse:', e);
          }
        }, 50);
      }
    }

    // Relayout Monaco editor if this is a file pane
    if (pane && pane.type === 'file') {
      const editorInfo = fileEditors.get(paneId);
      if (editorInfo?.monacoEditor) {
        setTimeout(() => editorInfo.monacoEditor.layout(), 50);
      }
    }
  }

  // Render a sticky note pane
  function renderNotePane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) {
      const oldInfo = noteEditors.get(paneData.id);
      if (oldInfo) {
        if (oldInfo.monacoEditor) oldInfo.monacoEditor.dispose();
        if (oldInfo.resizeObserver) oldInfo.resizeObserver.disconnect();
        noteEditors.delete(paneData.id);
      }
      existingPane.remove();
    }

    const pane = document.createElement('div');
    pane.className = 'pane note-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    const fontSize = paneData.fontSize || 14;

    // Build images HTML
    const images = paneData.images || [];
    let imagesHtml = '';
    if (images.length > 0) {
      imagesHtml = '<div class="note-images">' + images.map((src, idx) =>
        `<div class="note-image-wrapper" data-img-idx="${idx}">
          <img src="${src}" class="note-image" draggable="false" />
          <button class="note-image-copy" data-tooltip="Copy image" data-img-idx="${idx}">⧉</button>
          <button class="note-image-download" data-tooltip="Download image" data-img-idx="${idx}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 1v5M3 4.5L5 7l2-2.5"/><path d="M1 8.5h8"/></svg></button>
          <button class="note-image-remove" data-tooltip="Remove image" data-img-idx="${idx}">&times;</button>
        </div>`
      ).join('') + '</div>';
    }

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">\u{1F4DD} Note</span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <div class="pane-zoom-controls">
            <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">\u2212</button>
            <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
          </div>
          <button class="note-text-only-btn" aria-label="Preview markdown" data-tooltip="Preview markdown">\u{1F441}</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <div class="note-container">
          ${imagesHtml}
          <div class="note-editor-mount"></div>
          <div class="note-markdown-preview" style="display:none;"></div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    canvas.appendChild(pane);

    initNoteMonaco(pane, paneData);
    setupTextOnlyToggle(pane, paneData);
  }

  // Initialize Monaco editor for a note pane (markdown mode)
  async function initNoteMonaco(paneEl, paneData) {
    const mountEl = paneEl.querySelector('.note-editor-mount');
    if (!mountEl) return;

    const monaco = await window.monacoReady;
    const fontSize = paneData.fontSize || 14;

    const editor = monaco.editor.create(mountEl, {
      value: paneData.content || '',
      language: 'markdown',
      theme: 'tmdx-dark',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
      fontSize: fontSize,
      lineHeight: 1.6,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      renderLineHighlight: 'none',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      folding: false,
      glyphMargin: false,
      lineNumbers: 'off',
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      contextmenu: true,
      fixedOverflowWidgets: true,
      placeholder: 'Quick notes... (markdown supported)',
    });

    const resizeObserver = new ResizeObserver(() => { editor.layout(); });
    resizeObserver.observe(mountEl);

    noteEditors.set(paneData.id, { monacoEditor: editor, resizeObserver });

    // Auto-save on content change (debounced)
    let saveTimeout = null;
    editor.onDidChangeModelContent(() => {
      const content = editor.getValue();
      paneData.content = content;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        agentRequest('PATCH', `/api/notes/${paneData.id}`, { content }, paneData.agentId)
          .catch(e => console.error('Failed to save note:', e));
      }, 500);
      cloudSaveNote(paneData.id, content, paneData.fontSize, paneData.images);
    });

    // Prevent pane drag when clicking in editor
    mountEl.addEventListener('mousedown', (e) => e.stopPropagation());
    mountEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    // Image paste handling on Monaco's DOM
    editor.getDomNode().addEventListener('paste', (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      const imageFiles = [];
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const tier = window.__tcTier;
      if (tier && tier.limits && tier.limits.noteImages !== undefined && tier.limits.noteImages !== null) {
        const total = state.panes.filter(p => p.type === 'note' && p.images).reduce((s, p) => s + p.images.length, 0);
        if (total + imageFiles.length > tier.limits.noteImages) {
          showUpgradePrompt(
            `Your ${(tier.tier || 'free').charAt(0).toUpperCase() + (tier.tier || 'free').slice(1)} plan allows ${tier.limits.noteImages} images across all notes. You have ${total}. Upgrade for more.`
          );
          return;
        }
      }
      if (!paneData.images) paneData.images = [];
      Promise.all(imageFiles.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }))).then(dataUrls => {
        const validUrls = dataUrls.filter(Boolean);
        if (validUrls.length === 0) return;
        paneData.images.push(...validUrls);
        refreshNoteImages(paneEl, paneData);
        agentRequest('PATCH', `/api/notes/${paneData.id}`, { images: paneData.images }, paneData.agentId)
          .catch(e => console.error('Failed to save note images:', e));
        cloudSaveNote(paneData.id, paneData.content, paneData.fontSize, paneData.images);
      });
    });

    setupImageButtonHandlers(paneEl, paneData);
  }

  // Helper to refresh images in note pane
  function refreshNoteImages(paneEl, paneData) {
    const container = paneEl.querySelector('.note-container');
    const mountEl = paneEl.querySelector('.note-editor-mount');
    const existing = container.querySelector('.note-images');
    if (existing) existing.remove();
    if (paneData.images && paneData.images.length > 0) {
      const imagesDiv = document.createElement('div');
      imagesDiv.className = 'note-images';
      imagesDiv.innerHTML = paneData.images.map((src, idx) =>
        `<div class="note-image-wrapper" data-img-idx="${idx}">
          <img src="${src}" class="note-image" draggable="false" />
          <button class="note-image-copy" data-tooltip="Copy image" data-img-idx="${idx}">⧉</button>
          <button class="note-image-download" data-tooltip="Download image" data-img-idx="${idx}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 1v5M3 4.5L5 7l2-2.5"/><path d="M1 8.5h8"/></svg></button>
          <button class="note-image-remove" data-tooltip="Remove image" data-img-idx="${idx}">&times;</button>
        </div>`
      ).join('');
      container.insertBefore(imagesDiv, mountEl);
      setupImageButtonHandlers(paneEl, paneData);
    }
  }

  // Render markdown to HTML for preview mode (sanitized to prevent XSS)
  function renderMarkdownPreview(markdown) {
    if (window.marked) {
      const raw = window.marked.parse(markdown || '', { breaks: true, gfm: true });
      return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
    }
    // Fallback: escape HTML and convert newlines
    return escapeHtml(markdown || '').replace(/\n/g, '<br>');
  }

  // Truncate URL for display in pane header
  function truncateUrl(url) {
    try {
      const u = new URL(url);
      const domain = u.hostname.replace(/^www\./, '');
      return domain.length > 30 ? domain.substring(0, 27) + '...' : domain;
    } catch {
      return url.substring(0, 30);
    }
  }

  // Render an iframe pane
  function renderIframePane(paneData) {

    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) existingPane.remove();

    const pane = document.createElement('div');
    pane.className = 'pane iframe-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">🌐 ${escapeHtml(truncateUrl(paneData.url))}</span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <button class="iframe-refresh" aria-label="Refresh" data-tooltip="Refresh"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 3a7 7 0 1 0 1 5"/><polyline points="14 1 14 5 10 5"/></svg></button>
          <button class="iframe-open-external" aria-label="Open in browser" data-tooltip="Open in browser"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2h4v4"/><path d="M14 2L7 9"/><path d="M13 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/></svg></button>
          <button class="iframe-edit-url" aria-label="Edit URL" data-tooltip="Edit URL"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 2l3 3-8 8H3v-3z"/></svg></button>
          <button class="pane-expand" aria-label="Expand pane">⛶</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="pane-content">
        <iframe class="iframe-embed" src="${escapeHtml(paneData.url)}"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                loading="lazy"></iframe>
        <div class="iframe-overlay"></div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    setupIframeListeners(pane, paneData);
    canvas.appendChild(pane);
  }

  // Setup iframe-specific event listeners
  function setupIframeListeners(paneEl, paneData) {
    const overlay = paneEl.querySelector('.iframe-overlay');
    const iframe = paneEl.querySelector('.iframe-embed');
    const editUrlBtn = paneEl.querySelector('.iframe-edit-url');

    // Refresh button
    paneEl.querySelector('.iframe-refresh').addEventListener('click', (e) => {
      e.stopPropagation();
      iframe.src = paneData.url;
    });

    // Open in browser button
    paneEl.querySelector('.iframe-open-external').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(paneData.url, '_blank');
    });

    editUrlBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      let newUrl = prompt('Enter new URL:', paneData.url);
      if (!newUrl || !newUrl.trim() || newUrl.trim() === paneData.url) return;
      newUrl = newUrl.trim();
      if (!/^https?:\/\//i.test(newUrl)) newUrl = 'http://' + newUrl;

      try {
        new URL(newUrl);
      } catch {
        alert('Invalid URL format');
        return;
      }

      try {
        await agentRequest('PATCH', `/api/iframes/${paneData.id}`, { url: newUrl }, paneData.agentId);
        paneData.url = newUrl;
        iframe.src = newUrl;
        const title = paneEl.querySelector('.pane-title');
        if (title) title.textContent = `🌐 ${truncateUrl(newUrl)}`;
      } catch (err) {
        console.error('Failed to update iframe URL:', err);
      }
    });

    // Click on overlay = user wants to interact with iframe — hide overlay
    paneEl.querySelector('.pane-content').addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  }

  // Show/hide iframe overlays during drag/resize/pan operations
  function showIframeOverlays() {
    document.querySelectorAll('.iframe-overlay').forEach(o => o.style.display = 'block');
  }
  function hideIframeOverlays() {
    document.querySelectorAll('.iframe-overlay').forEach(o => o.style.display = 'none');
  }

  async function createFolderPane(folderPath, placementPos, targetAgentId, device) {
    const resolvedAgentId = targetAgentId || activeAgentId;
    const position = calcPlacementPos(placementPos, 200, 250);

    try {
      const reqBody = { folderPath, position, size: PANE_DEFAULTS['folder'] };
      if (device) reqBody.device = device;
      const fpPane = await agentRequest('POST', '/api/folder-panes', reqBody, resolvedAgentId);

      const pane = {
        id: fpPane.id,
        type: 'folder',
        x: fpPane.position.x,
        y: fpPane.position.y,
        width: fpPane.size.width,
        height: fpPane.size.height,
        zIndex: state.nextZIndex++,
        folderPath: fpPane.folderPath,
        device: device || fpPane.device || null,
        agentId: resolvedAgentId
      };

      state.panes.push(pane);
      renderFolderPane(pane);
      cloudSaveLayout(pane);
    } catch (e) {
      console.error('[App] Failed to create folder pane:', e);
      alert('Failed to create folder pane: ' + e.message);
    }
  }

  function renderFolderPane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) existingPane.remove();

    const pane = document.createElement('div');
    pane.className = 'pane folder-pane';
    pane.id = `pane-${paneData.id}`;
    pane.style.left = `${paneData.x}px`;
    pane.style.top = `${paneData.y}px`;
    pane.style.width = `${paneData.width}px`;
    pane.style.height = `${paneData.height}px`;
    pane.style.zIndex = paneData.zIndex;
    pane.dataset.paneId = paneData.id;

    if (!paneData.shortcutNumber) paneData.shortcutNumber = getNextShortcutNumber();
    const shortPath = paneData.folderPath.replace(/^\/home\/[^/]+/, '~');
    const deviceTag = paneData.device ? deviceLabelHtml(paneData.device) : '';

    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title folder-title">
          ${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_FOLDER}</svg>
          <span class="folder-path-label">${escapeHtml(shortPath)}</span>
        </span>
        ${paneNameHtml(paneData)}
        <div class="pane-header-right">
          ${shortcutBadgeHtml(paneData)}
          <button class="folder-toolbar-btn folder-new-file-btn" data-tooltip="New File">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="2"/><line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="folder-toolbar-btn folder-new-dir-btn" data-tooltip="New Folder">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="2"/><line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="folder-toolbar-btn folder-toggle-hidden-btn" data-tooltip="Toggle hidden files">
            <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="folder-toolbar-btn folder-refresh-btn" data-tooltip="Refresh">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M23 4v6h-6M1 20v-6h6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <div class="pane-zoom-controls">
            <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">\u2212</button>
            <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
          </div>
          <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">\u26F6</button>
          <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="folder-git-bar" style="display:none;">
        <svg viewBox="0 0 24 24" width="12" height="12" class="folder-git-icon">
          <circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="17" cy="6" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/>
          <line x1="7" y1="8" x2="7" y2="16" stroke="currentColor" stroke-width="1.5"/>
          <path d="M17 8c0 3.5-10 3.5-10 6" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        <span class="folder-git-branch"></span>
        <span class="folder-git-status"></span>
        <span class="folder-git-counts"></span>
      </div>
      <div class="pane-content">
        <div class="folder-tree-container">
          <div class="folder-tree-loading">Loading...</div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    const canvas = document.getElementById('canvas');
    canvas.appendChild(pane);
    setupPaneListeners(pane, paneData);

    // Runtime state
    const treeCache = {};
    const expandedPaths = new Set();
    let showHidden = false;
    let gitFileStatus = {}; // absolute path -> 'modified'|'added'|'deleted'|'untracked'|'renamed'
    const treeContainer = pane.querySelector('.folder-tree-container');
    const gitBar = pane.querySelector('.folder-git-bar');

    function getDirGitStatus(dirPath) {
      // A directory inherits the "worst" status of any child file
      const priority = { deleted: 4, added: 3, modified: 2, renamed: 2, untracked: 1 };
      let worst = null, worstP = 0;
      for (const [fp, st] of Object.entries(gitFileStatus)) {
        if (fp.startsWith(dirPath + '/')) {
          const p = priority[st] || 0;
          if (p > worstP) { worstP = p; worst = st; }
        }
      }
      return worst;
    }

    async function fetchGitStatus() {
      try {
        const gs = await agentRequest('GET', `/api/git-status?path=${encodeURIComponent(paneData.folderPath)}`, null, paneData.agentId);
        if (gs.isGit) {
          gitBar.style.display = '';
          gitBar.querySelector('.folder-git-branch').textContent = gs.branch;
          const statusEl = gitBar.querySelector('.folder-git-status');
          if (gs.clean) {
            statusEl.textContent = '\u2713';
            statusEl.className = 'folder-git-status folder-git-clean';
          } else {
            statusEl.textContent = '\u25CF';
            statusEl.className = 'folder-git-status folder-git-dirty';
          }
          const u = gs.uncommitted;
          const parts = [];
          if (u.staged > 0) parts.push(`+${u.staged}`);
          if (u.unstaged > 0) parts.push(`~${u.unstaged}`);
          if (u.untracked > 0) parts.push(`?${u.untracked}`);
          gitBar.querySelector('.folder-git-counts').textContent = parts.join(' ');
          gitFileStatus = gs.files || {};
          renderTree();
        } else {
          gitBar.style.display = 'none';
          gitFileStatus = {};
        }
      } catch {
        gitBar.style.display = 'none';
        gitFileStatus = {};
      }
    }

    async function fetchDir(dirPath) {
      const qs = showHidden ? `?path=${encodeURIComponent(dirPath)}&showHidden=1` : `?path=${encodeURIComponent(dirPath)}`;
      const result = await agentRequest('GET', `/api/files/browse${qs}`, null, paneData.agentId);
      treeCache[dirPath] = result.entries;
      return result.entries;
    }

    function renderTree() {
      treeContainer.innerHTML = '';
      const rootEntries = treeCache[paneData.folderPath];
      if (!rootEntries) {
        treeContainer.innerHTML = '<div class="folder-tree-loading">Loading...</div>';
        return;
      }
      renderEntries(rootEntries, paneData.folderPath, 0, treeContainer);
    }

    function renderEntries(entries, parentPath, depth, container) {
      for (const entry of entries) {
        const fullPath = parentPath + '/' + entry.name;
        const row = document.createElement('div');
        const gitSt = entry.type === 'dir' ? getDirGitStatus(fullPath) : (gitFileStatus[fullPath] || null);
        row.className = 'folder-tree-item' + (entry.type === 'dir' ? ' folder-tree-dir' : ' folder-tree-file') + (gitSt ? ` git-${gitSt}` : '');
        row.style.paddingLeft = `${8 + depth * 16}px`;
        row.dataset.path = fullPath;
        row.dataset.entryType = entry.type;

        const isExpanded = expandedPaths.has(fullPath);

        if (entry.type === 'dir') {
          row.innerHTML = `
            <span class="folder-tree-chevron">${isExpanded ? '&#9660;' : '&#9654;'}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" class="folder-tree-icon"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            <span class="folder-tree-name">${escapeHtml(entry.name)}</span>
            <span class="folder-tree-actions">
              <button class="folder-tree-action-btn folder-rename-btn" data-tooltip="Rename">&#9998;</button>
              <button class="folder-tree-action-btn folder-delete-btn" data-tooltip="Delete">&#128465;</button>
            </span>
          `;
        } else {
          const sizeStr = entry.size != null ? formatFileSize(entry.size) : '';
          row.innerHTML = `
            <span class="folder-tree-chevron" style="visibility:hidden">&#9654;</span>
            <svg viewBox="0 0 24 24" width="14" height="14" class="folder-tree-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            <span class="folder-tree-name">${escapeHtml(entry.name)}</span>
            <span class="folder-tree-size">${sizeStr}</span>
            <span class="folder-tree-actions">
              <button class="folder-tree-action-btn folder-rename-btn" data-tooltip="Rename">&#9998;</button>
              <button class="folder-tree-action-btn folder-delete-btn" data-tooltip="Delete">&#128465;</button>
            </span>
          `;
        }

        container.appendChild(row);

        row.addEventListener('click', async (e) => {
          if (e.target.closest('.folder-tree-action-btn')) return;
          if (entry.type === 'dir') {
            if (isExpanded) {
              expandedPaths.delete(fullPath);
            } else {
              expandedPaths.add(fullPath);
              if (!treeCache[fullPath]) {
                try { await fetchDir(fullPath); } catch(err) { console.error('[Folder] Failed to load', fullPath, err); }
              }
            }
            renderTree();
          } else {
            openFileFromFolder(fullPath, paneData.agentId);
          }
        });

        row.querySelector('.folder-rename-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          startInlineRename(row, entry, parentPath);
        });

        row.querySelector('.folder-delete-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${entry.name}"?`)) return;
          try {
            await agentRequest('DELETE', '/api/files/delete', { path: fullPath }, paneData.agentId);
            if (treeCache[parentPath]) {
              treeCache[parentPath] = treeCache[parentPath].filter(e2 => e2.name !== entry.name);
            }
            if (entry.type === 'dir') {
              delete treeCache[fullPath];
              expandedPaths.delete(fullPath);
            }
            renderTree();
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
        });

        if (entry.type === 'dir' && isExpanded && treeCache[fullPath]) {
          renderEntries(treeCache[fullPath], fullPath, depth + 1, container);
        }
      }
    }

    function startInlineRename(row, entry, parentPath) {
      const nameSpan = row.querySelector('.folder-tree-name');
      const oldName = entry.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldName;
      input.className = 'folder-rename-input';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      const finish = async (commit) => {
        if (commit && input.value && input.value !== oldName) {
          const oldPath = parentPath + '/' + oldName;
          const newPath = parentPath + '/' + input.value;
          try {
            await agentRequest('POST', '/api/files/rename', { oldPath, newPath }, paneData.agentId);
            entry.name = input.value;
            if (entry.type === 'dir' && treeCache[oldPath]) {
              treeCache[newPath] = treeCache[oldPath];
              delete treeCache[oldPath];
              for (const p of [...expandedPaths]) {
                if (p === oldPath || p.startsWith(oldPath + '/')) {
                  expandedPaths.delete(p);
                  expandedPaths.add(p.replace(oldPath, newPath));
                }
              }
            }
          } catch (err) {
            alert('Rename failed: ' + err.message);
          }
        }
        renderTree();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' K';
      return (bytes / (1024 * 1024)).toFixed(1) + ' M';
    }

    async function openFileFromFolder(filePath, agentId) {
      try {
        const reqBody = { filePath, position: { x: paneData.x + paneData.width + 20, y: paneData.y }, size: PANE_DEFAULTS['file'] };
        const fp = await agentRequest('POST', '/api/file-panes', reqBody, agentId);
        const newPane = {
          id: fp.id,
          type: 'file',
          x: fp.position.x,
          y: fp.position.y,
          width: fp.size.width,
          height: fp.size.height,
          zIndex: state.nextZIndex++,
          fileName: fp.fileName,
          filePath: fp.filePath,
          content: fp.content,
          device: fp.device || null,
          agentId: agentId
        };
        state.panes.push(newPane);
        renderFilePane(newPane);
        cloudSaveLayout(newPane);
      } catch (e) {
        alert('Failed to open file: ' + e.message);
      }
    }

    // Toolbar: New File
    pane.querySelector('.folder-new-file-btn').addEventListener('click', async () => {
      const name = prompt('New file name:');
      if (!name) return;
      try {
        await agentRequest('POST', '/api/files/create', { path: paneData.folderPath + '/' + name }, paneData.agentId);
        await refreshTree();
      } catch (e) { alert('Create file failed: ' + e.message); }
    });

    // Toolbar: New Folder
    pane.querySelector('.folder-new-dir-btn').addEventListener('click', async () => {
      const name = prompt('New folder name:');
      if (!name) return;
      try {
        await agentRequest('POST', '/api/files/mkdir', { path: paneData.folderPath + '/' + name }, paneData.agentId);
        await refreshTree();
      } catch (e) { alert('Create folder failed: ' + e.message); }
    });

    // Toolbar: Toggle hidden
    pane.querySelector('.folder-toggle-hidden-btn').addEventListener('click', async () => {
      showHidden = !showHidden;
      pane.querySelector('.folder-toggle-hidden-btn').classList.toggle('active', showHidden);
      Object.keys(treeCache).forEach(k => delete treeCache[k]);
      await refreshTree();
    });

    // Toolbar: Refresh
    pane.querySelector('.folder-refresh-btn').addEventListener('click', () => refreshTree());

    async function refreshTree() {
      const pathsToRefresh = [paneData.folderPath, ...expandedPaths];
      await Promise.all(
        pathsToRefresh.map(p => fetchDir(p).catch(() => null))
      );
      renderTree();
    }

    const refreshInterval = setInterval(() => {
      refreshTree().catch(() => {});
      fetchGitStatus();
    }, 5000);

    folderPanes.set(paneData.id, { refreshInterval });

    fetchDir(paneData.folderPath).then(() => renderTree()).catch(err => {
      treeContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#f44747; font-size:12px;">Error: ${escapeHtml(err.message)}</div>`;
    });
    fetchGitStatus();
  }

  // Setup note editor event listeners
  function setupNoteEditorListeners(paneEl, paneData) {
    const editor = paneEl.querySelector('.note-editor');
    const fontSizeEl = paneEl.querySelector('.note-font-size');
    const decreaseBtn = paneEl.querySelector('.font-decrease');
    const increaseBtn = paneEl.querySelector('.font-increase');

    let saveTimeout = null;

    // Helper to save note images (and re-render image area)
    function saveNoteImages() {
      agentRequest('PATCH', `/api/notes/${paneData.id}`, { images: paneData.images }, paneData.agentId)
        .catch(e => console.error('Failed to save note images:', e));
      cloudSaveNote(paneData.id, paneData.content, paneData.fontSize, paneData.images);
    }

    // Helper to re-render the images area in the note
    function refreshNoteImages() {
      const container = paneEl.querySelector('.note-container');
      // Remove existing images section
      const existing = container.querySelector('.note-images');
      if (existing) existing.remove();
      // Re-render if there are images
      if (paneData.images && paneData.images.length > 0) {
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'note-images';
        imagesDiv.innerHTML = paneData.images.map((src, idx) =>
          `<div class="note-image-wrapper" data-img-idx="${idx}">
            <img src="${src}" class="note-image" draggable="false" />
            <button class="note-image-copy" data-tooltip="Copy image" data-img-idx="${idx}">⧉</button>
          <button class="note-image-download" data-tooltip="Download image" data-img-idx="${idx}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 1v5M3 4.5L5 7l2-2.5"/><path d="M1 8.5h8"/></svg></button>
          <button class="note-image-remove" data-tooltip="Remove image" data-img-idx="${idx}">&times;</button>
          </div>`
        ).join('');
        // Insert before the textarea
        container.insertBefore(imagesDiv, editor);
        // Attach remove handlers
        setupImageButtonHandlers(paneEl, paneData);
      }
    }

    // Handle image paste within focused note editor
    editor.addEventListener('paste', (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      const imageFiles = [];
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      // Check image limit
      const tier = window.__tcTier;
      if (tier && tier.limits && tier.limits.noteImages !== undefined && tier.limits.noteImages !== null) {
        const total = state.panes.filter(p => p.type === 'note' && p.images).reduce((s, p) => s + p.images.length, 0);
        if (total + imageFiles.length > tier.limits.noteImages) {
          showUpgradePrompt(
            `Your ${(tier.tier || 'free').charAt(0).toUpperCase() + (tier.tier || 'free').slice(1)} plan allows ${tier.limits.noteImages} images across all notes. You have ${total}. Upgrade for more.`
          );
          return;
        }
      }
      if (!paneData.images) paneData.images = [];
      Promise.all(imageFiles.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }))).then(dataUrls => {
        const validUrls = dataUrls.filter(Boolean);
        if (validUrls.length === 0) return;
        paneData.images.push(...validUrls);
        refreshNoteImages();
        saveNoteImages();
      });
    });

    // Auto-save on input (debounced)
    editor.addEventListener('input', () => {
      paneData.content = editor.value;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        agentRequest('PATCH', `/api/notes/${paneData.id}`, { content: editor.value }, paneData.agentId)
          .catch(e => console.error('Failed to save note:', e));
      }, 500);
      cloudSaveNote(paneData.id, editor.value, paneData.fontSize, paneData.images);
    });

    // Font size controls
    decreaseBtn.addEventListener('click', () => {
      const newSize = Math.max(10, (paneData.fontSize || 16) - 2);
      paneData.fontSize = newSize;
      editor.style.fontSize = `${newSize}px`;
      fontSizeEl.textContent = `${newSize}px`;
      agentRequest('PATCH', `/api/notes/${paneData.id}`, { fontSize: newSize }, paneData.agentId)
        .catch(e => console.error('Failed to save font size:', e));
      cloudSaveNote(paneData.id, paneData.content, newSize, paneData.images);
    });

    increaseBtn.addEventListener('click', () => {
      const newSize = Math.min(90, (paneData.fontSize || 16) + 2);
      paneData.fontSize = newSize;
      editor.style.fontSize = `${newSize}px`;
      fontSizeEl.textContent = `${newSize}px`;
      agentRequest('PATCH', `/api/notes/${paneData.id}`, { fontSize: newSize }, paneData.agentId)
        .catch(e => console.error('Failed to save font size:', e));
      cloudSaveNote(paneData.id, paneData.content, newSize, paneData.images);
    });

    // Spellcheck only when focused
    editor.addEventListener('focus', () => { editor.spellcheck = true; });
    editor.addEventListener('blur', () => { editor.spellcheck = false; });

    // Allow text selection in editor
    editor.addEventListener('mousedown', (e) => e.stopPropagation());
    editor.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    // Setup image remove handlers
    setupImageButtonHandlers(paneEl, paneData);
  }

  // Setup click handlers for image buttons (copy + remove) in a note pane
  function setupImageButtonHandlers(paneEl, paneData) {
    // Copy buttons
    paneEl.querySelectorAll('.note-image-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.imgIdx, 10);
        if (isNaN(idx) || !paneData.images || !paneData.images[idx]) return;
        const dataUrl = paneData.images[idx];
        // Convert data URL to blob and copy to clipboard
        fetch(dataUrl).then(r => r.blob()).then(blob => {
          const item = new ClipboardItem({ [blob.type]: blob });
          navigator.clipboard.write([item]).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = '⧉'; }, 1000);
          }).catch(() => {
            btn.textContent = '✗';
            setTimeout(() => { btn.textContent = '⧉'; }, 1000);
          });
        });
      });
    });

    // Download buttons
    paneEl.querySelectorAll('.note-image-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.imgIdx, 10);
        if (isNaN(idx) || !paneData.images || !paneData.images[idx]) return;
        const dataUrl = paneData.images[idx];
        const ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'png';
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `note-image-${idx + 1}.${ext}`;
        a.click();
      });
    });

    // Remove buttons
    paneEl.querySelectorAll('.note-image-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.imgIdx, 10);
        if (isNaN(idx) || !paneData.images) return;
        paneData.images.splice(idx, 1);
        // Re-render the images area
        const container = paneEl.querySelector('.note-container');
        const imagesDiv = container.querySelector('.note-images');
        if (imagesDiv) {
          if (paneData.images.length === 0) {
            imagesDiv.remove();
          } else {
            imagesDiv.innerHTML = paneData.images.map((src, i) =>
              `<div class="note-image-wrapper" data-img-idx="${i}">
                <img src="${src}" class="note-image" draggable="false" />
                <button class="note-image-copy" data-tooltip="Copy image" data-img-idx="${i}">⧉</button>
                <button class="note-image-download" data-tooltip="Download image" data-img-idx="${i}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 1v5M3 4.5L5 7l2-2.5"/><path d="M1 8.5h8"/></svg></button>
                <button class="note-image-remove" data-tooltip="Remove image" data-img-idx="${i}">&times;</button>
              </div>`
            ).join('');
            setupImageButtonHandlers(paneEl, paneData);
          }
        }
        // Save
        agentRequest('PATCH', `/api/notes/${paneData.id}`, { images: paneData.images }, paneData.agentId)
          .catch(e => console.error('Failed to save note images:', e));
        cloudSaveNote(paneData.id, paneData.content, paneData.fontSize, paneData.images);
      });
    });
  }

  // Setup text-only mode toggle for note panes (markdown preview)
  function setupTextOnlyToggle(paneEl, paneData) {
    const eyeBtn = paneEl.querySelector('.note-text-only-btn');
    const mountEl = paneEl.querySelector('.note-editor-mount');
    const previewEl = paneEl.querySelector('.note-markdown-preview');

    function enterTextOnly() {
      paneEl.classList.add('text-only');
      paneData.textOnly = true;

      // Sync content from Monaco before switching
      const noteInfo = noteEditors.get(paneData.id);
      if (noteInfo?.monacoEditor) {
        paneData.content = noteInfo.monacoEditor.getValue();
      }

      // Hide Monaco, show rendered preview
      mountEl.style.display = 'none';
      previewEl.style.display = 'block';
      previewEl.innerHTML = renderMarkdownPreview(paneData.content);
      const baseFontSize = paneData.fontSize || 14;
      const scale = (paneData.zoomLevel || 100) / 100;
      previewEl.style.fontSize = `${Math.round(baseFontSize * scale)}px`;

      cloudSaveLayout(paneData);

      // Add floating exit button
      let exitBtn = paneEl.querySelector('.text-only-exit');
      if (!exitBtn) {
        exitBtn = document.createElement('button');
        exitBtn.className = 'text-only-exit';
        exitBtn.innerHTML = '\u{1F441}';
        exitBtn.setAttribute('data-tooltip', 'Back to edit mode');
        exitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          exitTextOnly();
        });
        paneEl.appendChild(exitBtn);
      }
    }

    function exitTextOnly() {
      paneEl.classList.remove('text-only');
      paneData.textOnly = false;

      // Show Monaco, hide preview
      mountEl.style.display = '';
      previewEl.style.display = 'none';

      const noteInfo = noteEditors.get(paneData.id);
      if (noteInfo?.monacoEditor) {
        noteInfo.monacoEditor.layout();
        noteInfo.monacoEditor.focus();
      }

      cloudSaveLayout(paneData);

      const exitBtn = paneEl.querySelector('.text-only-exit');
      if (exitBtn) exitBtn.remove();
    }

    // Eye button → toggle text-only
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (paneEl.classList.contains('text-only')) {
        exitTextOnly();
      } else {
        enterTextOnly();
      }
    });

    // Restore text-only mode if previously persisted
    if (paneData.textOnly) {
      paneEl.classList.add('text-only');
      mountEl.style.display = 'none';
      previewEl.style.display = 'block';
      previewEl.innerHTML = renderMarkdownPreview(paneData.content);
      const baseFontSize = paneData.fontSize || 14;
      const scale = (paneData.zoomLevel || 100) / 100;
      previewEl.style.fontSize = `${Math.round(baseFontSize * scale)}px`;

      let exitBtn = paneEl.querySelector('.text-only-exit');
      if (!exitBtn) {
        exitBtn = document.createElement('button');
        exitBtn.className = 'text-only-exit';
        exitBtn.innerHTML = '\u{1F441}';
        exitBtn.setAttribute('data-tooltip', 'Back to edit mode');
        exitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          exitTextOnly();
        });
        paneEl.appendChild(exitBtn);
      }
    }
  }

  // Setup file editor event listeners
  function setupFileEditorListeners(paneEl, paneData) {
    const editorInfo = fileEditors.get(paneData.id);
    const monacoEditor = editorInfo?.monacoEditor;
    if (!monacoEditor) return;

    const saveBtn = paneEl.querySelector('.save-btn');
    const discardBtn = paneEl.querySelector('.discard-btn');
    const reloadBtn = paneEl.querySelector('.reload-btn');
    const statusEl = paneEl.querySelector('.file-status');

    // Track changes via Monaco's content change event
    monacoEditor.onDidChangeModelContent(() => {
      if (editorInfo && !editorInfo._isRefreshing) {
        const hasChanges = monacoEditor.getValue() !== editorInfo.originalContent;
        editorInfo.hasChanges = hasChanges;
        saveBtn.classList.toggle('has-changes', hasChanges);
        discardBtn.classList.toggle('has-changes', hasChanges);
        statusEl.textContent = hasChanges ? 'Modified' : '';
      }
    });

    // Save with Ctrl+S / Cmd+S inside editor
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveBtn.click();
    });

    // Save button
    saveBtn.addEventListener('click', async () => {
      try {
        const content = monacoEditor.getValue();

        // Check if we have a native file handle for direct save
        const fileHandle = fileHandles.get(paneData.id);
        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
        }

        // Also save to server for persistence
        await agentRequest('PATCH', `/api/file-panes/${paneData.id}`, { content }, paneData.agentId);

        // Update state
        paneData.content = content;
        if (editorInfo) {
          editorInfo.originalContent = content;
          editorInfo.hasChanges = false;
        }
        saveBtn.classList.remove('has-changes');
        discardBtn.classList.remove('has-changes');
        statusEl.textContent = 'Saved';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      } catch (e) {
        console.error('[App] Failed to save file:', e);
        statusEl.textContent = 'Save failed!';
      }
    });

    // Discard changes button
    discardBtn.addEventListener('click', () => {
      if (editorInfo) {
        monacoEditor.setValue(editorInfo.originalContent);
        editorInfo.hasChanges = false;
        saveBtn.classList.remove('has-changes');
        discardBtn.classList.remove('has-changes');
        statusEl.textContent = 'Discarded';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      }
    });

    // Reload button
    reloadBtn.addEventListener('click', async () => {
      try {
        const data = await agentRequest('GET', `/api/file-panes/${paneData.id}?refresh=true`, null, paneData.agentId);

        monacoEditor.setValue(data.content || '');
        paneData.content = data.content;
        if (editorInfo) {
          editorInfo.originalContent = data.content || '';
          editorInfo.hasChanges = false;
        }
        saveBtn.classList.remove('has-changes');
        discardBtn.classList.remove('has-changes');
        statusEl.textContent = 'Reloaded';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      } catch (e) {
        console.error('[App] Failed to reload file:', e);
        statusEl.textContent = e.message || 'Reload failed';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 3000);
      }
    });

    // Refresh file content from server
    const refreshedEl = paneEl.querySelector('.file-refreshed');
    let lastRefreshTime = Date.now();

    function updateRefreshedLabel() {
      const seconds = Math.floor((Date.now() - lastRefreshTime) / 1000);
      if (seconds < 60) {
        refreshedEl.textContent = `${seconds}s ago`;
      } else {
        refreshedEl.textContent = `${Math.floor(seconds / 60)}m ago`;
      }
    }

    async function doRefresh() {
      if (!editorInfo || editorInfo.hasChanges) return;

      try {
        const data = await agentRequest('GET', `/api/file-panes/${paneData.id}?refresh=true`, null, paneData.agentId);

        lastRefreshTime = Date.now();
        updateRefreshedLabel();

        // Only update if content changed and user hasn't modified
        if (data.content !== editorInfo.originalContent && !editorInfo.hasChanges) {
          if (editorInfo) editorInfo._isRefreshing = true;
          monacoEditor.setValue(data.content || '');
          paneData.content = data.content;
          editorInfo.originalContent = data.content || '';
          if (editorInfo) editorInfo._isRefreshing = false;
        }
      } catch (e) {
        // Silently ignore refresh errors
      }
    }

    // Refresh every 1s if pane is focused, every 30s otherwise
    let refreshInterval = setInterval(doRefresh, 30000);
    const labelInterval = setInterval(updateRefreshedLabel, 1000);

    // Immediately load content from single GET endpoint (list endpoint doesn't include content)
    doRefresh();

    function setRefreshRate(focused) {
      clearInterval(refreshInterval);
      refreshInterval = setInterval(doRefresh, focused ? 1000 : 30000);
      if (focused) doRefresh();
    }

    monacoEditor.onDidFocusEditorText(() => setRefreshRate(true));
    monacoEditor.onDidBlurEditorText(() => setRefreshRate(false));

    // Store intervals for cleanup
    if (editorInfo) {
      editorInfo.refreshInterval = refreshInterval;
      editorInfo.labelInterval = labelInterval;
      editorInfo._setRefreshRate = setRefreshRate;
    }
  }

  // Initialize xterm.js for a pane
  function initTerminal(paneEl, paneData) {
    const container = paneEl.querySelector('.terminal-container');

    const xterm = new Terminal({
      allowTransparency: true,
      theme: { ...TERMINAL_THEMES[currentTerminalTheme] },
      fontFamily: getTerminalFontFamily(currentTerminalFont),
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 50000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    xterm.loadAddon(webLinksAddon);

    xterm.open(container);

    // xterm v6 sets inline background-color on its scrollable element via JS,
    // overriding our transparent theme. Force all direct children transparent.
    container.querySelectorAll('.xterm > div').forEach(el => {
      el.style.backgroundColor = 'transparent';
    });

    // Block middle-click paste on xterm's hidden textarea (Linux X11 primary selection)
    // Only preventDefault — no stopPropagation so middle-mouse panning still works
    const xtermTextarea = container.querySelector('.xterm-helper-textarea');
    if (xtermTextarea) {
      xtermTextarea.addEventListener('mouseup', (e) => {
        if (e.button === 1) e.preventDefault();
      }, true);
    }

    // --- Clipboard support for terminal panes ---
    // xterm.js renders to a <canvas>, so native browser copy doesn't work.
    // Copy: right-click with text selected.
    // Paste: xterm handles natively — its hidden textarea receives paste events,
    // which fire onData and send through WebSocket.

    // Track last selection — right-click clears xterm selection before contextmenu fires
    let lastTerminalSelection = '';
    xterm.onSelectionChange(() => {
      const sel = xterm.getSelection();
      if (sel && sel.length > 0) lastTerminalSelection = sel;
    });

    // Pause terminal output writes while mouse is held down so that
    // xterm.js selection can start without being destroyed by incoming
    // tmux redraws (especially in scroll/copy-mode).
    container.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        terminalMouseDown = true;
        console.log(`[DBG-MOUSE] mousedown on ${paneData.id.slice(0,8)} → terminalMouseDown=true`);
      }
    }, true); // capture phase — must fire before zoom interceptor's stopImmediatePropagation
    window.addEventListener('mouseup', () => {
      if (terminalMouseDown) console.log(`[DBG-MOUSE] mouseup → terminalMouseDown=false`);
      terminalMouseDown = false;
    }, true);

    // Right-click on terminal: copy last selected text, always suppress context menu
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (lastTerminalSelection && lastTerminalSelection.length > 0) {
        // execCommand fallback works on HTTP; clipboard API for HTTPS
        const textarea = document.createElement('textarea');
        textarea.value = lastTerminalSelection;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lastTerminalSelection).catch(() => {});
        }
        lastTerminalSelection = '';
        xterm.clearSelection();
      }
    });

    // Fix mouse coordinate offset caused by CSS transforms/zoom.
    // Canvas transform: scale() does NOT affect offsetWidth, so xterm's cell
    // measurements are in unscaled CSS pixels while mouse coords are in scaled
    // viewport pixels. Pane CSS zoom has the same effect — getBoundingClientRect()
    // of xterm's children is scaled but their offsetWidth is not.
    // We correct by dividing by the combined scale (canvas zoom * pane zoom).
    const ZOOM_ADJUSTED = '__zoomAdjusted';
    ['mousemove', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(evType => {
      container.addEventListener(evType, (e) => {
        const paneZoom = parseFloat(container.style.zoom) || 1;
        const totalZoom = state.zoom * paneZoom;
        if (e[ZOOM_ADJUSTED] || Math.abs(totalZoom - 1) < 0.001 || expandedPaneId || isResizing || isDragging) return;
        // Don't intercept right-click — let contextmenu event fire for copy
        if (e.button === 2) return;

        const rect = container.getBoundingClientRect();
        const adjustedX = rect.left + (e.clientX - rect.left) / totalZoom;
        const adjustedY = rect.top + (e.clientY - rect.top) / totalZoom;

        e.stopImmediatePropagation();
        e.preventDefault();

        const corrected = new MouseEvent(evType, {
          clientX: adjustedX,
          clientY: adjustedY,
          screenX: e.screenX + (adjustedX - e.clientX),
          screenY: e.screenY + (adjustedY - e.clientY),
          button: e.button,
          buttons: e.buttons,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          detail: e.detail,
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(corrected, ZOOM_ADJUSTED, { value: true });
        e.target.dispatchEvent(corrected);
      }, true); // capture phase
    });

    // Ctrl+scroll = canvas zoom. Normal scroll = xterm buffer scroll.
    // For non-Ctrl events, we DON'T stop propagation so xterm.js's own
    // wheel handler on the container receives the event. xterm.js handles:
    //   - Mouse reporting → sends wheel escape sequences to PTY (vim, htop)
    //   - Normal mode → scrolls its own buffer
    container.addEventListener('wheel', (e) => {
      // Ctrl+scroll = canvas zoom — must intercept before the zoom handler
      // on .pane-content (which also listens in capture phase).
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(state.zoom * delta, e.clientX, e.clientY);
        return;
      }

      // Prevent browser's native page scroll, but DON'T stop propagation
      // so xterm.js's handler (registered on the same container element)
      // receives the event and processes it for mouse reporting / scrolling.
      e.preventDefault();
    }, { passive: false, capture: true });

    // Store terminal info first
    terminals.set(paneData.id, { xterm, fitAddon });

    // Handle terminal input — send immediately for lowest latency.
    xterm.onData((data) => {
      // Don't forward ANY input until terminal:attached is received.
      // During the pty/tmux handshake the pty is still in cooked mode
      // (echo ON), so any xterm auto-responses (DA, CPR, etc.) would be
      // echoed back as visible garbage. The user can't type during this
      // window anyway (loading overlay is showing).
      const termRef = terminals.get(paneData.id);
      if (!termRef || !termRef._attached) return;
      const encoded = btoa(unescape(encodeURIComponent(data)));
      // Broadcast mode: send to all selected terminal panes
      if (selectedPaneIds.size > 1) {
        for (const selectedId of selectedPaneIds) {
          const p = state.panes.find(x => x.id === selectedId);
          if (p && p.type === 'terminal') {
            sendWs('terminal:input', { terminalId: selectedId, data: encoded }, getPaneAgentId(selectedId));
          }
        }
      } else {
        sendWs('terminal:input', { terminalId: paneData.id, data: encoded }, paneData.agentId);
      }
    });

    // Handle terminal resize — send to server and track last-sent size
    // for desync detection. No debounce: we always want the server to
    // know xterm's actual dimensions immediately after a fit().
    let lastSentCols = 0, lastSentRows = 0;
    let resizeTimeout = null;
    xterm.onResize(({ cols, rows }) => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        lastSentCols = cols;
        lastSentRows = rows;
        sendWs('terminal:resize', { terminalId: paneData.id, cols, rows }, paneData.agentId);
      }, 100);
    });

    // Guard flag: prevent ResizeObserver from re-triggering fit() when
    // fit() itself changes the terminal element size.
    let fitting = false;

    function safeFit() {
      if (fitting) return;
      fitting = true;
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore fit errors
      } finally {
        // Release guard after a microtask so the ResizeObserver callback
        // (which fires asynchronously) still sees fitting=true.
        Promise.resolve().then(() => { fitting = false; });
      }
    }

    // After any fit, make sure the server knows the final size.
    // This catches cases where rapid fits cancel each other's debounced
    // onResize, leaving tmux with a stale row/col count.
    function safeFitAndSync() {
      safeFit();
      // Schedule a sync after the debounce window settles
      scheduleSizeSync();
    }

    let syncTimeout = null;
    function scheduleSizeSync() {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        const cols = xterm.cols, rows = xterm.rows;
        if (cols !== lastSentCols || rows !== lastSentRows) {
          lastSentCols = cols;
          lastSentRows = rows;
          sendWs('terminal:resize', { terminalId: paneData.id, cols, rows }, paneData.agentId);
        }
      }, 250); // after the 100ms onResize debounce settles
    }

    // Expose safeFitAndSync on termInfo so external code (expand, zoom,
    // manual resize) can use the guarded fit instead of raw fitAddon.fit()
    terminals.get(paneData.id).safeFitAndSync = safeFitAndSync;

    // Fit after container is ready, then attach
    setTimeout(() => {
      try {
        safeFit();
        // Now attach terminal after fit
        const pane = state.panes.find(p => p.id === paneData.id);
        if (pane) {
          attachTerminal(pane);
        }
      } catch (e) {
        console.error('[App] Fit error:', e);
      }
    }, 100);

    // Second fit after container layout fully settles — fixes race
    // where initial fit calculates wrong row count, leaving the
    // bottom 100-200px of the terminal unreachable.
    setTimeout(() => {
      safeFitAndSync();
    }, 2000);

    // Setup debounced resize observer — guarded against fit() feedback
    let observerTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      if (fitting) return; // skip: this was triggered by fit() itself
      if (observerTimeout) clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        safeFitAndSync();
      }, 100);
    });
    resizeObserver.observe(container);

    // Periodic desync recovery: every 10s, if xterm's size doesn't match
    // what we last told the server, re-send the resize and force a full
    // terminal refresh so tmux repaints all rows.
    const desyncInterval = setInterval(() => {
      if (!terminals.has(paneData.id)) { clearInterval(desyncInterval); return; }
      const cols = xterm.cols, rows = xterm.rows;
      if (cols !== lastSentCols || rows !== lastSentRows) {
        console.log(`[DESYNC] Terminal ${paneData.id.slice(0,8)}: xterm=${cols}x${rows} server=${lastSentCols}x${lastSentRows} — resyncing`);
        lastSentCols = cols;
        lastSentRows = rows;
        sendWs('terminal:resize', { terminalId: paneData.id, cols, rows }, paneData.agentId);
        // Force xterm to repaint all visible rows
        xterm.refresh(0, rows - 1);
      }
    }, 10000);
  }

  // Setup pane event listeners
  // Shared pane zoom function — handles ALL pane types
  function applyPaneZoom(paneData, paneEl) {
    const scale = (paneData.zoomLevel || 100) / 100;
    if (paneData.type === 'terminal') {
      // Use CSS zoom instead of xterm fontSize — changing fontSize corrupts
      // xterm v6's selection rendering (stale cell dimension cache). CSS zoom
      // scales at browser layout level so xterm internals stay consistent.
      const container = paneEl.querySelector('.terminal-container');
      const termInfo = terminals.get(paneData.id);
      if (container && termInfo) {
        container.style.zoom = scale === 1 ? '' : scale;
        if (termInfo.safeFitAndSync) termInfo.safeFitAndSync();
        else termInfo.fitAddon.fit();
      }
    } else if (paneData.type === 'file') {
      const edInfo = fileEditors.get(paneData.id);
      if (edInfo?.monacoEditor) edInfo.monacoEditor.updateOptions({ fontSize: Math.round(13 * scale) });
    } else if (paneData.type === 'note') {
      const noteInfo = noteEditors.get(paneData.id);
      if (noteInfo?.monacoEditor) {
        noteInfo.monacoEditor.updateOptions({ fontSize: Math.round((paneData.fontSize || 14) * scale) });
      }
      const preview = paneEl.querySelector('.note-markdown-preview');
      if (preview) preview.style.fontSize = `${Math.round((paneData.fontSize || 14) * scale)}px`;
    } else if (paneData.type === 'git-graph') {
      const graphContent = paneEl.querySelector('.git-graph-output');
      if (graphContent) graphContent.style.fontSize = `${Math.round(12 * scale)}px`;
    } else if (paneData.type === 'folder') {
      const treeContainer = paneEl.querySelector('.folder-tree-container');
      if (treeContainer) treeContainer.style.fontSize = `${Math.round(13 * scale)}px`;
    }
  }

  function setupPaneListeners(paneEl, paneData) {
    const header = paneEl.querySelector('.pane-header');
    const closeBtn = paneEl.querySelector('.pane-close');
    const expandBtn = paneEl.querySelector('.pane-expand');
    const resizeHandle = paneEl.querySelector('.pane-resize-handle');
    const zoomInBtn = paneEl.querySelector('.zoom-in');
    const zoomOutBtn = paneEl.querySelector('.zoom-out');

    // Apply device color to header
    applyDeviceHeaderColor(paneEl, paneData.device);

    // Initialize zoom level for this pane
    if (!paneData.zoomLevel) paneData.zoomLevel = 100;
    if (paneData.zoomLevel !== 100) {
      applyPaneZoom(paneData, paneEl);
    }

    const applyZoom = () => applyPaneZoom(paneData, paneEl);

    // Pane name: double-click to edit
    const paneNameEl = paneEl.querySelector('.pane-name');
    if (paneNameEl) {
      paneNameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (paneEl.querySelector('.pane-name-input')) return;

        const input = document.createElement('input');
        input.className = 'pane-name-input';
        input.type = 'text';
        input.value = paneData.paneName || '';
        input.placeholder = 'Name';
        input.maxLength = 50;

        paneNameEl.style.display = 'none';
        header.appendChild(input);
        input.focus();
        input.select();

        const commit = () => {
          const val = input.value.trim();
          paneData.paneName = val || '';
          input.remove();
          paneNameEl.style.display = '';
          if (val) {
            paneNameEl.textContent = val;
            paneNameEl.classList.remove('empty');
          } else {
            paneNameEl.textContent = 'Name';
            paneNameEl.classList.add('empty');
          }
          cloudSaveLayout(paneData);
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (ke) => {
          if (ke.isComposing) return; // don't intercept keys during IME composition
          if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
          if (ke.key === 'Escape') {
            input.removeEventListener('blur', commit);
            input.remove();
            paneNameEl.style.display = '';
          }
          ke.stopPropagation();
        });
        // Prevent header drag while typing
        input.addEventListener('mousedown', (me) => me.stopPropagation());
      });
      // Single click should not start drag
      paneNameEl.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    // Shortcut badge click: open assign popup (delegated so it works after badge replacement)
    paneEl.addEventListener('click', (e) => {
      const badge = e.target.closest('.pane-shortcut-badge');
      if (!badge) return;
      e.stopPropagation();
      showShortcutAssignPopup(paneData);
    });
    paneEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.pane-shortcut-badge')) {
        e.stopPropagation();
      }
    });

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        paneData.zoomLevel = Math.min(500, paneData.zoomLevel + 10);
        applyZoom();
        cloudSaveLayout(paneData);
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        paneData.zoomLevel = Math.max(20, paneData.zoomLevel - 10);
        applyZoom();
        cloudSaveLayout(paneData);
      });
    }

    // Refresh history button (terminal panes only) — re-runs the full
    // attach cycle: clears xterm, resets flags, sends terminal:attach.
    // The agent re-captures tmux history, sends it, then force-redraws.
    // This is equivalent to what happens on a page reload.
    const refreshHistoryBtn = paneEl.querySelector('.term-refresh-history');
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reattachTerminal(paneData);
      });
    }

    // Use capture phase to intercept events before xterm.js handles them
    // This ensures focus works even when clicking inside the terminal
    paneEl.addEventListener('mousedown', (e) => {

      // In Quick View or device hover, the overlay handles all interactions — don't intercept
      if (quickViewActive || deviceHoverActive) return;
      // Don't steal focus from HUD inputs or other external interactive elements
      if (isExternalInputFocused()) return;
      if (moveModeActive) return;
      // Ctrl+Shift+Click: toggle fullscreen
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (expandedPaneId === paneData.id) {
          collapsePane();
        } else {
          expandPane(paneData.id);
        }
        return;
      }
      // Shift+Click: toggle broadcast selection (any pane type)
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        togglePaneSelection(paneData.id);
        updateBroadcastIndicator();
        if (selectedPaneIds.has(paneData.id)) {
          focusPane(paneData);
          focusTerminalInput(paneData.id);
        }
        return;
      }
      // Normal click on a broadcast-selected pane: keep selection, just focus
      if (selectedPaneIds.has(paneData.id)) {
        focusPane(paneData);
        focusTerminalInput(paneData.id);
        return;
      }
      // Normal click outside broadcast group: clear selection
      if (selectedPaneIds.size > 0) {
        clearMultiSelect();
      }
      focusPane(paneData);
      focusTerminalInput(paneData.id);
    }, true); // capture phase

    // Track touch start position for tap-vs-drag detection
    let _touchStartX = 0;
    let _touchStartY = 0;
    let _touchStartTime = 0;

    paneEl.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
        _touchStartTime = Date.now();
      }
      focusPane(paneData);
      focusTerminalInput(paneData.id);
    }, { passive: true, capture: true });

    // Auto-fullscreen terminal panes on phone tap
    paneEl.addEventListener('touchend', (e) => {
      if (window.innerWidth > 768) return;
      if (paneData.type !== 'terminal') return;
      if (expandedPaneId) return;
      if (quickViewActive || deviceHoverActive) return;
      const touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - _touchStartX);
      const dy = Math.abs(touch.clientY - _touchStartY);
      const elapsed = Date.now() - _touchStartTime;
      if (dx < 15 && dy < 15 && elapsed < 400) {
        expandPane(paneData.id);
      }
    }, { passive: true });

    // Focus pane and terminal input on hover
    paneEl.addEventListener('mouseenter', () => {
      // In Quick View or device hover: no focus, no overlay removal — just a hover hint
      if (quickViewActive || deviceHoverActive) {
        paneEl.classList.add('qv-hover');
        return;
      }
      if (isPanning) return; // middle-mouse panning — skip focus changes
      if (moveModeActive) return;
      // Don't steal focus from interactive elements outside panes (e.g. HUD search inputs)
      if (isExternalInputFocused()) return;
      if (focusMode !== 'hover') return; // click-to-focus mode: hover doesn't focus
      paneEl.classList.add('focused');
      focusPane(paneData);
      focusTerminalInput(paneData.id);

      // Focus note editor and place cursor at end
      const noteEditor = paneEl.querySelector('.note-editor');
      if (noteEditor) {
        noteEditor.focus();
        noteEditor.scrollTop = noteEditor.scrollHeight;
        noteEditor.selectionStart = noteEditor.selectionEnd = noteEditor.value.length;
      }
    });

    paneEl.addEventListener('mouseleave', (e) => {
      // In Quick View or device hover: just remove hover hint
      if (quickViewActive || deviceHoverActive) {
        paneEl.classList.remove('qv-hover');
        return;
      }
      if (moveModeActive) return;
      if (focusMode !== 'hover') return; // click-to-focus: don't blur on leave
      if (isComposing) return; // don't blur during IME composition (Chinese/Japanese/Korean input)
      if (!isDragging && !isResizing && !isPanning) {
        const termInfo = terminals.get(paneData.id);
        const hasSelection = termInfo && termInfo.xterm && termInfo.xterm.hasSelection();
        const isSelectDrag = (e.buttons & 1) !== 0; // primary button still held

        // Don't blur terminal if the user has selected text or is mid-drag —
        // xterm.blur() clears the canvas selection highlight, which breaks
        // right-click copy. Focus transfers naturally on the next mousedown.
        if (!hasSelection && !isSelectDrag) {
          if (termInfo && termInfo.xterm) termInfo.xterm.blur();

          // Blur any other focused element inside the pane
          if (document.activeElement && paneEl.contains(document.activeElement)) {
            document.activeElement.blur();
          }
        }

        paneEl.classList.remove('focused');
      }
    });

    // Header drag - immediate, no hold needed
    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn || e.target.classList.contains('connection-status')) return;
      // Ctrl+Shift+Click on header also triggers fullscreen (handled by capture listener above)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
      e.stopPropagation();
      startDrag(e, paneEl, paneData);
    });
    header.addEventListener('touchstart', (e) => {
      if (e.target === closeBtn || e.target.classList.contains('connection-status')) return;
      e.stopPropagation();
      startDrag(e, paneEl, paneData);
    }, { passive: false });

    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePane(paneData.id);
    });
    closeBtn.addEventListener('touchend', (e) => {
      e.stopPropagation();
      e.preventDefault();
      deletePane(paneData.id);
    });

    // Expand/Collapse button (only for terminal and file panes, not notes)
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedPaneId === paneData.id) {
          collapsePane();
        } else {
          expandPane(paneData.id);
        }
      });
      expandBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (expandedPaneId === paneData.id) {
          collapsePane();
        } else {
          expandPane(paneData.id);
        }
      });
    }

    // Resize handle - short hold then drag
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startResizeHold(e, paneEl, paneData);
    });
    resizeHandle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      startResizeHold(e, paneEl, paneData);
    }, { passive: false });
  }

  // Find closest snap targets for a pane being dragged (independent X and Y)
  function findSnapTargets(draggedPane, draggedX, draggedY, excludeIds) {
    const dRight = draggedX + draggedPane.width;
    const dBottom = draggedY + draggedPane.height;

    let bestX = null;
    let bestDistX = SNAP_THRESHOLD + 1;
    let bestY = null;
    let bestDistY = SNAP_THRESHOLD + 1;

    for (const other of state.panes) {
      if (other.id === draggedPane.id) continue;
      if (excludeIds && excludeIds.has(other.id)) continue;
      const el = document.getElementById(`pane-${other.id}`);
      if (!el || el.style.display === 'none') continue;

      const oLeft = other.x;
      const oRight = other.x + other.width;
      const oTop = other.y;
      const oBottom = other.y + other.height;

      // Check vertical overlap (needed for left/right snapping)
      const vOverlap = draggedY < oBottom && dBottom > oTop;
      // Check horizontal overlap (needed for top/bottom snapping)
      const hOverlap = draggedX < oRight && dRight > oLeft;

      // Right edge of dragged -> Left edge of other
      if (vOverlap) {
        const dist = Math.abs(dRight + SNAP_GAP - oLeft);
        if (dist < bestDistX) {
          bestDistX = dist;
          bestX = { adjustX: oLeft - draggedPane.width - SNAP_GAP, edge: oLeft - SNAP_GAP / 2, orientation: 'vertical',
            top: Math.max(draggedY, oTop), bottom: Math.min(dBottom, oBottom), otherId: other.id };
        }
      }

      // Left edge of dragged -> Right edge of other
      if (vOverlap) {
        const dist = Math.abs(draggedX - SNAP_GAP - oRight);
        if (dist < bestDistX) {
          bestDistX = dist;
          bestX = { adjustX: oRight + SNAP_GAP, edge: oRight + SNAP_GAP / 2, orientation: 'vertical',
            top: Math.max(draggedY, oTop), bottom: Math.min(dBottom, oBottom), otherId: other.id };
        }
      }

      // Bottom edge of dragged -> Top edge of other
      if (hOverlap) {
        const dist = Math.abs(dBottom + SNAP_GAP - oTop);
        if (dist < bestDistY) {
          bestDistY = dist;
          bestY = { adjustY: oTop - draggedPane.height - SNAP_GAP, edge: oTop - SNAP_GAP / 2, orientation: 'horizontal',
            left: Math.max(draggedX, oLeft), right: Math.min(dRight, oRight), otherId: other.id };
        }
      }

      // Top edge of dragged -> Bottom edge of other
      if (hOverlap) {
        const dist = Math.abs(draggedY - SNAP_GAP - oBottom);
        if (dist < bestDistY) {
          bestDistY = dist;
          bestY = { adjustY: oBottom + SNAP_GAP, edge: oBottom + SNAP_GAP / 2, orientation: 'horizontal',
            left: Math.max(draggedX, oLeft), right: Math.min(dRight, oRight), otherId: other.id };
        }
      }
    }

    const snapX = bestDistX <= SNAP_THRESHOLD ? bestX : null;
    let snapY = bestDistY <= SNAP_THRESHOLD ? bestY : null;

    // Same-edge alignment: when snapped side-by-side (X), align top/bottom edges
    if (snapX && !snapY) {
      const other = state.panes.find(p => p.id === snapX.otherId);
      if (other) {
        const topDist = Math.abs(draggedY - other.y);
        const bottomDist = Math.abs(dBottom - (other.y + other.height));
        if (topDist < SNAP_THRESHOLD && topDist <= bottomDist) {
          snapY = { adjustY: other.y, edge: other.y, orientation: 'horizontal',
            left: Math.min(draggedX, other.x), right: Math.max(dRight, other.x + other.width), otherId: other.id };
        } else if (bottomDist < SNAP_THRESHOLD) {
          snapY = { adjustY: other.y + other.height - draggedPane.height, edge: other.y + other.height, orientation: 'horizontal',
            left: Math.min(draggedX, other.x), right: Math.max(dRight, other.x + other.width), otherId: other.id };
        }
      }
    }

    // Same-edge alignment: when snapped stacked (Y), align left/right edges
    if (snapY && !snapX) {
      const other = state.panes.find(p => p.id === snapY.otherId);
      if (other) {
        const leftDist = Math.abs(draggedX - other.x);
        const rightDist = Math.abs(dRight - (other.x + other.width));
        if (leftDist < SNAP_THRESHOLD && leftDist <= rightDist) {
          bestX = { adjustX: other.x, edge: other.x, orientation: 'vertical',
            top: Math.min(draggedY, other.y), bottom: Math.max(dBottom, other.y + other.height), otherId: other.id };
          return { x: bestX, y: snapY };
        } else if (rightDist < SNAP_THRESHOLD) {
          bestX = { adjustX: other.x + other.width - draggedPane.width, edge: other.x + other.width, orientation: 'vertical',
            top: Math.min(draggedY, other.y), bottom: Math.max(dBottom, other.y + other.height), otherId: other.id };
          return { x: bestX, y: snapY };
        }
      }
    }

    return (snapX || snapY) ? { x: snapX, y: snapY } : null;
  }

  // Find resize snap targets (right and bottom edges of resizing pane)
  function findResizeSnapTargets(paneData, newWidth, newHeight) {
    const rightEdge = paneData.x + newWidth;
    const bottomEdge = paneData.y + newHeight;

    let bestW = null, bestDistW = SNAP_THRESHOLD + 1;
    let bestH = null, bestDistH = SNAP_THRESHOLD + 1;

    for (const other of state.panes) {
      if (other.id === paneData.id) continue;
      const el = document.getElementById(`pane-${other.id}`);
      if (!el || el.style.display === 'none') continue;

      const oLeft = other.x;
      const oRight = other.x + other.width;
      const oTop = other.y;
      const oBottom = other.y + other.height;

      // Overlap checks with tolerance for adjacent/nearby panes
      const margin = SNAP_GAP + SNAP_THRESHOLD;
      const vOverlap = paneData.y < oBottom + margin && bottomEdge > oTop - margin;
      const hOverlap = paneData.x < oRight + margin && rightEdge > oLeft - margin;

      if (vOverlap) {
        // Right edge -> other's left edge (with gap)
        const distL = Math.abs(rightEdge + SNAP_GAP - oLeft);
        if (distL < bestDistW) {
          bestDistW = distL;
          bestW = { snapWidth: oLeft - paneData.x - SNAP_GAP, edge: oLeft - SNAP_GAP / 2, orientation: 'vertical',
            top: Math.min(paneData.y, oTop), bottom: Math.max(bottomEdge, oBottom) };
        }
        // Right edge -> other's right edge (align)
        const distR = Math.abs(rightEdge - oRight);
        if (distR < bestDistW) {
          bestDistW = distR;
          bestW = { snapWidth: oRight - paneData.x, edge: oRight, orientation: 'vertical',
            top: Math.min(paneData.y, oTop), bottom: Math.max(bottomEdge, oBottom) };
        }
      }

      if (hOverlap) {
        // Bottom edge -> other's top edge (with gap)
        const distT = Math.abs(bottomEdge + SNAP_GAP - oTop);
        if (distT < bestDistH) {
          bestDistH = distT;
          bestH = { snapHeight: oTop - paneData.y - SNAP_GAP, edge: oTop - SNAP_GAP / 2, orientation: 'horizontal',
            left: Math.min(paneData.x, oLeft), right: Math.max(rightEdge, oRight) };
        }
        // Bottom edge -> other's bottom edge (align)
        const distB = Math.abs(bottomEdge - oBottom);
        if (distB < bestDistH) {
          bestDistH = distB;
          bestH = { snapHeight: oBottom - paneData.y, edge: oBottom, orientation: 'horizontal',
            left: Math.min(paneData.x, oLeft), right: Math.max(rightEdge, oRight) };
        }
      }
    }

    const snapW = bestDistW <= SNAP_THRESHOLD ? bestW : null;
    const snapH = bestDistH <= SNAP_THRESHOLD ? bestH : null;
    return (snapW || snapH) ? { w: snapW, h: snapH } : null;
  }

  let snapGuideX = null;
  let snapGuideY = null;

  function updateSnapGuide(guide, snap) {
    if (!guide) {
      guide = document.createElement('div');
      guide.style.pointerEvents = 'none';
      document.getElementById('canvas').appendChild(guide);
    }
    guide.className = `snap-guide ${snap.orientation}`;
    if (snap.orientation === 'vertical') {
      guide.style.left = `${snap.edge}px`;
      guide.style.top = `${snap.top}px`;
      guide.style.height = `${snap.bottom - snap.top}px`;
      guide.style.width = '';
    } else {
      guide.style.left = `${snap.left}px`;
      guide.style.top = `${snap.edge}px`;
      guide.style.width = `${snap.right - snap.left}px`;
      guide.style.height = '';
    }
    return guide;
  }

  function showSnapGuides(snaps) {
    if (snaps.x) { snapGuideX = updateSnapGuide(snapGuideX, snaps.x); }
    else if (snapGuideX) { snapGuideX.remove(); snapGuideX = null; }
    if (snaps.y) { snapGuideY = updateSnapGuide(snapGuideY, snaps.y); }
    else if (snapGuideY) { snapGuideY.remove(); snapGuideY = null; }
  }

  function removeSnapGuides() {
    if (snapGuideX) { snapGuideX.remove(); snapGuideX = null; }
    if (snapGuideY) { snapGuideY.remove(); snapGuideY = null; }
  }

  // Start dragging immediately (for header)
  function startDrag(e, paneEl, paneData) {
    e.preventDefault();
    isDragging = true;
    activePane = paneEl;
    paneEl.classList.add('dragging');
    document.body.classList.add('no-select');
    showIframeOverlays();

    const point = e.touches ? e.touches[0] : e;
    const rect = paneEl.getBoundingClientRect();
    dragOffsetX = (point.clientX - rect.left) / state.zoom;
    dragOffsetY = (point.clientY - rect.top) / state.zoom;

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    // Determine group drag: if this pane is in the selection, drag all selected
    const isGroupDrag = selectedPaneIds.size > 1 && selectedPaneIds.has(paneData.id);
    let groupPanes = null;

    if (isGroupDrag) {
      groupPanes = [];
      selectedPaneIds.forEach(id => {
        const p = state.panes.find(x => x.id === id);
        const el = document.getElementById(`pane-${id}`);
        if (p && el) {
          groupPanes.push({ paneData: p, paneEl: el, startX: p.x, startY: p.y });
          el.classList.add('dragging');
        }
      });
    }

    const startX = paneData.x;
    const startY = paneData.y;

    const moveHandler = (moveE) => {
      moveE.preventDefault();
      const movePoint = moveE.touches ? moveE.touches[0] : moveE;
      let newX = (movePoint.clientX - state.panX) / state.zoom - dragOffsetX;
      let newY = (movePoint.clientY - state.panY) / state.zoom - dragOffsetY;

      // Snap-to-edge (unless Shift held)
      if (!moveE.shiftKey) {
        const snaps = findSnapTargets(paneData, newX, newY, isGroupDrag ? selectedPaneIds : null);
        if (snaps) {
          if (snaps.x) newX = snaps.x.adjustX;
          if (snaps.y) newY = snaps.y.adjustY;
          showSnapGuides(snaps);
        } else {
          removeSnapGuides();
        }
      } else {
        removeSnapGuides();
      }

      paneEl.style.left = `${newX}px`;
      paneEl.style.top = `${newY}px`;
      paneData.x = newX;
      paneData.y = newY;

      // Move the rest of the group by the same delta
      if (isGroupDrag) {
        const dx = newX - startX;
        const dy = newY - startY;
        groupPanes.forEach(({ paneData: p, paneEl: el, startX: sx, startY: sy }) => {
          if (p.id === paneData.id) return;
          p.x = sx + dx;
          p.y = sy + dy;
          el.style.left = `${p.x}px`;
          el.style.top = `${p.y}px`;
        });
      }
    };

    const endHandler = () => {
      removeSnapGuides();
      isDragging = false;
      paneEl.classList.remove('dragging');
      document.body.classList.remove('no-select');
      activePane = null;
      hideIframeOverlays();

      // Save position to server (use correct endpoint based on pane type)

      if (isGroupDrag) {
        // Remove dragging class and save all group positions (cloud-only)
        groupPanes.forEach(({ paneData: p, paneEl: el }) => {
          el.classList.remove('dragging');
          cloudSaveLayout(p);
        });
      } else {
        cloudSaveLayout(paneData);
      }

      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchend', endHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchend', endHandler);
  }

  // Start resize with short hold
  function startResizeHold(e, paneEl, paneData) {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const resizeHandle = paneEl.querySelector('.pane-resize-handle');

    resizeHandle.classList.add('hold-active');

    holdTimer = setTimeout(() => {
      activateResize(paneEl, paneData, point);
    }, RESIZE_HOLD_DURATION);

    const endHandler = () => {
      clearTimeout(holdTimer);
      if (!isResizing) {
        resizeHandle.classList.remove('hold-active');
      }
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchend', endHandler);
    };

    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchend', endHandler);
  }

  // Activate resize mode
  function activateResize(paneEl, paneData, startPoint) {
    isResizing = true;
    paneEl.classList.add('resizing');
    document.body.classList.add('no-select');
    showIframeOverlays();

    const startWidth = paneData.width;
    const startHeight = paneData.height;
    const startX = startPoint.clientX;
    const startY = startPoint.clientY;

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    // During drag resize we must NOT call fitAddon.fit() continuously —
    // each fit() clears xterm's render state and triggers a tmux resize,
    // but before tmux can finish repainting, the next fit() clears it again.
    // This leaves stale content in parts of the terminal that never get
    // repainted. Instead, we only fit once when the drag ends (endHandler).
    const debouncedFit = () => {
      // No-op during drag — fit happens in endHandler only
    };

    const moveHandler = (moveE) => {
      moveE.preventDefault();
      const movePoint = moveE.touches ? moveE.touches[0] : moveE;

      const deltaX = (movePoint.clientX - startX) / state.zoom;
      const deltaY = (movePoint.clientY - startY) / state.zoom;

      let newWidth = Math.max(10, startWidth + deltaX);
      let newHeight = Math.max(10, startHeight + deltaY);

      // Snap resize edges (unless Shift held)
      if (!moveE.shiftKey) {
        const snaps = findResizeSnapTargets(paneData, newWidth, newHeight);
        if (snaps) {
          if (snaps.w) newWidth = snaps.w.snapWidth;
          if (snaps.h) newHeight = snaps.h.snapHeight;
          showSnapGuides({ x: snaps.w, y: snaps.h });
        } else {
          removeSnapGuides();
        }
      } else {
        removeSnapGuides();
      }

      paneEl.style.width = `${newWidth}px`;
      paneEl.style.height = `${newHeight}px`;
      paneData.width = newWidth;
      paneData.height = newHeight;

      // Debounced refit terminal
      debouncedFit();
    };

    const endHandler = () => {
      removeSnapGuides();
      isResizing = false;
      paneEl.classList.remove('resizing');
      paneEl.querySelector('.pane-resize-handle').classList.remove('hold-active');
      document.body.classList.remove('no-select');
      hideIframeOverlays();

      // Final fit after resize ends (only for terminals).
      // This is the ONLY fit that should happen during a resize operation —
      // intermediate fits during drag are disabled to prevent render corruption.
      if (paneData.type === 'terminal') {
        const termInfo = terminals.get(paneData.id);
        if (termInfo) {
          try {
            if (termInfo.safeFitAndSync) termInfo.safeFitAndSync();
            else termInfo.fitAddon.fit();
            // Send resize immediately (include pixel dimensions so agent persists them)
            sendWs('terminal:resize', {
              terminalId: paneData.id,
              cols: termInfo.xterm.cols,
              rows: termInfo.xterm.rows,
              pixelWidth: paneData.width,
              pixelHeight: paneData.height
            }, paneData.agentId);
          } catch (e) {
            // Ignore fit errors
          }
        }
      }

      // Save size to cloud (cloud-only, no agent write)
      cloudSaveLayout(paneData);

      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchend', endHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchend', endHandler);
  }

  // Bring pane to front
  function focusPane(paneData) {

    if (!paneData) {
      console.error('[App] focusPane called with undefined paneData');
      return;
    }
    paneData.zIndex = state.nextZIndex++;
    const paneEl = document.getElementById(`pane-${paneData.id}`);
    if (paneEl) {
      paneEl.style.zIndex = paneData.zIndex;
      // Remove focused class from all other panes
      document.querySelectorAll('.pane.focused').forEach(p => {
        if (p.id !== `pane-${paneData.id}`) {
          p.classList.remove('focused');
        }
      });
      paneEl.classList.add('focused');
      lastFocusedPaneId = paneData.id;

      // Quick View: overlays stay on all panes (no interaction in this mode)
    }
  }

  // Pan canvas to center a pane and focus it
  function panToPane(paneId) {
    const paneData = state.panes.find(p => p.id === paneId);
    if (!paneData) return;

    const paneCenterX = paneData.x + paneData.width / 2;
    const paneCenterY = paneData.y + paneData.height / 2;
    state.panX = window.innerWidth / 2 - paneCenterX * state.zoom;
    state.panY = window.innerHeight / 2 - paneCenterY * state.zoom;
    updateCanvasTransform();
    saveViewState();
    focusPane(paneData);
    focusTerminalInput(paneId);
  }

  // Focus terminal input for keyboard (important for mobile)
  function focusTerminalInput(paneId) {
    // Don't steal focus from external inputs (HUD search, modals, etc.)
    if (isExternalInputFocused()) return;
    const termInfo = terminals.get(paneId);
    if (termInfo && termInfo.xterm) {
      termInfo.xterm.focus();
    }
  }

  // Update canvas transform
  function updateCanvasTransform() {
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  // Quick View: overlay showing pane type, device, path
  function getQuickViewInfo(paneData, paneEl) {
    let type, device, path;

    if (paneData.type === 'terminal') {
      type = 'Terminal';
      device = paneData.device || 'local';
      path = paneData.workingDir || '~';
    } else if (paneData.type === 'file') {
      type = 'File';
      device = paneData.device || 'local';
      path = paneData.filePath || paneData.fileName || 'untitled';
    } else if (paneData.type === 'note') {
      type = 'Note';
      device = 'local';
      path = '';
    } else if (paneData.type === 'git-graph') {
      type = 'Git Graph';
      device = paneData.device || 'local';
      path = paneData.repoPath || '';
    } else if (paneData.type === 'iframe') {
      type = 'Iframe';
      device = paneData.url || '';
      path = '';
    } else if (paneData.type === 'folder') {
      type = 'Folder';
      device = paneData.device || 'local';
      path = paneData.folderPath || '~';
    }

    return { type, device, path };
  }

  function addQuickViewOverlay(paneEl, paneData) {
    if (paneEl.querySelector('.quick-view-overlay')) return;

    const info = getQuickViewInfo(paneData, paneEl);
    const overlay = document.createElement('div');
    overlay.className = 'quick-view-overlay';

    const typeIcons = {
      Terminal: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h16V6H4zm2 2l4 4-4 4 1.5 1.5L9 12l-5.5-5.5L2 8zm6 8h6v2h-6v-2z"/></svg>',
      File: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>',
      Note: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4l2-2 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6zm0 2h12v16h-3l-3-3-3 3H6V4z"/></svg>',
      'Git Graph': `<svg viewBox="0 0 24 24">${ICON_GIT_GRAPH}</svg>`,
      Iframe: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="2"/><line x1="16" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/><path d="M12 3c-2 3-2 6 0 9s2 6 0 9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    };

    // Top-left: device name + path (colored per device)
    const qvColor = getDeviceColor(info.device);
    const qvStyle = qvColor ? ` style="background:${qvColor.bg}; border-color:${qvColor.border}; color:${qvColor.text}"` : '';
    let topLeft = `<div class="quick-view-device"${qvStyle}>${escapeHtml(info.device)}</div>`;
    if (info.path) {
      topLeft += `<div class="quick-view-path">${escapeHtml(info.path)}</div>`;
    }

    // Center: pane type icon
    let center = `<div class="quick-view-type">${typeIcons[info.type] || ''}</div>`;

    // Scale down content proportionally if pane is too small
    // Use paneData dimensions (not offsetWidth which includes canvas zoom)
    const paneW = paneData.width || 400;
    const paneH = paneData.height || 350;
    const scaleX = Math.min(1, paneW / 400);
    const scaleY = Math.min(1, paneH / 350);
    const scale = Math.min(scaleX, scaleY);
    const scaleStyle = scale < 1 ? ` style="transform:scale(${scale});transform-origin:center"` : '';

    overlay.innerHTML = `<div class="quick-view-content"${scaleStyle}>
      <div class="quick-view-top-left">${topLeft}</div>
      <div class="quick-view-center">${center}</div>
    </div>`;

    // Overlay click handler for Quick View interactions
    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isSelected = selectedPaneIds.has(paneData.id);

      if (e.shiftKey && !isSelected) {
        // Shift+Click unselected pane: select it
        togglePaneSelection(paneData.id);
        updateBroadcastIndicator();
        return;
      }

      if (e.shiftKey && isSelected) {
        // Already selected: distinguish click (deselect) vs drag
        const DRAG_THRESHOLD = 5;
        const mouseDownX = e.clientX;
        const mouseDownY = e.clientY;
        let dragging = false;

        // Prepare group drag state up front
        const rect = paneEl.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left) / state.zoom;
        const offsetY = (e.clientY - rect.top) / state.zoom;
        const groupPanes = [];
        selectedPaneIds.forEach(id => {
          const p = state.panes.find(x => x.id === id);
          const el = document.getElementById(`pane-${id}`);
          if (p && el) groupPanes.push({ paneData: p, paneEl: el, startX: p.x, startY: p.y });
        });
        const anchorStartX = paneData.x;
        const anchorStartY = paneData.y;

        const onMove = (moveE) => {
          const dx = moveE.clientX - mouseDownX;
          const dy = moveE.clientY - mouseDownY;

          if (!dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
            // Threshold exceeded — start dragging
            dragging = true;
            isDragging = true;
            document.body.classList.add('no-select');
            groupPanes.forEach(({ paneEl: el }) => el.classList.add('dragging'));
            showIframeOverlays();
          }

          // Move anchor pane
          const newX = (moveE.clientX - state.panX) / state.zoom - offsetX;
          const newY = (moveE.clientY - state.panY) / state.zoom - offsetY;
          paneEl.style.left = `${newX}px`;
          paneEl.style.top = `${newY}px`;
          paneData.x = newX;
          paneData.y = newY;

          // Move rest of group by same delta
          const groupDx = newX - anchorStartX;
          const groupDy = newY - anchorStartY;
          groupPanes.forEach(({ paneData: p, paneEl: el, startX: sx, startY: sy }) => {
            if (p.id === paneData.id) return;
            p.x = sx + groupDx;
            p.y = sy + groupDy;
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
          });
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (dragging) {
            isDragging = false;
            document.body.classList.remove('no-select');
            groupPanes.forEach(({ paneEl: el }) => el.classList.remove('dragging'));
            hideIframeOverlays();
            // Save all positions (cloud-only)
            groupPanes.forEach(({ paneData: p }) => {
              cloudSaveLayout(p);
            });
          } else {
            // Quick click — deselect
            togglePaneSelection(paneData.id);
            updateBroadcastIndicator();
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return;
      }

      // Click without Shift on unselected pane: exit overlay mode, focus
      if (quickViewActive) {
        toggleQuickView();
      } else if (deviceHoverActive) {
        hoveredDeviceName = null;
        clearDeviceHighlight();
      }
      focusPane(paneData);
      focusTerminalInput(paneData.id);
    });

    paneEl.appendChild(overlay);
  }

  function removeQuickViewOverlay(paneEl) {
    const overlay = paneEl.querySelector('.quick-view-overlay');
    if (overlay) overlay.remove();
  }

  function toggleQuickView() {
    quickViewActive = !quickViewActive;

    if (quickViewActive) {
      // Clear any broadcast selection from normal mode
      clearMultiSelect();
      // Overlay ALL panes — no interaction allowed in Quick View
      document.querySelectorAll('.pane').forEach(paneEl => {
        const paneId = paneEl.dataset.paneId;
        const paneData = state.panes.find(p => p.id === paneId);
        if (!paneData) return;
        addQuickViewOverlay(paneEl, paneData);
      });
      // Remove focused state from all panes
      document.querySelectorAll('.pane.focused').forEach(p => p.classList.remove('focused'));
    } else {
      document.querySelectorAll('.quick-view-overlay').forEach(o => o.remove());
      document.querySelectorAll('.pane.qv-hover').forEach(p => p.classList.remove('qv-hover'));
      clearMultiSelect();
    }
  }

  // === Placement Mode ===
  // Placement ghost sizes derived from PANE_DEFAULTS
  const placementSizes = {
    ...PANE_DEFAULTS,
  };

  const placementLabels = {
    'terminal': 'Terminal',
    'file': 'File',
    'note': 'Note',
    'git-graph': 'Git Graph',
    'iframe': 'Web Page',
    'folder': 'Folder'
  };

  // Enter placement mode with all picker data already resolved
  // createFn(placementPos) will be called on click
  function enterPlacementMode(type, createFn) {
    if (moveModeActive) exitMoveMode();
    cancelPlacementMode();

    const size = placementSizes[type];
    const ghost = document.createElement('div');
    ghost.className = 'placement-ghost';
    ghost.style.width = `${size.width * state.zoom}px`;
    ghost.style.height = `${size.height * state.zoom}px`;
    ghost.innerHTML = `<div class="placement-ghost-label">${placementLabels[type]}</div>`;
    document.body.appendChild(ghost);

    placementMode = { type, cursorEl: ghost, createFn };
    canvasContainer.classList.add('placement-active');

    document.addEventListener('mousemove', handlePlacementMouseMove);
    document.addEventListener('keydown', handlePlacementKeyDown);
    document.addEventListener('contextmenu', handlePlacementRightClick);
    canvasContainer.addEventListener('click', handlePlacementClick);
  }

  function cancelPlacementMode() {
    if (!placementMode) return;
    placementMode.cursorEl.remove();
    removeSnapGuides();
    canvasContainer.classList.remove('placement-active');
    document.removeEventListener('mousemove', handlePlacementMouseMove);
    document.removeEventListener('keydown', handlePlacementKeyDown);
    document.removeEventListener('contextmenu', handlePlacementRightClick);
    canvasContainer.removeEventListener('click', handlePlacementClick);
    placementMode = null;
  }

  function handlePlacementMouseMove(e) {
    if (!placementMode) return;
    const size = placementSizes[placementMode.type];

    // Convert cursor to canvas coords (cursor = center of ghost)
    let canvasX = (e.clientX - state.panX) / state.zoom - size.width / 2;
    let canvasY = (e.clientY - state.panY) / state.zoom - size.height / 2;

    // Snap-to-edge (reuse drag snap system)
    const fakePaneData = { id: '__placement__', width: size.width, height: size.height };
    if (!e.ctrlKey) {
      const snaps = findSnapTargets(fakePaneData, canvasX, canvasY, null);
      if (snaps) {
        if (snaps.x) canvasX = snaps.x.adjustX;
        if (snaps.y) canvasY = snaps.y.adjustY;
        showSnapGuides(snaps);
      } else {
        removeSnapGuides();
      }
    } else {
      removeSnapGuides();
    }

    // Store snapped position for click handler
    placementMode.snappedX = canvasX;
    placementMode.snappedY = canvasY;

    // Convert back to screen coords for ghost positioning (update size for current zoom)
    placementMode.cursorEl.style.width = `${size.width * state.zoom}px`;
    placementMode.cursorEl.style.height = `${size.height * state.zoom}px`;
    placementMode.cursorEl.style.left = `${state.panX + canvasX * state.zoom}px`;
    placementMode.cursorEl.style.top = `${state.panY + canvasY * state.zoom}px`;
  }

  function handlePlacementKeyDown(e) {
    if (e.key === 'Escape') {
      cancelPlacementMode();
    }
  }

  function handlePlacementRightClick(e) {
    if (!placementMode) return;
    e.preventDefault();
    cancelPlacementMode();
  }

  function handlePlacementClick(e) {
    if (!placementMode) return;
    // Don't place if clicking on UI elements
    if (e.target.closest('#add-pane-btn, #add-pane-menu, #controls, .pane-menu')) return;

    // Use snapped position from mousemove, fall back to raw conversion
    const size = placementSizes[placementMode.type];
    const canvasX = placementMode.snappedX != null ? placementMode.snappedX + size.width / 2 : (e.clientX - state.panX) / state.zoom;
    const canvasY = placementMode.snappedY != null ? placementMode.snappedY + size.height / 2 : (e.clientY - state.panY) / state.zoom;

    const createFn = placementMode.createFn;
    removeSnapGuides();
    if (e.shiftKey) {
      // Shift+Click: place pane but stay in placement mode for multi-placement
      createFn({ x: canvasX, y: canvasY });
    } else {
      cancelPlacementMode();
      createFn({ x: canvasX, y: canvasY });
    }
  }

  // === Picker-then-Place wrappers ===
  // These run the device/file/repo pickers first, then enter placement mode

  async function showDevicePickerThenPlace() {
    showDevicePickerGeneric(
      (d) => enterPlacementMode('terminal', (pos) => createPane(d.name, pos, d.ip)),
      () => enterPlacementMode('terminal', (pos) => createPane(undefined, pos))
    );
  }

  async function openFileWithDevicePickerThenPlace() {
    showDevicePickerGeneric(
      (d) => showFileBrowser(d.name, '~', null, true, d.ip),
      (e) => alert('Failed to list devices: ' + e.message)
    );
  }

  async function showGitRepoPickerWithDeviceThenPlace() {
    showDevicePickerGeneric(
      (d) => showGitRepoPicker(d.name, null, true, d.ip),
      () => showGitRepoPicker(undefined, null, true)
    );
  }

  async function showFolderPaneDevicePickerThenPlace() {
    showDevicePickerGeneric(
      (d) => showFolderPickerThenPlace(d.ip, d.name),
      () => showFolderPickerThenPlace()
    );
  }

  async function showFolderPickerThenPlace(targetAgentId, device) {
    const deviceLabel = device ? deviceLabelHtml(device, 'font-size:11px; padding:2px 8px;') : '';
    const headerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" style="color:rgba(255,255,255,0.6);">${ICON_FOLDER}</svg>
      ${deviceLabel}
      <span style="color:rgba(255,255,255,0.7); font-size:13px; font-weight:500;">Choose Folder</span>`;

    showFolderScanPicker({
      id: 'folder-pane-browser',
      headerHTML,
      scanLabel: 'Open this folder as a pane',
      device,
      targetAgentId,
      onScan: async (folderPath, contentArea, closeBrowser, navigateFolder, navRefresh) => {
        closeBrowser();
        enterPlacementMode('folder', (pos) => createFolderPane(folderPath, pos, targetAgentId, device));
      }
    });
  }

  function setupAddPaneMenu() {
    const addBtn = document.getElementById('add-pane-btn');
    const addMenu = document.getElementById('add-pane-menu');

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Cross-close: hide tutorial menu
      const tutMenu = document.getElementById('tutorial-menu');
      if (tutMenu) tutMenu.classList.add('hidden');
      addMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!addMenu.contains(e.target) && e.target !== addBtn) {
        addMenu.classList.add('hidden');
      }
    });

    function triggerMenuItem(type) {
      addMenu.classList.add('hidden');
      if (type === 'terminal') {
        showDevicePickerThenPlace();
      } else if (type === 'file') {
        openFileWithDevicePickerThenPlace();
      } else if (type === 'note') {
        enterPlacementMode('note', (pos) => createNotePane(pos));
      } else if (type === 'git-graph') {
        showGitRepoPickerWithDeviceThenPlace();
      } else if (type === 'iframe') {
        enterPlacementMode('iframe', (pos) => createIframePane(pos));
      } else if (type === 'folder') {
        showFolderPaneDevicePickerThenPlace();
      } else if (type === 'todo') {
        createTodoPane();
      }
    }

    addMenu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', async () => {
        triggerMenuItem(item.dataset.type);
      });
    });

    // Keyboard navigation: letter shortcuts when add menu is visible
    document.addEventListener('keydown', (e) => {
      if (addMenu.classList.contains('hidden')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        e.preventDefault();
        addMenu.classList.add('hidden');
        return;
      }
      const match = addMenu.querySelector(`.menu-item[data-shortcut="${key}"]`);
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        triggerMenuItem(match.dataset.type);
      }
    }, true);
  }

  function setupTutorialMenu() {
    const tutorialBtn = document.getElementById('tutorial-btn');
    const tutorialMenu = document.getElementById('tutorial-menu');
    if (!tutorialBtn || !tutorialMenu) return;

    // Fill version display if available
    const menuVersion = document.getElementById('menu-version');
    if (menuVersion && window.__VERSION__) menuVersion.textContent = 'v' + window.__VERSION__;

    function updateCompletionIndicators() {
      tutorialMenu.querySelectorAll('.tutorial-menu-item:not(.disabled)').forEach(item => {
        const key = item.dataset.tutorial;
        if (tutorialsCompleted[key]) {
          item.classList.add('completed');
        } else {
          item.classList.remove('completed');
        }
      });
    }

    tutorialBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Cross-close: hide add-pane menu
      const addMenu = document.getElementById('add-pane-menu');
      if (addMenu) addMenu.classList.add('hidden');

      updateCompletionIndicators();
      tutorialMenu.classList.toggle('hidden');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!tutorialMenu.contains(e.target) && e.target !== tutorialBtn) {
        tutorialMenu.classList.add('hidden');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !tutorialMenu.classList.contains('hidden')) {
        tutorialMenu.classList.add('hidden');
      }
    });

    // Click handler for menu items
    tutorialMenu.querySelectorAll('.tutorial-menu-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        tutorialMenu.classList.add('hidden');
        const key = item.dataset.tutorial;
        if (key === 'getting-started') {
          window.location.href = '/tutorial';
        } else if (key === 'panes') {
          window.location.href = '/tutorial?guide=panes';
        }
      });
    });
  }

  function setupToolbarButtons() {
    document.getElementById('settings-btn').addEventListener('click', () => showSettingsModal());

    setupTutorialMenu();

    // Fullscreen toggle
    const fsBtn = document.getElementById('fullscreen-toggle');
    if (fsBtn) {
      function updateFullscreenIcon() {
        const isFS = !!document.fullscreenElement;
        fsBtn.querySelector('.icon-fullscreen-enter').style.display = isFS ? 'none' : '';
        fsBtn.querySelector('.icon-fullscreen-exit').style.display = isFS ? '' : 'none';
      }
      fsBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      });
      document.addEventListener('fullscreenchange', updateFullscreenIcon);
    }

    document.getElementById('zoom-in').addEventListener('click', () => {
      setZoom(state.zoom * 1.2, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      setZoom(state.zoom / 1.2, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('minimap-expand').addEventListener('click', () => {
      toggleMinimapCollapsed(false);
    });

  }

  function setupCustomTooltips() {
    const tip = document.createElement('div');
    tip.id = 'custom-tooltip';
    document.body.appendChild(tip);

    let showTimer = null;
    let currentTarget = null;

    function positionTooltip(target) {
      const rect = target.getBoundingClientRect();
      tip.textContent = target.getAttribute('data-tooltip');
      // Temporarily show off-screen to measure
      tip.style.left = '-9999px';
      tip.style.top = '-9999px';
      tip.classList.add('visible');
      const tipRect = tip.getBoundingClientRect();
      const gap = 8;
      let top = rect.top - tipRect.height - gap;
      let left = rect.left + (rect.width - tipRect.width) / 2;
      // Flip below if too close to top
      if (top < 4) top = rect.bottom + gap;
      // Clamp horizontal
      if (left < 4) left = 4;
      if (left + tipRect.width > window.innerWidth - 4) left = window.innerWidth - tipRect.width - 4;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function showTooltip(target) {
      currentTarget = target;
      positionTooltip(target);
    }

    function hideTooltip() {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      tip.classList.remove('visible');
      currentTarget = null;
    }

    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target || target === currentTarget) return;
      hideTooltip();
      showTimer = setTimeout(() => showTooltip(target), 300);
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;
      // Only hide if we're leaving the tooltip target (not entering a child)
      if (!target.contains(e.relatedTarget)) hideTooltip();
    });

    // Hide on scroll or click
    document.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('mousedown', hideTooltip);
  }

  function setupCanvasInteraction() {
    canvasContainer.addEventListener('mousedown', handleCanvasPanStart);
    canvasContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvasContainer.addEventListener('wheel', handleWheel, { passive: false });
    // Capture-phase: intercept Ctrl+Scroll before any pane handler can stopPropagation
    canvasContainer.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(state.zoom * delta, e.clientX, e.clientY);
      }
    }, { passive: false, capture: true });
    canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault());

    // Middle mouse button: force canvas pan even over panes (capture phase)
    canvasContainer.addEventListener('mousedown', handleMiddleMousePan, true);

    // Right mouse button: force canvas pan even over panes (capture phase)
    canvasContainer.addEventListener('mousedown', handleRightMousePan, true);

    // Disable middle mouse button paste entirely (Linux X11 primary selection)
    document.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    }, true);
  }

  function setupPasteHandlers() {
    let lastMouseX = 0, lastMouseY = 0;
    document.addEventListener('mousemove', (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    // Track Ctrl+V vs Ctrl+Shift+V when unfocused, so the paste handler knows
    // whether to create a note or route to the last focused terminal.
    let unfocusedPasteMode = null; // 'note' | 'terminal' | null
    document.addEventListener('keydown', (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) return;
      unfocusedPasteMode = null;
      if (isExternalInputFocused()) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.closest('.pane')) return;
      if (document.querySelector('.pane.focused')) return;
      unfocusedPasteMode = e.shiftKey ? 'terminal' : 'note';
    });

    // Count total images across all note panes for limit checking
    function countTotalNoteImages() {
      return state.panes
        .filter(p => p.type === 'note' && p.images)
        .reduce((sum, p) => sum + p.images.length, 0);
    }

    // Check if adding N images would exceed the tier limit
    function checkNoteImageLimit(count) {
      const tier = window.__tcTier;
      if (!tier || !tier.limits || tier.limits.noteImages === undefined) return true;
      if (tier.limits.noteImages === null || tier.limits.noteImages === Infinity) return true;
      const current = countTotalNoteImages();
      if (current + count > tier.limits.noteImages) {
        showUpgradePrompt(
          `Your ${(tier.tier || 'free').charAt(0).toUpperCase() + (tier.tier || 'free').slice(1)} plan allows ${tier.limits.noteImages} images across all notes. You have ${current}. Upgrade for more.`
        );
        return false;
      }
      return true;
    }

    document.addEventListener('paste', (e) => {
      const text = e.clipboardData && e.clipboardData.getData('text');

      // Extract image files from clipboard
      function getClipboardImages(clipboardData) {
        const images = [];
        if (!clipboardData || !clipboardData.items) return images;
        for (const item of clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) images.push(file);
          }
        }
        return images;
      }

      if (unfocusedPasteMode === 'note') {
        unfocusedPasteMode = null;
        const imageFiles = getClipboardImages(e.clipboardData);
        if (!text && imageFiles.length === 0) return;
        e.preventDefault();
        const cursorCanvasPos = {
          x: (lastMouseX - state.panX) / state.zoom,
          y: (lastMouseY - state.panY) / state.zoom
        };
        if (imageFiles.length > 0) {
          if (!checkNoteImageLimit(imageFiles.length)) return;
          // Read images as data URLs then create the note pane
          Promise.all(imageFiles.map(file => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }))).then(dataUrls => {
            const validUrls = dataUrls.filter(Boolean);
            createNotePane(cursorCanvasPos, text || '', validUrls);
          });
        } else {
          createNotePane(cursorCanvasPos, text);
        }
        return;
      }

      if (unfocusedPasteMode === 'terminal') {
        unfocusedPasteMode = null;
        if (!text || !lastFocusedPaneId) return;
        const paneData = state.panes.find(p => p.id === lastFocusedPaneId);
        if (!paneData || paneData.type !== 'terminal') return;
        e.preventDefault();
        const encoded = btoa(unescape(encodeURIComponent(text)));
        if (selectedPaneIds.size > 1) {
          for (const selectedId of selectedPaneIds) {
            const sp = state.panes.find(x => x.id === selectedId);
            if (sp && sp.type === 'terminal') {
              sendWs('terminal:input', { terminalId: selectedId, data: encoded });
            }
          }
        } else {
          sendWs('terminal:input', { terminalId: paneData.id, data: encoded });
        }
        return;
      }

      // Backup: focused terminal pane where xterm's native paste didn't fire onData
      unfocusedPasteMode = null;
      const focusedPane = document.querySelector('.pane.focused');
      if (!focusedPane) return;
      const paneId = focusedPane.dataset.paneId;
      const paneData = state.panes.find(p => p.id === paneId);
      if (!paneData || paneData.type !== 'terminal') return;
      if (!text) return;
      e.preventDefault();
      const encoded = btoa(unescape(encodeURIComponent(text)));
      if (selectedPaneIds.size > 1) {
        for (const selectedId of selectedPaneIds) {
          const sp = state.panes.find(x => x.id === selectedId);
          if (sp && sp.type === 'terminal') {
            sendWs('terminal:input', { terminalId: selectedId, data: encoded });
          }
        }
      } else {
        sendWs('terminal:input', { terminalId: paneData.id, data: encoded });
      }
    });
  }

  // Build a priority-sorted list of terminal panes for Tab cycling.
  // Priority: permission/question/inputNeeded (highest) → other notifications → all terminals.
  // Within each group, earliest notification first (by toast DOM order), then pane array order.
  function getTabCycleOrder() {
    const terminals = state.panes.filter(p => p.type === 'terminal');
    if (terminals.length === 0) return [];

    const medium = []; // active toasts
    const rest = [];   // everything else

    for (const pane of terminals) {
      if (activeToasts.has(pane.id)) {
        medium.push(pane);
      } else {
        rest.push(pane);
      }
    }

    return [...medium, ...rest];
  }

  // Move Mode: find the nearest pane in a direction using angular cone search
  function findPaneInDirection(fromPaneId, direction) {
    const from = state.panes.find(p => p.id === fromPaneId);
    if (!from) return null;

    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;

    // Direction angles (in radians, 0 = right, counter-clockwise)
    // Note: canvas Y increases downward, so "up" is negative Y
    const dirAngles = {
      w: -Math.PI / 2,  // up
      a: Math.PI,        // left
      s: Math.PI / 2,    // down
      d: 0               // right
    };

    const targetAngle = dirAngles[direction];
    if (targetAngle === undefined) return null;

    function searchCone(halfAngle) {
      let best = null;
      let bestDist = Infinity;

      for (const p of state.panes) {
        if (p.id === fromPaneId) continue;
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const dx = cx - fromCx;
        const dy = cy - fromCy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue; // skip overlapping

        const angle = Math.atan2(dy, dx);
        // Angular difference (normalized to [-PI, PI])
        let diff = angle - targetAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        if (Math.abs(diff) <= halfAngle && dist < bestDist) {
          best = p;
          bestDist = dist;
        }
      }
      return best;
    }

    // Try 90-degree cone first (45 degrees each side)
    let result = searchCone(Math.PI / 4);
    // Fallback: widen to 150-degree cone (75 degrees each side)
    if (!result) result = searchCone((75 * Math.PI) / 180);
    return result;
  }

  // Calculate zoom level to fit a pane at ~70% of viewport
  function calcMoveModeZoom(paneData) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return Math.min(
      (vw * 0.7) / paneData.width,
      (vh * 0.7) / paneData.height
    );
  }

  function enterMoveMode() {
    if (moveModeActive) return;
    moveModeActive = true;
    // Hide cursor and kill pointer-events on panes — prevents hover focus stealing
    document.body.classList.add('cursor-suppressed');
    // Clear all focused outlines — move mode has its own visual system
    document.querySelectorAll('.pane.focused').forEach(p => p.classList.remove('focused'));
    moveModeOriginalZoom = state.zoom;

    // Determine starting pane: last focused, or nearest to screen center
    let startPane = lastFocusedPaneId && state.panes.find(p => p.id === lastFocusedPaneId);
    if (!startPane && state.panes.length > 0) {
      const vcx = (window.innerWidth / 2 - state.panX) / state.zoom;
      const vcy = (window.innerHeight / 2 - state.panY) / state.zoom;
      let bestDist = Infinity;
      for (const p of state.panes) {
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const d = Math.sqrt((cx - vcx) ** 2 + (cy - vcy) ** 2);
        if (d < bestDist) { bestDist = d; startPane = p; }
      }
    }
    if (!startPane) { moveModeActive = false; return; }

    moveModePaneId = startPane.id;

    // Zoom to fit starting pane at ~70% of viewport
    const targetZoom = calcMoveModeZoom(startPane);
    state.zoom = targetZoom;
    const paneCenterX = startPane.x + startPane.width / 2;
    const paneCenterY = startPane.y + startPane.height / 2;
    state.panX = window.innerWidth / 2 - paneCenterX * state.zoom;
    state.panY = window.innerHeight / 2 - paneCenterY * state.zoom;

    // Animate the transition
    canvas.style.transition = 'transform 100ms ease';
    updateCanvasTransform();
    setTimeout(() => { canvas.style.transition = ''; }, 120);

    // Blur ALL terminals so no xterm holds focus during move mode
    terminals.forEach(({ xterm }) => { if (xterm) xterm.blur(); });

    // Apply visual classes
    applyMoveModeVisuals();

    // Add indicator (same style as broadcast/mention indicators)
    let indicator = document.getElementById('move-mode-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'move-mode-indicator';
      indicator.className = 'move-mode-indicator';
      document.body.appendChild(indicator);
    }
    indicator.innerHTML = `<span class="move-mode-indicator-icon">⇄</span> MOVE — WASD to navigate, Enter to select, Esc to cancel`;
    indicator.style.display = 'flex';
  }

  function exitMoveMode(confirm = true) {
    if (!moveModeActive) return;
    moveModeActive = false;

    // Esc (cancel): restore original zoom, centered on current pane
    if (!confirm) {
      state.zoom = moveModeOriginalZoom;
      if (moveModePaneId) {
        const pd = state.panes.find(p => p.id === moveModePaneId);
        if (pd) {
          const cx = pd.x + pd.width / 2;
          const cy = pd.y + pd.height / 2;
          state.panX = window.innerWidth / 2 - cx * state.zoom;
          state.panY = window.innerHeight / 2 - cy * state.zoom;
        }
      }
    }
    // Enter/Tab (confirm): keep current zoom and pan as-is

    // Animate transition
    canvas.style.transition = 'transform 100ms ease';
    updateCanvasTransform();
    setTimeout(() => { canvas.style.transition = ''; }, 120);

    // Remove visual classes and overlays
    document.querySelectorAll('.pane.move-mode-active').forEach(p => p.classList.remove('move-mode-active'));
    document.querySelectorAll('.pane.move-mode-dimmed').forEach(p => p.classList.remove('move-mode-dimmed'));
    document.querySelectorAll('.pane .pane-hover-overlay').forEach(o => o.remove());

    // Hide indicator
    const indicator = document.getElementById('move-mode-indicator');
    if (indicator) indicator.style.display = 'none';

    // Blur ALL terminals to ensure clean slate — prevents stale xterm focus
    terminals.forEach(({ xterm }) => { if (xterm) xterm.blur(); });

    // Focus the highlighted pane (delay terminal focus so browser settles DOM changes)
    if (moveModePaneId) {
      const paneData = state.panes.find(p => p.id === moveModePaneId);
      const focusPaneId = moveModePaneId;
      if (paneData) {
        focusPane(paneData);
        setTimeout(() => { focusTerminalInput(focusPaneId); }, 50);
      }
    }
    moveModePaneId = null;
    saveViewState();

    // Keep cursor/pointer suppressed until actual mouse movement
    // (prevents browser-fired mouseenter from stealing focus when overlays are removed)
    const reEnableMouse = () => {
      document.body.classList.remove('cursor-suppressed');
      document.removeEventListener('mousemove', reEnableMouse);
    };
    document.addEventListener('mousemove', reEnableMouse);
  }

  function applyMoveModeVisuals() {
    document.querySelectorAll('.pane.move-mode-active').forEach(p => p.classList.remove('move-mode-active'));
    document.querySelectorAll('.pane.move-mode-dimmed').forEach(p => p.classList.remove('move-mode-dimmed'));
    document.querySelectorAll('.pane .pane-hover-overlay').forEach(o => o.remove());

    document.querySelectorAll('.pane').forEach(paneEl => {
      const id = paneEl.dataset.paneId || paneEl.id.replace('pane-', '');
      if (id === moveModePaneId) {
        paneEl.classList.add('move-mode-active');
      } else {
        paneEl.classList.add('move-mode-dimmed');
      }
    });
  }

  function moveModeNavigate(direction) {
    if (!moveModeActive || !moveModePaneId) return;
    const target = findPaneInDirection(moveModePaneId, direction);
    if (!target) return;

    moveModePaneId = target.id;

    // Zoom to fit target pane at ~70% viewport and center
    const targetZoom = calcMoveModeZoom(target);
    state.zoom = targetZoom;
    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    state.panX = window.innerWidth / 2 - cx * state.zoom;
    state.panY = window.innerHeight / 2 - cy * state.zoom;

    canvas.style.transition = 'transform 100ms ease';
    updateCanvasTransform();
    setTimeout(() => { canvas.style.transition = ''; }, 120);

    // Re-blur terminal so keys stay in move mode
    const termInfo = terminals.get(target.id);
    if (termInfo && termInfo.xterm) termInfo.xterm.blur();

    applyMoveModeVisuals();
  }

  function setupKeyboardShortcuts() {
    // Track IME composition state to prevent focus loss during Chinese/Japanese/Korean input
    document.addEventListener('compositionstart', () => { isComposing = true; });
    document.addEventListener('compositionend', () => { isComposing = false; });

    // Tab+key chords: hold Tab, press key for shortcuts (Q=cycle, A=add, D=fleet, etc.)
    // Double-tap Tab (outside terminal): enter move mode (WASD pane navigation).
    // Tab inside terminal: passes through to terminal as normal.
    // Uses capture phase so keys are intercepted before xterm processes them.
    let tabHeld = false;
    let tabChordUsed = false;
    let tabPressedInTerminal = false;

    document.addEventListener('keydown', (e) => {
      // Move mode: intercept all keys. Tab gets preventDefault but flows to keyup for exit.
      if (moveModeActive) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Tab') return; // keyup handler will call exitMoveMode
        // Map WASD and arrow keys to directions
        const arrowMap = { ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' };
        const dir = arrowMap[e.key] || e.key.toLowerCase();
        if ((dir === 'w' || dir === 'a' || dir === 's' || dir === 'd') && !e.repeat) {
          moveModeNavigate(dir);
        } else if (e.key === 'Enter') {
          exitMoveMode(true);   // confirm: keep zoom
        } else if (e.key === 'Escape') {
          exitMoveMode(false);  // cancel: restore zoom
        }
        return;
      }

      if (e.key === 'Tab' && !e.repeat) {
        tabHeld = true;
        tabChordUsed = false;
        // Detect if a terminal pane currently has focus
        const active = document.activeElement;
        const paneEl = active && active.closest('.pane');
        const paneId = paneEl && paneEl.id.replace('pane-', '');
        const paneData = paneId && state.panes.find(p => p.id === paneId);
        tabPressedInTerminal = !!(paneData && paneData.type === 'terminal');
        // Always prevent default Tab (browser tab-cycling and terminal tab insertion)
        if (!isExternalInputFocused()) {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'q' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();

        const order = getTabCycleOrder();
        if (order.length === 0) return;

        const currentIdx = order.findIndex(p => p.id === lastFocusedPaneId);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % order.length;
        panToPane(order[nextIdx].id);
        return;
      }
      if (e.key === 'a' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        const addMenu = document.getElementById('add-pane-menu');
        addMenu.classList.toggle('hidden');
        return;
      }
      // Tab+D: toggle fleet (machines) pane collapse/expand
      if (e.key === 'd' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        if (hudHidden) {
          // From dot mode: unhide HUD, show only machines pane expanded
          hudHidden = false;
          fleetPaneHidden = false;
          hudExpanded = true;
          const container = document.getElementById('hud-container');
          const dot = document.getElementById('hud-restore-dot');
          if (container) container.style.display = '';
          if (dot) dot.style.display = 'none';
          applyNoHudMode(false);
          applyPaneVisibility();
          const hudEl = document.getElementById('hud-overlay');
          if (hudEl) hudEl.classList.remove('collapsed');
          savePrefsToCloud({ hudState: { fleet_expanded: hudExpanded, hud_hidden: hudHidden } });
          restartHudPolling();
          renderHud();
        } else if (fleetPaneHidden) {
          // Show this pane (expanded)
          fleetPaneHidden = false;
          hudExpanded = true;
          applyPaneVisibility();
          const hudEl = document.getElementById('hud-overlay');
          if (hudEl) hudEl.classList.remove('collapsed');
          savePrefsToCloud({ hudState: { fleet_expanded: hudExpanded } });
          restartHudPolling();
          renderHud();
        } else {
          // Normal mode: all panes visible, toggle collapsed/expanded as before
          const hudEl = document.getElementById('hud-overlay');
          if (hudEl) {
            hudExpanded = !hudExpanded;
            hudEl.classList.toggle('collapsed', !hudExpanded);
            savePrefsToCloud({ hudState: { fleet_expanded: hudExpanded } });
            restartHudPolling();
            renderHud();
          }
        }
        return;
      }
      // Tab+H: toggle hide/show all HUD panes
      if (e.key === 'h' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        toggleHudHidden();
        return;
      }

      // Tab+S: open settings modal
      if (e.key === 's' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        showSettingsModal();
        return;
      }
      // Tab+W: close focused pane (or all broadcasted if in broadcast mode)
      if (e.key === 'w' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        if (selectedPaneIds.size > 1) {
          // Broadcast mode: close all selected panes
          const idsToClose = Array.from(selectedPaneIds);
          clearMultiSelect();
          for (const id of idsToClose) {
            deletePane(id);
          }
        } else {
          // Single mode: close focused pane (fallback to DOM query if lastFocusedPaneId is stale)
          const targetId = lastFocusedPaneId || (document.querySelector('.pane.focused')?.dataset?.paneId);
          if (targetId) deletePane(targetId);
        }
        return;
      }
      // Tab+M: toggle minimap
      if (e.key === 'm' && tabHeld) {
        tabChordUsed = true;
        e.preventDefault();
        e.stopPropagation();
        minimapEnabled = !minimapEnabled;
        if (!minimapEnabled) {
          hideMinimap();
        } else {
          startMinimapLoop();
        }
        return;
      }
      // Tab+1..9: jump to pane with that shortcut number
      if (tabHeld && e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        const targetPane = state.panes.find(p => p.shortcutNumber === num);
        if (targetPane) {
          tabChordUsed = true;
          e.preventDefault();
          e.stopPropagation();
          jumpToPane(targetPane);
        }
        return;
      }
    }, true); // capture phase

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Tab') {
        const wasChord = tabChordUsed;
        const wasInTerminal = tabPressedInTerminal;
        tabHeld = false;
        tabChordUsed = false;
        tabPressedInTerminal = false;

        if (wasChord || isExternalInputFocused()) {
          lastTabUpTime = 0;
          return;
        }

        // Move mode: Tab exits move mode
        if (moveModeActive) {
          exitMoveMode(true);  // Tab = confirm (keep zoom)
          lastTabUpTime = 0;
          return;
        }

        // Double-tap detection
        const now = Date.now();
        if (now - lastTabUpTime < 300) {
          lastTabUpTime = 0;
          enterMoveMode();
          return;
        }
        lastTabUpTime = now;
        // Solo Tab (first tap): no-op, just records timestamp for double-tap detection
      }
    }, true);

    window.addEventListener('blur', () => { tabHeld = false; tabChordUsed = false; tabPressedInTerminal = false; if (moveModeActive) exitMoveMode(false); });

    // Escape: exit mention mode or clear broadcast selection
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (selectedPaneIds.size > 0) {
          clearMultiSelect();
        }
      }
    });

    // Non-Shift click outside broadcast panes clears selection
    document.addEventListener('mousedown', (e) => {
      if (e.shiftKey) return;
      if (selectedPaneIds.size === 0) return;
      // Don't clear if clicking inside a broadcast-selected pane
      if (isInsideBroadcastPane(e.target)) return;
      clearMultiSelect();
    });

    // Ctrl/Cmd +/-/0 : pane zoom if focused, canvas zoom otherwise
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const isPlus = e.key === '=' || e.key === '+';
      const isMinus = e.key === '-';
      const isReset = e.key === '0';
      if (!isPlus && !isMinus && !isReset) return;

      e.preventDefault();

      if (isReset) {
        const focusedPaneEl = document.querySelector('.pane.focused');
        if (focusedPaneEl) {
          const paneId = focusedPaneEl.dataset.paneId;
          const paneData = state.panes.find(p => p.id === paneId);
          if (!paneData) return;
          paneData.zoomLevel = 100;
          applyPaneZoom(paneData, focusedPaneEl);
          cloudSaveLayout(paneData);
        } else {
          setZoom(1, window.innerWidth / 2, window.innerHeight / 2);
        }
        return;
      }

      const focusedPaneEl = document.querySelector('.pane.focused');
      if (focusedPaneEl) {
        const paneId = focusedPaneEl.dataset.paneId;
        const paneData = state.panes.find(p => p.id === paneId);
        if (!paneData) return;

        if (!paneData.zoomLevel) paneData.zoomLevel = 100;
        paneData.zoomLevel = isPlus
          ? Math.min(500, paneData.zoomLevel + 10)
          : Math.max(20, paneData.zoomLevel - 10);
        applyPaneZoom(paneData, focusedPaneEl);
        cloudSaveLayout(paneData);
      } else {
        const factor = isPlus ? 1.2 : 1 / 1.2;
        setZoom(state.zoom * factor, window.innerWidth / 2, window.innerHeight / 2);
      }
    });

    // Ctrl/Cmd+S: save focused file pane; Ctrl/Cmd+W: close focused pane
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key !== 's' && e.key !== 'w') return;

      const focusedPaneEl = document.querySelector('.pane.focused');
      if (!focusedPaneEl) return;

      const paneId = focusedPaneEl.dataset.paneId;
      const paneData = state.panes.find(p => p.id === paneId);
      if (!paneData) return;

      if (e.key === 's' && paneData.type === 'file') {
        e.preventDefault();
        const saveBtn = focusedPaneEl.querySelector('.save-btn');
        if (saveBtn) saveBtn.click();
      } else if (e.key === 'w') {
        e.preventDefault();
        deletePane(paneId);
      }
    });

    // Auto-refocus last pane when typing with nothing focused
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isExternalInputFocused()) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.closest('.pane')) return;
      if (document.querySelector('.pane.focused')) return;
      if (!lastFocusedPaneId) return;
      const paneData = state.panes.find(p => p.id === lastFocusedPaneId);
      if (!paneData) return;

      e.preventDefault();
      e.stopPropagation();

      focusPane(paneData);
      if (paneData.type === 'terminal') {
        focusTerminalInput(paneData.id);
      } else if (paneData.type === 'note') {
        const paneEl = document.getElementById(`pane-${paneData.id}`);
        const noteEditor = paneEl?.querySelector('.note-editor');
        if (noteEditor) noteEditor.focus();
      } else if (paneData.type === 'file') {
        const edInfo = fileEditors.get(paneData.id);
        if (edInfo?.monacoEditor) edInfo.monacoEditor.focus();
      }
    });
  }

  function setupEventListeners() {
    setupAddPaneMenu();
    setupToolbarButtons();
    setupCustomTooltips();
    setupCanvasInteraction();
    setupPasteHandlers();
    setupKeyboardShortcuts();
  }

  // Handle canvas pan start (mouse)
  function handleCanvasPanStart(e) {
    if (placementMode) return;
    if (e.target !== canvas && e.target !== canvasContainer) return;

    // Shift+drag on empty canvas: selection rectangle for broadcast
    if (e.shiftKey) {
      startSelectionRect(e);
      return;
    }

    isPanning = true;
    panStartX = e.clientX - state.panX;
    panStartY = e.clientY - state.panY;
    showIframeOverlays();

    const moveHandler = (moveE) => {
      if (!isPanning) return;
      state.panX = moveE.clientX - panStartX;
      state.panY = moveE.clientY - panStartY;
      updateCanvasTransform();
    };

    const endHandler = () => {
      isPanning = false;
      hideIframeOverlays();
      saveViewState();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
  }

  function startSelectionRect(e) {
    const selRect = document.getElementById('selection-rect');
    if (!selRect) return;

    // Convert client coords to canvas coords (account for pan and zoom)
    const startCanvasX = (e.clientX - state.panX) / state.zoom;
    const startCanvasY = (e.clientY - state.panY) / state.zoom;

    selRect.style.left = startCanvasX + 'px';
    selRect.style.top = startCanvasY + 'px';
    selRect.style.width = '0px';
    selRect.style.height = '0px';
    selRect.style.display = 'block';

    showIframeOverlays();

    const moveHandler = (moveE) => {
      const curCanvasX = (moveE.clientX - state.panX) / state.zoom;
      const curCanvasY = (moveE.clientY - state.panY) / state.zoom;

      const x = Math.min(startCanvasX, curCanvasX);
      const y = Math.min(startCanvasY, curCanvasY);
      const w = Math.abs(curCanvasX - startCanvasX);
      const h = Math.abs(curCanvasY - startCanvasY);

      selRect.style.left = x + 'px';
      selRect.style.top = y + 'px';
      selRect.style.width = w + 'px';
      selRect.style.height = h + 'px';
    };

    const endHandler = () => {
      selRect.style.display = 'none';
      hideIframeOverlays();

      // Get the final rectangle bounds in canvas coords
      const rx = parseFloat(selRect.style.left);
      const ry = parseFloat(selRect.style.top);
      const rw = parseFloat(selRect.style.width);
      const rh = parseFloat(selRect.style.height);

      // Only select if the user actually dragged (not just a shift+click on canvas)
      if (rw > 5 || rh > 5) {
        // Find all panes that overlap the selection rectangle
        state.panes.forEach(p => {
          const overlaps =
            p.x < rx + rw &&
            p.x + p.width > rx &&
            p.y < ry + rh &&
            p.y + p.height > ry;

          if (overlaps && !selectedPaneIds.has(p.id)) {
            selectedPaneIds.add(p.id);
            const el = document.getElementById(`pane-${p.id}`);
            if (el) el.classList.add('broadcast-selected');
          }
        });
        updateBroadcastIndicator();
      }

      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
  }

  // Middle mouse button pan — works even over panes
  function handleMiddleMousePan(e) {
    if (e.button !== 1) return; // only middle mouse
    e.preventDefault();  // prevent browser auto-scroll
    e.stopPropagation(); // prevent pane drag/focus handlers

    isPanning = true;
    panStartX = e.clientX - state.panX;
    panStartY = e.clientY - state.panY;
    document.body.style.cursor = 'grabbing';
    canvasContainer.classList.add('middle-panning');
    showIframeOverlays();

    const moveHandler = (moveE) => {
      if (!isPanning) return;
      moveE.preventDefault();
      state.panX = moveE.clientX - panStartX;
      state.panY = moveE.clientY - panStartY;
      updateCanvasTransform();
    };

    const endHandler = (upE) => {
      if (upE.button !== 1) return; // only release on middle mouse up
      isPanning = false;
      document.body.style.cursor = '';
      canvasContainer.classList.remove('middle-panning');
      hideIframeOverlays();
      saveViewState();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
  }

  // Right mouse button pan — works even over panes (terminals, editors, etc.)
  function handleRightMousePan(e) {
    if (e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();

    isPanning = true;
    let didMove = false;
    panStartX = e.clientX - state.panX;
    panStartY = e.clientY - state.panY;
    document.body.style.cursor = 'grabbing';
    showIframeOverlays();

    // Suppress context menu while dragging
    const suppressContextMenu = (ce) => { ce.preventDefault(); };
    document.addEventListener('contextmenu', suppressContextMenu, true);

    const moveHandler = (moveE) => {
      if (!isPanning) return;
      moveE.preventDefault();
      didMove = true;
      state.panX = moveE.clientX - panStartX;
      state.panY = moveE.clientY - panStartY;
      updateCanvasTransform();
    };

    const endHandler = (upE) => {
      if (upE.button !== 2) return;
      isPanning = false;
      document.body.style.cursor = '';
      hideIframeOverlays();
      saveViewState();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', endHandler);
      // Remove context menu suppression after a tick (so the mouseup's contextmenu is still caught)
      setTimeout(() => {
        document.removeEventListener('contextmenu', suppressContextMenu, true);
      }, 0);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
  }

  // Handle touch start for pan/pinch
  function handleTouchStart(e) {
    if (e.target !== canvas && e.target !== canvasContainer) return;

    if (e.touches.length === 1) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.touches[0].clientX - state.panX;
      panStartY = e.touches[0].clientY - state.panY;
      lastPanX = state.panX;
      lastPanY = state.panY;
      showIframeOverlays();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      isPanning = false;
      initialPinchDistance = getPinchDistance(e.touches);
      initialZoom = state.zoom;
    }

    const moveHandler = (moveE) => {
      if (moveE.touches.length === 1 && isPanning) {
        moveE.preventDefault();
        state.panX = moveE.touches[0].clientX - panStartX;
        state.panY = moveE.touches[0].clientY - panStartY;
        updateCanvasTransform();
      } else if (moveE.touches.length === 2) {
        moveE.preventDefault();
        const currentDistance = getPinchDistance(moveE.touches);
        const scale = currentDistance / initialPinchDistance;
        const newZoom = Math.max(0.05, Math.min(4, initialZoom * scale));

        const centerX = (moveE.touches[0].clientX + moveE.touches[1].clientX) / 2;
        const centerY = (moveE.touches[0].clientY + moveE.touches[1].clientY) / 2;

        setZoom(newZoom, centerX, centerY);
      }
    };

    const endHandler = () => {
      isPanning = false;
      hideIframeOverlays();
      saveViewState();
      canvasContainer.removeEventListener('touchmove', moveHandler);
      canvasContainer.removeEventListener('touchend', endHandler);
    };

    canvasContainer.addEventListener('touchmove', moveHandler, { passive: false });
    canvasContainer.addEventListener('touchend', endHandler);
  }

  // Get distance between two touch points
  function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Scroll target lock: once a scroll gesture starts on a pane (or canvas),
  // keep routing to that target until the gesture ends.
  // Touchpad gestures produce small frequent deltas with momentum/inertia gaps,
  // so use a longer lock (500ms) to cover the full gesture including inertia.
  let scrollLockTarget = null; // 'pane' or 'canvas' or null
  let scrollLockTimer = null;

  function handleWheel(e) {
    // Ctrl+Scroll anywhere = always canvas zoom
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(state.zoom * delta, e.clientX, e.clientY);
      return;
    }

    // Check if mouse is currently over a pane
    const paneEl = e.target.closest('.pane');
    const onPane = !!paneEl;

    // If mouse is on canvas background, pan the canvas (zoom only via Ctrl+Scroll above)
    if (!onPane) {
      e.preventDefault();
      scrollLockTarget = null;
      state.panX -= e.deltaX || 0;
      state.panY -= e.deltaY;
      updateCanvasTransform();
      saveViewState();
      return;
    }

    // Mouse is on a pane — Shift+Scroll = pan canvas, normal scroll = let pane handle
    if (e.shiftKey) {
      e.preventDefault();
      state.panX -= e.deltaX || e.deltaY;
      state.panY -= e.deltaY;
      updateCanvasTransform();
      saveViewState();
    }
    // Normal scroll on pane: don't preventDefault — let terminal/editor handle it
  }

  // Set zoom centered on a point
  function setZoom(newZoom, centerX, centerY) {
    newZoom = Math.max(0.05, Math.min(4, newZoom));
    const zoomRatio = newZoom / state.zoom;
    state.panX = centerX - (centerX - state.panX) * zoomRatio;
    state.panY = centerY - (centerY - state.panY) * zoomRatio;
    state.zoom = newZoom;

    updateCanvasTransform();
    saveViewState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Debug helper - expose internals for debugging
  window.TMDX_DEBUG = {
    get terminals() { return terminals; },
    get state() { return state; },
    get ws() { return ws; },
    testInput: (terminalId, text) => {
      const termInfo = terminals.get(terminalId);
      if (termInfo) {
        sendWs('terminal:input', { terminalId, data: btoa(unescape(encodeURIComponent(text))) }, getPaneAgentId(terminalId));
      }
    }
  };
})();
