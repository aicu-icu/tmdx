  // === Notification System Functions ===

  // Initialize notification container (called once from init)
  function initNotifications() {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    document.body.appendChild(notificationContainer);

    // Check snoozed notifications every 10 seconds (was 30s — more responsive)
    setInterval(checkSnoozedNotifications, 10000);

    // Check active notifications validity every 5 seconds
    setInterval(checkActiveNotifications, 5000);

  }

  // Create and show a toast notification
  function showToast(terminalId, title, deviceName, locationName, icon, priority, info = null) {
    // Remove existing toast for this terminal
    dismissToast(terminalId);
    // Remove from snoozed if re-showing
    snoozedNotifications.delete(terminalId);

    const toast = document.createElement('div');
    toast.className = `notification-toast`;
    toast.dataset.terminalId = terminalId;

    // High priority (permission/question) gets snooze button, done/idle gets dismiss button
    const isHighPriority = priority === 'high';
    const actionButton = isHighPriority
      ? `<button class="notification-snooze" data-tooltip="Snooze for 3 minutes">🕐</button>`
      : `<button class="notification-dismiss" data-tooltip="Dismiss">&times;</button>`;

    toast.innerHTML = `
      <div class="notification-icon">${icon}</div>
      <div class="notification-body">
        <div class="notification-title">${escapeHtml(title)}</div>
        ${deviceName ? `<div class="notification-device">${escapeHtml(deviceName)}</div>` : ''}
        ${locationName ? `<div class="notification-path">${escapeHtml(locationName)}</div>` : ''}
      </div>
      ${actionButton}
    `;

    // Store info for potential snooze/re-show
    toast._notificationInfo = { title, deviceName, locationName, icon, priority, info };

    // First-hover tooltip: "Right-click to snooze/dismiss" (shown once)
    if (!localStorage.getItem('hasSeenToastTooltip')) {
      const onFirstHover = () => {
        toast.removeEventListener('mouseenter', onFirstHover);
        const tip = document.createElement('div');
        tip.className = 'toast-tooltip';
        tip.textContent = isHighPriority ? 'Right-click to snooze' : 'Right-click to dismiss';
        toast.appendChild(tip);
        requestAnimationFrame(() => tip.classList.add('visible'));
        setTimeout(() => { tip.classList.remove('visible'); setTimeout(() => tip.remove(), 200); }, 3000);
        localStorage.setItem('hasSeenToastTooltip', '1');
      };
      toast.addEventListener('mouseenter', onFirstHover);
    }

    // Right-click → auto-snooze or auto-discard (done notifications)
    toast.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isDone = priority === 'medium';
      if (isDone) {
        dismissToast(terminalId);
      } else {
        snoozeNotification(terminalId, toast._notificationInfo);
      }
    });

    // Click anywhere on the toast → pan to pane
    toast.addEventListener('click', (e) => {
      if (e.target.closest('.notification-dismiss') || e.target.closest('.notification-snooze')) return;
      panToPane(terminalId);
    });

    // Snooze button → hide for 3 minutes
    const snoozeBtn = toast.querySelector('.notification-snooze');
    if (snoozeBtn) {
      snoozeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        snoozeNotification(terminalId, toast._notificationInfo);
      });
    }

    // Dismiss button → remove permanently
    const dismissBtn = toast.querySelector('.notification-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast(terminalId);
      });
    }

    notificationContainer.prepend(toast);
    activeToasts.set(terminalId, toast);

    // Trigger slide-in animation
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto-dismiss medium priority after 15s (only if auto-remove is enabled)
    if (priority === 'medium' && autoRemoveDoneNotifs) {
      toast._autoDismissTimer = setTimeout(() => dismissToast(terminalId), 15000);
    }

    // Cap visible toasts at 8
    const allToasts = notificationContainer.querySelectorAll('.notification-toast');
    if (allToasts.length > 8) {
      for (let i = 8; i < allToasts.length; i++) {
        const old = allToasts[i];
        if (old.dataset.terminalId) activeToasts.delete(old.dataset.terminalId);
        old.remove();
      }
    }
  }

  // Snooze a notification — tracks escalation count
  function snoozeNotification(terminalId, notificationInfo) {
    const toast = activeToasts.get(terminalId);
    if (toast) {
      toast.classList.add('dismissing');
      activeToasts.delete(terminalId);
      setTimeout(() => toast.remove(), 200);
    }

    // Increment snooze count for escalation
    const key = `${terminalId}:${notificationInfo.priority}`;
    snoozeCount.set(key, (snoozeCount.get(key) || 0) + 1);

    // Store snooze info
    snoozedNotifications.set(terminalId, {
      snoozeUntil: Date.now() + snoozeDurationMs,
      ...notificationInfo
    });
  }

  // Check snoozed notifications and re-show if still applicable (with escalation)
  function checkSnoozedNotifications() {
    // Reserved for future notification snooze logic
  }

  // Check if active notifications are still valid
  function checkActiveNotifications() {
    // Reserved for future notification validity checks
  }

  // Dismiss a toast by terminal ID
  function dismissToast(terminalId) {
    const toast = activeToasts.get(terminalId);
    if (toast) {
      if (toast._autoDismissTimer) clearTimeout(toast._autoDismissTimer);
      if (toast._guestCountdown) clearInterval(toast._guestCountdown);
      // Play dismiss sound for permission/question only (not task complete)
      const isHighPriority = toast.classList.contains('state-permission') ||
                             toast.classList.contains('state-question') ||
                             toast.classList.contains('state-inputNeeded');
      if (isHighPriority) {
        playDismissSound();
      }
      toast.classList.add('dismissing');
      activeToasts.delete(terminalId);
      setTimeout(() => toast.remove(), 200);
    }
  }

  // Subtle dismiss sound (shared for permission/question)
  function playDismissSound() {
    if (!notificationSoundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 250);
    } catch (e) {
      // Audio not available
    }
  }

  // Play notification sound via Web Audio API (distinct per state)
  function playTwoNoteTone(ctx, freq1, freq2, gainMul = 1.0, skipClose = false) {
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
    gain1.gain.setValueAtTime(0.15 * gainMul, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq2, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.001, ctx.currentTime);
    gain2.gain.setValueAtTime(0.15 * gainMul, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.4);
    if (!skipClose) setTimeout(() => ctx.close(), 500);
  }

  function playThreeNoteTone(ctx, freq1, freq2, freq3, gainMul = 1.0) {
    playTwoNoteTone(ctx, freq1, freq2, gainMul, true);
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq3, ctx.currentTime + 0.35);
    gain3.gain.setValueAtTime(0.001, ctx.currentTime);
    gain3.gain.setValueAtTime(0.15 * gainMul, ctx.currentTime + 0.35);
    gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(ctx.currentTime + 0.35);
    osc3.stop(ctx.currentTime + 0.6);
    setTimeout(() => ctx.close(), 700);
  }

  // Update pane headers with terminal state info (called from WS push)
  function updateTerminalStates(states) {
    for (const [terminalId, info] of Object.entries(states)) {
      // Track alternate screen state from tmux (authoritative source)
      const termInfo = terminals.get(terminalId);
      if (termInfo && info) {
        termInfo._alternateOn = !!info.alternateOn;
      }
      // Update paneData.workingDir from live tmux cwd
      const paneData = state.panes.find(p => p.id === terminalId);
      if (paneData && info && info.cwd) {
        paneData.workingDir = info.cwd;
      }
    }
  }

  // Connect to WebSocket
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;


    ws = new WebSocket(wsUrl);

    let heartbeatInterval = null;

    ws.onopen = () => {

      clearTimeout(wsReconnectTimer);
      wsReconnectDelay = 2000; // reset backoff on successful connection
      // Send heartbeat every 10s to keep connection alive over Tailscale/NAT
      clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 10000);
      // Reattach any pending terminals
      for (const paneId of pendingAttachments) {
        const pane = state.panes.find(p => p.id === paneId);
        if (pane) {
          attachTerminal(pane);
        }
      }
      pendingAttachments.clear();
    };

    ws.onmessage = (event) => {
      try {
        if (!event.data) return;
        const message = JSON.parse(event.data);
        if (message.type === 'pong') return; // ignore heartbeat replies
        handleWsMessage(message);
      } catch (e) {
        console.error('[WS] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatInterval);

      // Reject all pending REST-over-WS requests immediately
      for (const [id, pending] of pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('WebSocket disconnected'));
      }
      pendingRequests.clear();
      pendingScanCallbacks.clear();

      console.log(`[WS] Reconnecting in ${wsReconnectDelay}ms...`);
      wsReconnectTimer = setTimeout(connectWebSocket, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  // Handle WebSocket messages
  function handleWsMessage(message) {
    const { type, payload } = message;


    switch (type) {
      case 'terminal:attached':

        updateConnectionStatus(payload.terminalId, 'connected');
        console.log(`[DBG-ATTACH] terminal:attached for ${payload.terminalId.slice(0,8)} at ${Date.now()}`);
        // Fade out loading overlay
        {
          const paneEl = document.getElementById(`pane-${payload.terminalId}`);
          const overlay = paneEl?.querySelector('.terminal-loading-overlay');
          if (overlay) {
            overlay.classList.add('fade-out');
            overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
          }
        }
        // History is now injected server-side via terminal:history message.
        // Only run ONCE per terminal — skip on reattach after agent reconnect.
        {
          const termInfo = terminals.get(payload.terminalId);
          if (termInfo) {
            // Enable input forwarding — pty is now in raw mode (tmux controls it)
            termInfo._attached = true;
          }
          if (termInfo && !termInfo._initialAttachDone) {
            termInfo._initialAttachDone = true;
            console.log(`[DBG-ATTACH] first attach for ${payload.terminalId.slice(0,8)}, history injection via terminal:history message`);
          } else if (termInfo) {
            console.log(`[DBG-ATTACH] reattach for ${payload.terminalId.slice(0,8)} (skipping history injection)`);
          }
        }
        break;

      case 'terminal:history':
        if (payload.data) {
          const termInfo = terminals.get(payload.terminalId);
          // Only inject history once per xterm instance. On WebSocket
          // reconnect the agent re-sends history, but the xterm buffer
          // already has it — writing it again causes duplicate content.
          // On page refresh, termInfo is a new object so the flag is unset.
          if (termInfo && !termInfo._historyLoaded) {
            termInfo._historyLoaded = true;
            const decoded = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
            console.log(`[DBG-HISTORY] Writing ${decoded.length} bytes of history for ${payload.terminalId.slice(0,8)}`);
            // Use writeTermOutput so history respects deferred output buffer
            // (mouse held down / text selected). Direct xterm.write() would
            // bypass the buffer and get overwritten by deferred live output
            // on flush, causing history to disappear.
            writeTermOutput(payload.terminalId, decoded);
            // Push history into scrollback so tmux's cursor positioning
            // (e.g. \e[H) from the live screen dump won't overwrite it.
            // Use \n (not \r\n) to match Node.js behavior — xterm.js
            // handles line advancement on \n alone; \r may cause cursor
            // position desync leading to output corruption.
            writeTermOutput(payload.terminalId, new TextEncoder().encode('\n'.repeat(termInfo.xterm.rows)));
            // Scroll to bottom so live screen is visible immediately.
            termInfo.xterm.scrollToBottom();
          } else if (termInfo) {
            console.log(`[DBG-HISTORY] Skipping duplicate history for ${payload.terminalId.slice(0,8)}`);
          }
        }
        break;

      case 'terminal:output':

        if (payload.data) {
          const decoded = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
          writeTermOutput(payload.terminalId, decoded);
        }
        break;

      case 'terminal:error':
        console.error('[WS] Terminal error:', payload.message);
        updateConnectionStatus(payload.terminalId, 'error');
        break;

      case 'terminal:disconnected':
        console.log(`[DBG-ATTACH] terminal:disconnected for ${payload.terminalId.slice(0,8)} — will reattach in 2s`);
        updateConnectionStatus(payload.terminalId, 'disconnected');
        // Auto-reattach after a short delay
        setTimeout(() => {
          const pane = state.panes.find(p => p.id === payload.terminalId);
          if (pane && ws && ws.readyState === WebSocket.OPEN) {
            console.log(`[DBG-ATTACH] reattaching ${payload.terminalId.slice(0,8)}`);
            attachTerminal(pane);
          }
        }, 2000);
        break;

      case 'terminal:closed': {
        const closedPane = state.panes.find(p => p.id === payload.terminalId);
        if (!closedPane) break;
        const el = document.getElementById(`pane-${payload.terminalId}`);
        if (!el) break;

        const matchedAgent = findOnlineAgentForDevice(closedPane);
        if (matchedAgent) {
          setDisconnectOverlay(el, 'reconnect');
        } else {
          setDisconnectOverlay(el, 'offline');
        }
        updateConnectionStatus(payload.terminalId, 'disconnected');
        break;
      }

      case 'terminal:states':
        updateTerminalStates(payload);
        break;

      case 'agents:list':
        // Initial agent list from cloud on connect
        agents = payload;
        if (agents.length === 1) {
          activeAgentId = agents[0].agentId;
        } else if (agents.length > 1 && !activeAgentId) {
          activeAgentId = agents[0].agentId;  // auto-select first (default device for new panes)
        }
        updateAgentOverlay();
        updateAgentsHud();
        // Load panes from ALL online agents
        if (agents.some(a => a.online)) {
          loadTerminalsFromServer().catch(e => console.error('Failed to load panes:', e));
        }
        // Re-attach all existing terminal panes (agent may have restarted, clearing its activeTerminals)
        for (const pane of state.panes) {
          if (pane.type === 'terminal' && terminals.has(pane.id)) {
            const agent = agents.find(a => a.agentId === pane.agentId && a.online);
            if (agent) attachTerminal(pane);
          }
        }
        break;

      case 'agent:online': {
        // New agent connected
        console.log(`[DBG-AGENT] agent:online ${payload.agentId?.slice(0,8)} at ${Date.now()}`);
        const newAgentId = payload.agentId;
        // Cancel pending offline timer — agent reconnected before debounce fired
        if (window._agentOfflineTimers?.has(newAgentId)) {
          clearTimeout(window._agentOfflineTimers.get(newAgentId));
          window._agentOfflineTimers.delete(newAgentId);
        }
        agents = agents.filter(a => a.agentId !== newAgentId);
        // Insert in chronological order (by createdAt)
        const newAgent = { ...payload, online: true };
        const insertIdx = agents.findIndex(a => a.createdAt && newAgent.createdAt && a.createdAt > newAgent.createdAt);
        if (insertIdx === -1) {
          agents.push(newAgent);
        } else {
          agents.splice(insertIdx, 0, newAgent);
        }
        // Check if this agent was pending update and now has latest version
        const prevUpdate = agentUpdates.get(newAgentId);
        if (prevUpdate && !isAgentVersionOutdated(payload.version, prevUpdate.latestVersion)) {
          agentUpdates.delete(newAgentId);
          showUpdateCompleteToast(newAgentId, payload.hostname || newAgentId.slice(0, 8), payload.version);
        }
        if (!activeAgentId) {
          activeAgentId = newAgentId;
        }
        updateAgentOverlay();
        updateAgentsHud();
        // Remove offline placeholders for this agent — they'll be replaced by real panes
        const placeholders = state.panes.filter(p => p.agentId === newAgentId && p._offlinePlaceholder);
        if (placeholders.length > 0) {
          for (const ph of placeholders) {
            const el = document.getElementById(`pane-${ph.id}`);
            if (el) el.remove();
          }
          state.panes = state.panes.filter(p => !(p.agentId === newAgentId && p._offlinePlaceholder));
        }
        // Load panes from newly connected agent onto the canvas
        if (!state.panes.some(p => p.agentId === newAgentId)) {
          (async () => {
            try {
              let cloudLayoutMap = new Map();
              const cloudData = await cloudFetch('GET', '/api/layouts').catch(() => null);
              if (cloudData?.layouts?.length > 0) {
                cloudLayoutMap = new Map(cloudData.layouts.map(l => [l.id, l]));
              }
              await loadPanesFromAgent(newAgentId, cloudLayoutMap);
            } catch (e) {
              console.error('Failed to load panes from new agent:', e);
            }
          })();
        }
        // Remove offline styling and re-attach terminals for this agent's panes
        state.panes.filter(p => p.agentId === newAgentId).forEach(p => {
          const el = document.getElementById(`pane-${p.id}`);
          if (el) {
            el.classList.remove('agent-offline');
            setDisconnectOverlay(el, false);
            updateConnectionStatus(p.id, 'connecting');
          }
          // Re-send terminal:attach so the agent re-establishes pty connections
          if (p.type === 'terminal' && terminals.has(p.id)) {
            attachTerminal(p);
          }
        });
        break;
      }

      case 'agent:offline': {
        // Agent disconnected
        console.warn(`[DBG-AGENT] agent:offline ${payload.agentId?.slice(0,8)} at ${Date.now()} — panes will dim to 40% opacity!`);
        const offlineAgentId = payload.agentId;
        agents = agents.map(a =>
          a.agentId === offlineAgentId ? { ...a, online: false } : a
        );
        // If active agent went offline, try to select another
        if (activeAgentId === offlineAgentId) {
          const onlineAgent = agents.find(a => a.online);
          activeAgentId = onlineAgent?.agentId || null;
        }
        updateAgentOverlay();
        updateAgentsHud();
        // Mark panes belonging to the offline agent — debounced so brief
        // disconnects (agent relay churn) don't flash the UI.
        if (!window._agentOfflineTimers) window._agentOfflineTimers = new Map();
        {
          const existing = window._agentOfflineTimers.get(offlineAgentId);
          if (existing) clearTimeout(existing);
          window._agentOfflineTimers.set(offlineAgentId, setTimeout(() => {
            window._agentOfflineTimers.delete(offlineAgentId);
            // Only apply if agent is STILL offline
            const agent = agents.find(a => a.agentId === offlineAgentId);
            if (agent && !agent.online) {
              state.panes.filter(p => p.agentId === offlineAgentId).forEach(p => {
                const el = document.getElementById(`pane-${p.id}`);
                if (el) {
                  el.classList.add('agent-offline');
                  // Check if another online agent matches this pane's device
                  const alt = findOnlineAgentForDevice(p);
                  if (alt && p.type === 'terminal') {
                    setDisconnectOverlay(el, 'reconnect');
                  } else {
                    setDisconnectOverlay(el, 'offline');
                  }
                  updateConnectionStatus(p.id, 'disconnected');
                }
              });
            }
          }, 5000));
        }
        break;
      }

      case 'update:available': {
        const { agentId: updateAgentId, currentVersion, latestVersion } = payload;
        agentUpdates.set(updateAgentId, { currentVersion, latestVersion });
        const agent = agents.find(a => a.agentId === updateAgentId);
        const hostname = agent?.hostname || updateAgentId.slice(0, 8);
        showUpdateToast(updateAgentId, hostname, currentVersion, latestVersion);
        updateAgentsHud();
        break;
      }

      case 'update:progress': {
        const { agentId: progAgentId, status: progStatus } = payload;
        const progAgent = agents.find(a => a.agentId === progAgentId);
        const progHostname = progAgent?.hostname || progAgentId.slice(0, 8);
        showUpdateProgressToast(progAgentId, progHostname, progStatus, payload);
        if (progStatus === 'complete') {
          showUpdateCompleteToast(progAgentId, progHostname, payload.version || '');
        }
        updateAgentsHud();
        break;
      }

      case 'scan:partial': {
        // Streaming scan results — forward to registered callback
        const cb = pendingScanCallbacks.get(message.id);
        if (cb && payload?.repos) cb(payload.repos);
        break;
      }

      case 'response': {
        // REST-over-WS response
        pendingScanCallbacks.delete(message.id);
        const pending = pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(message.id);
          if (payload.status >= 400) {
            pending.reject(new Error(payload.body?.error || `HTTP ${payload.status}`));
          } else {
            pending.resolve(payload.body);
          }
        }
        break;
      }

      case 'tier:info':
        // Store tier info for UI display
        window.__tcTier = payload;
        break;

      case 'tier:limit':
        // Tier limit hit — show upgrade prompt
        showUpgradePrompt(payload.message);
        break;

      case 'chat:message':
        break;

    }
  }

  // Show upgrade prompt with checkout button
  function showUpgradePrompt(message) {
    // Remove any existing prompt
    const existing = document.getElementById('upgrade-prompt');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'upgrade-prompt';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1a1a2e;border:1px solid #4ec9b0;border-radius:12px;padding:32px;max-width:420px;text-align:center;color:#e0e0e0;font-family:monospace;';

    dialog.innerHTML = `
      <div style="font-size:24px;margin-bottom:8px;">&#x26A1;</div>
      <h3 style="margin:0 0 12px;color:#4ec9b0;">Upgrade to Pro</h3>
      <p style="margin:0 0 20px;opacity:0.8;line-height:1.5;">${message}</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="upgrade-checkout-btn" style="background:#4ec9b0;color:#0a0a1a;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:monospace;">Upgrade — $8/mo</button>
        <button id="upgrade-dismiss-btn" style="background:transparent;color:#6a6a8a;border:1px solid #6a6a8a;padding:10px 24px;border-radius:6px;cursor:pointer;font-family:monospace;">Maybe later</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('upgrade-checkout-btn').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          showRelayNotification(data.error || 'Billing not available', 'warning', 3000);
          overlay.remove();
        }
      } catch (e) {
        showRelayNotification('Billing not available', 'warning', 3000);
        overlay.remove();
      }
    });

    document.getElementById('upgrade-dismiss-btn').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }
