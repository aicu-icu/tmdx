  // === Settings Modal ===
  let prefsSaveTimer = null;
  let currentCanvasBg = 'default';
  let currentTerminalFont = 'JetBrains Mono';

  const TERMINAL_FONTS = [
    'JetBrains Mono',
    'Fira Code',
    'Source Code Pro',
    'IBM Plex Mono',
    'Inconsolata',
    'Cascadia Code',
    'Ubuntu Mono',
    'Roboto Mono',
    'Space Mono',
    'Anonymous Pro',
    'Cousine',
    'PT Mono',
    'Overpass Mono',
    'Noto Sans Mono',
    'DM Mono',
    'Red Hat Mono',
    'monospace',
  ];

  const CANVAS_BACKGROUNDS = {
    default:    { name: 'Deep Space',   color: '#050d18' },
    black:      { name: 'Pure Black',   color: '#000000' },
    midnight:   { name: 'Midnight',     color: '#0a0a1a' },
    charcoal:   { name: 'Charcoal',     color: '#1a1a2e' },
    grid:       { name: 'Grid',         color: '#050d18', grid: true },
  };

  function getAllPrefs(overrides) {
    return {
      nightMode: !!document.getElementById('night-mode-overlay'),
      terminalTheme: currentTerminalTheme,
      notificationSound: notificationSoundEnabled,
      autoRemoveDone: autoRemoveDoneNotifs,
      canvasBg: currentCanvasBg,
      snoozeDuration: snoozeDurationMs / 1000,
      terminalFont: currentTerminalFont,
      focusMode: focusMode,
      hudState: {
        fleet_expanded: hudExpanded,
        device_colors: deviceColorOverrides,
        hud_hidden: hudHidden,
      },
      tutorialsCompleted: tutorialsCompleted,
      ...overrides,
    };
  }

  function getTerminalFontFamily(fontName) {
    return `"${fontName}", "Fira Code", "SF Mono", Menlo, Monaco, monospace`;
  }

  function applyTerminalFont(fontName) {
    currentTerminalFont = fontName;
    const family = getTerminalFontFamily(fontName);
    terminals.forEach(({ xterm }) => {
      xterm.options.fontFamily = family;
    });
  }

  function savePrefsToCloud(overrides) {
    if (prefsSaveTimer) clearTimeout(prefsSaveTimer);
    prefsSaveTimer = setTimeout(() => {
      cloudFetch('PUT', '/api/preferences', getAllPrefs(overrides))
        .catch(e => {
          console.error('[Prefs] Save failed:', e.message);
          showRelayNotification('Preferences save failed, please retry', 'warning', 3000);
        });
    }, 500);
  }

  function setCanvasBackground(key) {
    const bg = CANVAS_BACKGROUNDS[key] || CANVAS_BACKGROUNDS.default;
    currentCanvasBg = key;
    document.body.style.backgroundColor = bg.color;
    if (bg.grid) {
      document.body.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)';
      document.body.style.backgroundSize = '40px 40px';
    } else {
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundSize = '';
    }
  }

  function setNightMode(enabled) {
    let overlay = document.getElementById('night-mode-overlay');
    if (enabled && !overlay) {
      overlay = document.createElement('div');
      overlay.id = 'night-mode-overlay';
      document.body.appendChild(overlay);
    } else if (!enabled && overlay) {
      overlay.remove();
    }
  }

  // ─── Settings Sidebar Modal ────────────────────────────────────────
  function showSettingsModal() {
    const existing = document.getElementById('settings-modal');
    if (existing) { existing.remove(); return; }

    const user = window.__tcUser || {};
    const isAdmin = user.role === 'admin';
    const nightModeOn = !!document.getElementById('night-mode-overlay');

    const overlay = document.createElement('div');
    overlay.id = 'settings-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1a1a2e;border:1px solid rgba(var(--accent-rgb),0.3);border-radius:12px;width:660px;max-width:95vw;height:75vh;max-height:560px;color:#e0e0e0;font-family:Montserrat,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

    // ── Sidebar items ──
    const sections = [
      { key: 'profile',      label: 'Profile',        icon: '\u{1F464}' },
      { key: 'preferences',  label: 'Preferences',    icon: '\u2699' },
      { key: 'appearance',   label: 'Appearance',     icon: '\u{1F3A8}' },
      { key: 'shortcuts',    label: 'Shortcuts',       icon: '\u2328' },
    ];
    if (isAdmin) {
      sections.push({ key: 'admin', label: 'User Management', icon: '\u{1F465}' });
      sections.push({ key: 'tiers', label: 'Tier Management', icon: '\u{1F3F7}\uFE0F' });
    }

    let activeSection = sections[0].key;

    // ── Build sidebar HTML ──
    const sidebarHtml = sections.map(s =>
      `<div class="settings-nav-item" data-section="${s.key}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:6px;cursor:pointer;font-size:12px;transition:background 0.15s;${s.key === activeSection ? 'background:rgba(var(--accent-rgb),0.15);color:#e0e0e0;' : 'color:#8b8bb0;'}">
        <span style="font-size:14px;width:18px;text-align:center;">${s.icon}</span>${s.label}
      </div>`
    ).join('');

    // ── Content renderers ──
    function renderProfile() {
      return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${user.avatar ? `<img src="${user.avatar}" style="width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);" alt="">` : '<div style="width:48px;height:48px;border-radius:50%;background:rgba(var(--accent-rgb),0.3);display:flex;align-items:center;justify-content:center;font-size:20px;">U</div>'}
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:500;">${user.name || 'User'}</div>
              <div style="font-size:12px;color:#6a6a8a;margin-top:2px;">@${user.login || 'unknown'}</div>
              <div style="margin-top:4px;">
                <span style="color:${user.tier === 'poweruser' ? '#e0a0ff' : user.tier === 'pro' ? '#4ec9b0' : '#6a6a8a'};text-transform:uppercase;font-size:10px;letter-spacing:0.5px;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:4px;">${user.tier || 'free'}</span>
                ${isAdmin ? '<span style="margin-left:6px;color:#e0a0ff;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;background:rgba(224,160,255,0.1);padding:2px 8px;border-radius:4px;">admin</span>' : ''}
              </div>
            </div>
          </div>
        </div>
        <button id="settings-logout-btn" style="width:100%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;font-size:12px;padding:8px;border-radius:6px;cursor:pointer;font-family:inherit;">Logout</button>`;
    }

    function renderPreferences() {
      return `
        ${renderToggle('Night Mode', 'Red overlay for low-light use', 'settings-night-toggle', nightModeOn, 'rgba(239,68,68,0.5)')}
        ${renderToggle('Notification Sound', 'Play sound on state changes', 'settings-sound-toggle', notificationSoundEnabled)}
        ${renderToggle('Auto-Remove Done', 'Dismiss "Task complete" after 15s', 'settings-auto-remove-done-toggle', autoRemoveDoneNotifs)}
        ${renderToggle('Focus on Hover', 'Hover to focus (off = click)', 'settings-focus-mode-toggle', focusMode === 'hover')}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
          <div>
            <div style="font-size:13px;">Snooze Duration</div>
            <div style="font-size:11px;color:#6a6a8a;">How long to mute per terminal</div>
          </div>
          <span id="settings-snooze-slot"></span>
        </div>`;
    }

    function renderAppearance() {
      const curTheme = TERMINAL_THEMES[currentTerminalTheme] || TERMINAL_THEMES.default;
      const curThemeDots = [curTheme.red, curTheme.green, curTheme.blue, curTheme.yellow, curTheme.magenta, curTheme.cyan].filter(Boolean)
        .map(c => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:2px;"></span>`).join('');

      return `
        <div style="padding:0 0 12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:13px;margin-bottom:8px;">Canvas Background</div>
          <div id="settings-bg-list" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${Object.entries(CANVAS_BACKGROUNDS).map(([key, bg]) => {
              const isSel = key === currentCanvasBg;
              return `<div class="settings-bg-item" data-bg="${key}" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;cursor:pointer;background:${isSel ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(255,255,255,0.03)'};border:1px solid ${isSel ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(255,255,255,0.06)'};transition:all 0.15s ease;">
                <span style="width:16px;height:16px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:${bg.color};${bg.grid ? 'background-image:linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px);background-size:4px 4px;' : ''}"></span>
                <span style="font-size:12px;">${bg.name}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div id="settings-theme-header" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;">
            <div style="font-size:13px;">Terminal Theme</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="display:flex;gap:1px;">${curThemeDots}</span>
              <span style="font-size:12px;color:#6a6a8a;">${curTheme.name}</span>
              <span id="settings-theme-arrow" style="font-size:10px;color:#6a6a8a;transition:transform 0.2s;">\u25B6</span>
            </div>
          </div>
          <div id="settings-theme-body" style="display:none;margin-top:8px;">
            <input id="settings-theme-search" type="text" placeholder="Search themes..." style="width:100%;padding:5px 8px;margin-bottom:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#e0e0e0;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box;" />
            <div id="settings-theme-list" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;"></div>
          </div>
        </div>
        <div style="padding:12px 0;">
          <div id="settings-font-header" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;">
            <div style="font-size:13px;">Terminal Font</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;color:#6a6a8a;font-family:'${currentTerminalFont}',monospace;">${currentTerminalFont}</span>
              <span id="settings-font-arrow" style="font-size:10px;color:#6a6a8a;transition:transform 0.2s;">\u25B6</span>
            </div>
          </div>
          <div id="settings-font-body" style="display:none;margin-top:8px;">
            <input id="settings-font-search" type="text" placeholder="Search fonts..." style="width:100%;padding:5px 8px;margin-bottom:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:#e0e0e0;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box;" />
            <div id="settings-font-list" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;"></div>
          </div>
        </div>`;
    }

    function renderShortcuts() {
      return `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;">
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab Q</kbd><span style="color:#9999b8;">Cycle terminals</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab A</kbd><span style="color:#9999b8;">Add menu</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab D</kbd><span style="color:#9999b8;">Toggle fleet pane</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab U</kbd><span style="color:#9999b8;">Toggle usage pane</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab S</kbd><span style="color:#9999b8;">Settings</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab W</kbd><span style="color:#9999b8;">Close pane</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Shift+Click</kbd><span style="color:#9999b8;">Broadcast select</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Esc</kbd><span style="color:#9999b8;">Clear broadcast / cancel</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Tab Tab</kbd><span style="color:#9999b8;">Enter move mode</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Ctrl+Scroll</kbd><span style="color:#9999b8;">Zoom canvas</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Scroll</kbd><span style="color:#9999b8;">Pan canvas / scroll</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Ctrl +/-/0</kbd><span style="color:#9999b8;">Zoom pane or canvas</span>
          <kbd style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:inherit;color:#ccc;">Middle-drag</kbd><span style="color:#9999b8;">Pan canvas</span>
        </div>
        <div style="margin-top:12px;padding:8px 10px;color:#7a7a9a;font-size:11px;border-left:2px solid rgba(255,255,255,0.06);line-height:1.6;">
          <kbd style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:inherit;color:#aaa;font-size:11px;">WASD</kbd> / <kbd style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:inherit;color:#aaa;font-size:11px;">Arrows</kbd> Navigate panes
          <br><kbd style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:inherit;color:#aaa;font-size:11px;">Enter</kbd> / <kbd style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:inherit;color:#aaa;font-size:11px;">Tab</kbd> Confirm &amp; keep zoom
          <br><kbd style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-family:inherit;color:#aaa;font-size:11px;">Esc</kbd> Cancel &amp; restore zoom
        </div>`;
    }

    function renderAdminPanel() {
      return `
        <div id="admin-panel-container">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:14px;font-weight:500;">Users</div>
            <div id="admin-user-count" style="font-size:11px;color:#6a6a8a;">Loading...</div>
          </div>
          <div id="admin-user-list" style="overflow-y:auto;max-height:calc(75vh - 80px);">
            <div style="font-size:12px;color:#6a6a8a;padding:20px;text-align:center;">Loading user list...</div>
          </div>
        </div>`;
    }

    function renderTierManagement() {
      return `
        <div id="tier-mgmt-container">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:14px;font-weight:500;">Tiers</div>
            <button id="tier-add-btn" style="background:rgba(var(--accent-rgb),0.15);border:1px solid rgba(var(--accent-rgb),0.3);color:#e0e0e0;font-size:12px;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;">+ Add Tier</button>
          </div>
          <div id="tier-add-form" style="display:none;background:rgba(var(--accent-rgb),0.08);border:1px solid rgba(var(--accent-rgb),0.2);border-radius:8px;padding:12px;margin-bottom:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
              <div>
                <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Name</div>
                <input id="tier-new-name" type="text" placeholder="e.g. enterprise" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:12px;padding:4px 6px;font-family:inherit;box-sizing:border-box;" />
              </div>
              <div>
                <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Agents</div>
                <input id="tier-new-agents" type="number" value="10" min="1" max="999" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:12px;padding:4px 6px;font-family:inherit;box-sizing:border-box;" />
              </div>
              <div>
                <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Terminal Panes</div>
                <input id="tier-new-panes" type="number" value="50" min="1" max="999" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:12px;padding:4px 6px;font-family:inherit;box-sizing:border-box;" />
              </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button id="tier-create-cancel" style="background:none;border:1px solid rgba(255,255,255,0.1);color:#6a6a8a;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit;">Cancel</button>
              <button id="tier-create-confirm" style="background:rgba(var(--accent-rgb),0.2);border:1px solid rgba(var(--accent-rgb),0.4);color:#e0e0e0;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit;">Create</button>
            </div>
          </div>
          <div id="tier-list">
            <div style="font-size:12px;color:#6a6a8a;padding:20px;text-align:center;">Loading tiers...</div>
          </div>
        </div>`;
    }

    // ── Toggle helper ──
    function renderToggle(title, desc, id, checked, activeColor) {
      const onColor = activeColor || 'rgba(var(--accent-rgb),0.5)';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div>
          <div style="font-size:13px;">${title}</div>
          <div style="font-size:11px;color:#6a6a8a;">${desc}</div>
        </div>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="opacity:0;width:0;height:0;">
          <span style="position:absolute;inset:0;background:${checked ? onColor : 'rgba(255,255,255,0.1)'};border-radius:11px;transition:0.2s;"></span>
          <span style="position:absolute;top:2px;left:${checked ? '20px' : '2px'};width:18px;height:18px;background:#fff;border-radius:50%;transition:0.2s;"></span>
        </label>
      </div>`;
    }

    // ── Assemble dialog ──
    dialog.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <h3 style="margin:0;font-size:15px;font-weight:400;color:#8b8bb0;">Settings</h3>
        <button id="settings-close-btn" style="background:none;border:none;color:#6a6a8a;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;">
        <div id="settings-sidebar" style="width:160px;min-width:160px;padding:12px 8px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;">
          ${sidebarHtml}
        </div>
        <div id="settings-content" class="tc-scrollbar" style="flex:1;padding:16px 20px;overflow-y:auto;">
        </div>
      </div>`;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const contentEl = dialog.querySelector('#settings-content');

    // ── Switch section ──
    function switchSection(key) {
      activeSection = key;
      // Update sidebar highlight
      dialog.querySelectorAll('.settings-nav-item').forEach(el => {
        const active = el.dataset.section === key;
        el.style.background = active ? 'rgba(var(--accent-rgb),0.15)' : 'transparent';
        el.style.color = active ? '#e0e0e0' : '#8b8bb0';
      });
      // Render content
      switch (key) {
        case 'profile':      contentEl.innerHTML = renderProfile();     bindProfile(); break;
        case 'preferences':  contentEl.innerHTML = renderPreferences(); bindPreferences(); break;
        case 'appearance':   contentEl.innerHTML = renderAppearance();  bindAppearance(); break;
        case 'shortcuts':    contentEl.innerHTML = renderShortcuts();   break;
        case 'admin':        contentEl.innerHTML = renderAdminPanel();  loadAdminPanel(); break;
        case 'tiers':        contentEl.innerHTML = renderTierManagement(); loadTierManagement(); break;
      }
    }

    // ── Sidebar click ──
    dialog.querySelector('#settings-sidebar').addEventListener('click', (e) => {
      const item = e.target.closest('.settings-nav-item');
      if (!item) return;
      switchSection(item.dataset.section);
    });

    // ── Close handlers ──
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#settings-close-btn').addEventListener('click', close);
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    // ── Bind: Profile ──
    function bindProfile() {
      dialog.querySelector('#settings-logout-btn')?.addEventListener('click', async () => {
        try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
        window.location.href = '/login';
      });
    }

    // ── Bind: Preferences ──
    function bindPreferences() {
      bindToggle('settings-night-toggle', 'rgba(239,68,68,0.5)', (on) => { setNightMode(on); savePrefsToCloud({ nightMode: on }); });
      bindToggle('settings-sound-toggle', 'rgba(var(--accent-rgb),0.5)', (on) => { notificationSoundEnabled = on; savePrefsToCloud({ notificationSound: on }); });
      bindToggle('settings-auto-remove-done-toggle', 'rgba(var(--accent-rgb),0.5)', (on) => { autoRemoveDoneNotifs = on; savePrefsToCloud({ autoRemoveDone: on }); });
      bindToggle('settings-focus-mode-toggle', 'rgba(var(--accent-rgb),0.5)', (on) => { focusMode = on ? 'hover' : 'click'; savePrefsToCloud({ focusMode }); });

      const snoozeSlot = dialog.querySelector('#settings-snooze-slot');
      if (snoozeSlot) {
        const snoozeSelect = createCustomSelect(
          [
            { value: '30', label: '30s' },
            { value: '60', label: '60s' },
            { value: '90', label: '90s' },
            { value: '300', label: '5min' },
            { value: '600', label: '10min' }
          ],
          String(snoozeDurationMs / 1000),
          (val) => { snoozeDurationMs = parseInt(val) * 1000; savePrefsToCloud({ snoozeDuration: parseInt(val) }); }
        );
        snoozeSlot.appendChild(snoozeSelect.el);
      }
    }

    function bindToggle(id, activeColor, onChange) {
      const toggle = dialog.querySelector('#' + id);
      if (!toggle) return;
      toggle.addEventListener('change', () => {
        const on = toggle.checked;
        onChange(on);
        const track = toggle.nextElementSibling;
        const knob = track.nextElementSibling;
        track.style.background = on ? activeColor : 'rgba(255,255,255,0.1)';
        knob.style.left = on ? '20px' : '2px';
      });
    }

    // ── Bind: Appearance ──
    function bindAppearance() {
      // Canvas background
      contentEl.querySelector('#settings-bg-list')?.addEventListener('click', (e) => {
        const item = e.target.closest('.settings-bg-item');
        if (!item) return;
        const bgKey = item.dataset.bg;
        setCanvasBackground(bgKey);
        contentEl.querySelectorAll('.settings-bg-item').forEach(el => {
          const isSel = el.dataset.bg === bgKey;
          el.style.background = isSel ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(255,255,255,0.03)';
          el.style.borderColor = isSel ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(255,255,255,0.06)';
        });
        savePrefsToCloud({ canvasBg: bgKey });
      });

      // Theme picker
      const themeBody = contentEl.querySelector('#settings-theme-body');
      const themeArrow = contentEl.querySelector('#settings-theme-arrow');
      const themeSearch = contentEl.querySelector('#settings-theme-search');
      const themeListEl = contentEl.querySelector('#settings-theme-list');

      function renderThemeList(filter) {
        const f = (filter || '').toLowerCase();
        let html = '';
        for (const [key, t] of Object.entries(TERMINAL_THEMES)) {
          if (f && !t.name.toLowerCase().includes(f) && !key.includes(f)) continue;
          const isSel = key === currentTerminalTheme;
          const dots = [t.red, t.green, t.blue, t.yellow, t.magenta, t.cyan].filter(Boolean)
            .map(c => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:2px;"></span>`).join('');
          html += `<div class="settings-theme-item" data-theme="${key}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;background:${isSel ? 'rgba(var(--accent-rgb),0.2)' : 'transparent'};border:1px solid ${isSel ? 'rgba(var(--accent-rgb),0.4)' : 'transparent'};transition:all 0.15s ease;">
            <span style="min-width:16px;text-align:center;font-size:12px;">${isSel ? '\u2713' : ''}</span>
            <span style="font-size:13px;flex:1;">${t.name}</span>
            <span style="display:flex;gap:1px;">${dots}</span>
          </div>`;
        }
        themeListEl.innerHTML = html || '<div style="font-size:12px;color:#6a6a8a;padding:6px;">No matching themes</div>';
      }

      contentEl.querySelector('#settings-theme-header')?.addEventListener('click', () => {
        const open = themeBody.style.display === 'none';
        themeBody.style.display = open ? 'block' : 'none';
        themeArrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
        if (open) { renderThemeList(''); themeSearch.value = ''; themeSearch.focus(); }
      });

      themeSearch?.addEventListener('input', (e) => renderThemeList(e.target.value));
      themeSearch?.addEventListener('click', (e) => e.stopPropagation());

      themeListEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.settings-theme-item');
        if (!item) return;
        const themeKey = item.dataset.theme;
        applyTerminalTheme(themeKey);
        renderThemeList(themeSearch.value);
        const t = TERMINAL_THEMES[themeKey];
        const headerPreview = contentEl.querySelector('#settings-theme-header').querySelector('div:last-child');
        const dots = [t.red, t.green, t.blue, t.yellow, t.magenta, t.cyan].filter(Boolean)
          .map(c => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:2px;"></span>`).join('');
        headerPreview.innerHTML = `<span style="display:flex;gap:1px;">${dots}</span><span style="font-size:12px;color:#6a6a8a;">${t.name}</span><span id="settings-theme-arrow" style="font-size:10px;color:#6a6a8a;transform:rotate(90deg);transition:transform 0.2s;">\u25B6</span>`;
        savePrefsToCloud({ terminalTheme: themeKey });
      });

      // Font picker
      const fontBody = contentEl.querySelector('#settings-font-body');
      const fontArrow = contentEl.querySelector('#settings-font-arrow');
      const fontSearch = contentEl.querySelector('#settings-font-search');
      const fontListEl = contentEl.querySelector('#settings-font-list');

      function renderFontList(filter) {
        const f = (filter || '').toLowerCase();
        let html = '';
        for (const font of TERMINAL_FONTS) {
          if (f && !font.toLowerCase().includes(f)) continue;
          const isSel = font === currentTerminalFont;
          html += `<div class="settings-font-item" data-font="${font}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;background:${isSel ? 'rgba(var(--accent-rgb),0.2)' : 'transparent'};border:1px solid ${isSel ? 'rgba(var(--accent-rgb),0.4)' : 'transparent'};transition:all 0.15s ease;">
            <span style="min-width:16px;text-align:center;font-size:12px;">${isSel ? '\u2713' : ''}</span>
            <span style="font-size:13px;font-family:'${font}',monospace;">${font}</span>
          </div>`;
        }
        fontListEl.innerHTML = html || '<div style="font-size:12px;color:#6a6a8a;padding:6px;">No matching fonts</div>';
      }

      contentEl.querySelector('#settings-font-header')?.addEventListener('click', () => {
        const open = fontBody.style.display === 'none';
        fontBody.style.display = open ? 'block' : 'none';
        fontArrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
        if (open) { renderFontList(''); fontSearch.value = ''; fontSearch.focus(); }
      });

      fontSearch?.addEventListener('input', (e) => renderFontList(e.target.value));
      fontSearch?.addEventListener('click', (e) => e.stopPropagation());

      fontListEl?.addEventListener('click', (e) => {
        const item = e.target.closest('.settings-font-item');
        if (!item) return;
        const fontName = item.dataset.font;
        applyTerminalFont(fontName);
        renderFontList(fontSearch.value);
        const headerPreview = contentEl.querySelector('#settings-font-header').querySelector('div:last-child');
        headerPreview.innerHTML = `<span style="font-size:12px;color:#6a6a8a;font-family:'${fontName}',monospace;">${fontName}</span><span id="settings-font-arrow" style="font-size:10px;color:#6a6a8a;transform:rotate(90deg);transition:transform 0.2s;">\u25B6</span>`;
        savePrefsToCloud({ terminalFont: fontName });
      });
    }

    // ── Admin Panel: Load & Render ──
    async function loadAdminPanel() {
      const listEl = contentEl.querySelector('#admin-user-list');
      const countEl = contentEl.querySelector('#admin-user-count');
      try {
        // Fetch tier configs and users in parallel
        const [tierData, userData] = await Promise.all([
          cloudFetch('GET', '/api/admin/tier-configs'),
          cloudFetch('GET', '/api/admin/users'),
        ]);
        const configs = tierData.configs || {};
        const tierNames = Object.keys(configs).sort();
        const users = userData.users || [];
        countEl.textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');

        if (users.length === 0) {
          listEl.innerHTML = '<div style="font-size:12px;color:#6a6a8a;padding:20px;text-align:center;">No users found</div>';
          return;
        }

        // Build user cards with placeholder slots for custom selects
        listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">
          ${users.map(u => {
            const isMe = u.id === user.id;
            return `<div class="admin-user-card" data-userid="${u.id}" data-role="${u.role}" data-tier="${u.tier}" data-self="${isMe ? '1' : '0'}"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <div>
                  <span style="font-size:13px;font-weight:500;">${escapeHtml(u.displayName || u.username)}</span>
                  ${isMe ? '<span style="margin-left:6px;font-size:10px;color:#4ec9b0;">(you)</span>' : ''}
                  <div style="font-size:11px;color:#6a6a8a;">@${escapeHtml(u.username)}</div>
                </div>
                <span style="font-size:10px;color:#6a6a8a;">${formatAdminDate(u.createdAt)}</span>
              </div>
              <div style="display:flex;gap:8px;">
                <div style="flex:1;">
                  <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Role</div>
                  <div class="admin-role-slot" data-userid="${u.id}" style="${isMe ? 'opacity:0.5;pointer-events:none;' : ''}"></div>
                </div>
                <div style="flex:1;">
                  <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Tier</div>
                  <div class="admin-tier-slot" data-userid="${u.id}"></div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;

        // Mount custom selects
        const roleOptions = [
          { value: 'user', label: 'User' },
          { value: 'admin', label: 'Admin' },
        ];
        const tierOptions = tierNames.map(t => ({ value: t, label: t }));

        listEl.querySelectorAll('.admin-role-slot').forEach(slot => {
          const userId = slot.dataset.userid;
          const card = slot.closest('.admin-user-card');
          const currentRole = card.dataset.role;
          const select = createCustomSelect(roleOptions, currentRole, async (val) => {
            try {
              await cloudFetch('PATCH', `/api/admin/users/${userId}`, { role: val });
              showRelayNotification('Role updated', 'info', 2000);
            } catch (e) {
              showRelayNotification(e.message || 'Failed to update role', 'warning', 3000);
              loadAdminPanel();
            }
          });
          select.el.style.width = '100%';
          slot.appendChild(select.el);
        });

        listEl.querySelectorAll('.admin-tier-slot').forEach(slot => {
          const userId = slot.dataset.userid;
          const card = slot.closest('.admin-user-card');
          const currentTier = card.dataset.tier;
          const select = createCustomSelect(tierOptions, currentTier, async (val) => {
            try {
              await cloudFetch('PATCH', `/api/admin/users/${userId}`, { tier: val });
              showRelayNotification('Tier updated', 'info', 2000);
            } catch (e) {
              showRelayNotification(e.message || 'Failed to update tier', 'warning', 3000);
              loadAdminPanel();
            }
          });
          select.el.style.width = '100%';
          slot.appendChild(select.el);
        });

      } catch (e) {
        countEl.textContent = 'Error';
        listEl.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:20px;text-align:center;">Failed to load users: ${escapeHtml(e.message)}</div>`;
      }
    }

    function formatAdminDate(isoStr) {
      if (!isoStr) return '';
      try {
        const d = new Date(isoStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch { return isoStr; }
    }

    // ── Tier Management Panel ──
    async function loadTierManagement() {
      const listEl = contentEl.querySelector('#tier-list');
      const addBtn = contentEl.querySelector('#tier-add-btn');
      const addForm = contentEl.querySelector('#tier-add-form');
      const cancelBtn = contentEl.querySelector('#tier-create-cancel');
      const confirmBtn = contentEl.querySelector('#tier-create-confirm');
      const newNameInput = contentEl.querySelector('#tier-new-name');
      const newAgentsInput = contentEl.querySelector('#tier-new-agents');
      const newPanesInput = contentEl.querySelector('#tier-new-panes');

      // Show/hide add form
      addBtn.addEventListener('click', () => {
        addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
        if (addForm.style.display === 'block') newNameInput.focus();
      });
      cancelBtn.addEventListener('click', () => { addForm.style.display = 'none'; });

      async function refreshList() {
        try {
          const data = await cloudFetch('GET', '/api/admin/tier-configs');
          const configs = data.configs || {};
          renderTierList(configs);
        } catch (e) {
          listEl.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:20px;text-align:center;">Failed to load tiers: ${escapeHtml(e.message)}</div>`;
        }
      }

      function renderTierList(configs) {
        const names = Object.keys(configs).sort();
        if (names.length === 0) {
          listEl.innerHTML = '<div style="font-size:12px;color:#6a6a8a;padding:20px;text-align:center;">No tiers configured</div>';
          return;
        }

        listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
          ${names.map(name => {
            const cfg = configs[name];
            const userCount = cfg.userCount || 0;
            const canDelete = userCount === 0;
            return `<div class="tier-card" data-tier="${escapeHtml(name)}" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <input type="text" class="tier-name-input" data-original="${escapeHtml(name)}" value="${escapeHtml(name)}"
                    style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:13px;font-weight:500;padding:3px 6px;font-family:inherit;width:120px;text-transform:lowercase;" />
                  <span style="font-size:10px;color:#6a6a8a;">${userCount} user${userCount !== 1 ? 's' : ''}</span>
                </div>
                <button class="tier-delete-btn" data-tier="${escapeHtml(name)}" ${canDelete ? '' : 'disabled title="Users are still assigned to this tier"'}
                  style="background:${canDelete ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)'};border:1px solid ${canDelete ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'};color:${canDelete ? '#ef4444' : '#444'};font-size:11px;padding:3px 8px;border-radius:4px;cursor:${canDelete ? 'pointer' : 'not-allowed'};font-family:inherit;">Delete</button>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Agents</div>
                  <input type="number" class="tier-quota-input" data-tier="${escapeHtml(name)}" data-field="agents" value="${cfg.agents}" min="1" max="999"
                    style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:12px;padding:4px 6px;font-family:inherit;box-sizing:border-box;" />
                </div>
                <div>
                  <div style="font-size:10px;color:#6a6a8a;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">Terminal Panes</div>
                  <input type="number" class="tier-quota-input" data-tier="${escapeHtml(name)}" data-field="terminalPanes" value="${cfg.terminalPanes}" min="1" max="999"
                    style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#e0e0e0;font-size:12px;padding:4px 6px;font-family:inherit;box-sizing:border-box;" />
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;

        // Bind quota inputs
        const saveTimers = {};
        listEl.querySelectorAll('.tier-quota-input').forEach(input => {
          input.addEventListener('change', async () => {
            const tier = input.dataset.tier;
            const field = input.dataset.field;
            const val = parseInt(input.value);
            if (isNaN(val)) return;
            try {
              await cloudFetch('PUT', `/api/admin/tier-configs/${tier}`, { [field]: val });
              showRelayNotification(`${tier} ${field} updated`, 'info', 2000);
            } catch (e) {
              showRelayNotification(e.message || 'Failed to update', 'warning', 3000);
              refreshList();
            }
          });
        });

        // Bind rename inputs (on blur)
        listEl.querySelectorAll('.tier-name-input').forEach(input => {
          input.addEventListener('blur', async () => {
            const oldName = input.dataset.original;
            const newName = input.value.toLowerCase().trim();
            if (!newName || newName === oldName) {
              input.value = oldName;
              return;
            }
            try {
              await cloudFetch('PATCH', `/api/admin/tier-configs/${oldName}`, { newName });
              showRelayNotification(`Renamed '${oldName}' to '${newName}'`, 'info', 2000);
              refreshList();
            } catch (e) {
              showRelayNotification(e.message || 'Failed to rename', 'warning', 3000);
              input.value = oldName;
            }
          });
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        });

        // Bind delete buttons
        listEl.querySelectorAll('.tier-delete-btn').forEach(btn => {
          if (btn.disabled) return;
          btn.addEventListener('click', async () => {
            const tier = btn.dataset.tier;
            if (!confirm(`Delete tier '${tier}'? This cannot be undone.`)) return;
            try {
              await cloudFetch('DELETE', `/api/admin/tier-configs/${tier}`);
              showRelayNotification(`Tier '${tier}' deleted`, 'info', 2000);
              refreshList();
            } catch (e) {
              showRelayNotification(e.message || 'Failed to delete', 'warning', 3000);
              refreshList();
            }
          });
        });
      }

      // Bind create button
      confirmBtn.addEventListener('click', async () => {
        const tierName = newNameInput.value.toLowerCase().trim();
        const agents = parseInt(newAgentsInput.value);
        const panes = parseInt(newPanesInput.value);
        if (!tierName) { showRelayNotification('Tier name is required', 'warning', 3000); return; }
        if (isNaN(agents) || agents < 1) { showRelayNotification('Agents must be >= 1', 'warning', 3000); return; }
        if (isNaN(panes) || panes < 1) { showRelayNotification('Terminal panes must be >= 1', 'warning', 3000); return; }
        try {
          await cloudFetch('POST', '/api/admin/tier-configs', { tier: tierName, agents, terminalPanes: panes });
          showRelayNotification(`Tier '${tierName}' created`, 'info', 2000);
          newNameInput.value = '';
          addForm.style.display = 'none';
          refreshList();
        } catch (e) {
          showRelayNotification(e.message || 'Failed to create tier', 'warning', 3000);
        }
      });

      // Initial load
      await refreshList();
    }

    // ── Initial render ──
    switchSection(activeSection);
  }
