
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
