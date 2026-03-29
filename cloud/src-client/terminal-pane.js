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
