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
