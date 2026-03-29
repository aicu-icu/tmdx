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
