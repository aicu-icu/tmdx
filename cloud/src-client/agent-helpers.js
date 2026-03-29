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
