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
