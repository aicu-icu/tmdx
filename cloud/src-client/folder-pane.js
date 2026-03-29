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
