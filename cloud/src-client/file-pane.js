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
