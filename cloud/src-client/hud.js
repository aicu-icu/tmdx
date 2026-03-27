  function osIcon(osName) {
    const s = (d) => `<svg class="hud-os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`;
    switch (osName) {
      // Linux: terminal prompt (matches the terminal menu icon style)
      case 'linux':
        return s('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h16V6H4zm2 2l4 4-4 4 1.5 1.5L9 12l-5.5-5.5L2 8zm6 8h6v2h-6v-2z');
      // Windows: four-tile grid
      case 'windows':
        return s('M3 5l8-1.2V12H3V5zm0 8h8v8.2L3 20v-7zm9-9.8L21 2v10h-9V3.2zM12 13h9v9l-9-1.2V13z');
      // macOS: laptop
      case 'macos':
        return s('M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11h1a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1h1V5zm2 0v11h12V5H6zm4 13h4v1h-4v-1z');
      // iOS: phone
      case 'iOS':
        return s('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h10V4H7zm3 14h4v1h-4v-1z');
      // Android: phone with notch
      case 'android':
        return s('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h10V4H7zm2 1h6v1H9V5zm3 13a1 1 0 1 1 0 2 1 1 0 0 1 0-2z');
      // Default: monitor
      default:
        return s('M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6v2h3v2H7v-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v10h16V6H4z');
    }
  }

  function formatBytes(bytes) {
    if (bytes == null) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  function metricColorClass(pct) {
    if (pct >= 100) return 'metric-red';
    if (pct >= 65) return 'metric-yellow';
    if (pct < 30) return 'metric-green';
    return '';
  }

  function createHudContainer() {
    const container = document.createElement('div');
    container.id = 'hud-container';
    document.body.appendChild(container);

    // Restore dot — shown when HUD is fully hidden
    const dot = document.createElement('div');
    dot.id = 'hud-restore-dot';
    dot.addEventListener('click', () => toggleHudHidden());
    document.body.appendChild(dot);

    return container;
  }

  function toggleHudHidden() {
    hudHidden = !hudHidden;
    const container = document.getElementById('hud-container');
    const dot = document.getElementById('hud-restore-dot');
    if (hudHidden) {
      if (container) container.style.display = 'none';
      if (dot) dot.style.display = 'block';
      applyNoHudMode(true);
    } else {
      // Tab+H restores all panes to visible
      fleetPaneHidden = false;
      if (container) container.style.display = '';
      if (dot) dot.style.display = 'none';
      applyPaneVisibility();
      applyNoHudMode(false);
    }
    savePrefsToCloud({ hudState: { fleet_expanded: hudExpanded, hud_hidden: hudHidden } });
  }

  function applyPaneVisibility() {
    const fleet = document.getElementById('hud-overlay');
    if (fleet) fleet.style.display = fleetPaneHidden ? 'none' : '';
  }

  function checkAutoHideHud() {
    // If all panes are individually hidden, auto-collapse to dot
    if (fleetPaneHidden) {
      hudHidden = true;
      const container = document.getElementById('hud-container');
      const dot = document.getElementById('hud-restore-dot');
      if (container) container.style.display = 'none';
      if (dot) dot.style.display = 'block';
      applyNoHudMode(true);
      savePrefsToCloud({ hudState: { fleet_expanded: hudExpanded, hud_hidden: hudHidden } });
    }
  }

  function applyNoHudMode(enabled) {
    const addBtn = document.getElementById('add-pane-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const tutorialBtn = document.getElementById('tutorial-btn');
    const controls = document.getElementById('controls');
    const dot = document.getElementById('hud-restore-dot');
    if (enabled) {
      if (addBtn) addBtn.classList.add('no-hud-mode');
      if (settingsBtn) settingsBtn.classList.add('no-hud-mode');
      if (tutorialBtn) tutorialBtn.classList.add('no-hud-mode');
      if (controls) controls.classList.add('no-hud-mode');
      // Set dot color based on connection status
      updateHudDotColor();
    } else {
      if (addBtn) addBtn.classList.remove('no-hud-mode');
      if (settingsBtn) settingsBtn.classList.remove('no-hud-mode');
      if (tutorialBtn) tutorialBtn.classList.remove('no-hud-mode');
      if (controls) controls.classList.remove('no-hud-mode');
      if (dot) { dot.classList.remove('connected', 'disconnected'); }
    }
  }

  function updateHudDotColor() {
    const dot = document.getElementById('hud-restore-dot');
    if (!dot) return;
    const hasOnline = hudData.devices.some(d => d.online);
    dot.classList.toggle('connected', hasOnline);
    dot.classList.toggle('disconnected', !hasOnline);
  }

  function createHud(container) {
    const hud = document.createElement('div');
    hud.id = 'hud-overlay';
    if (!hudExpanded) hud.classList.add('collapsed');
    hud.innerHTML = `
      <div class="hud-header">
        <span class="hud-title">Machines</span>
        <span class="hud-collapse-dots"></span>
      </div>
      <div class="hud-content"></div>
    `;
    container.appendChild(hud);

    hud.addEventListener('click', (e) => {
      if (e.target.closest('input, button, a, select, textarea')) return;
      // Don't allow collapsing when fleet is empty — keep "Add Machine" visible
      if (hudData.devices.length === 0 && hudExpanded) return;
      hudExpanded = !hudExpanded;
      hud.classList.toggle('collapsed', !hudExpanded);
      savePrefsToCloud({
        hudState: {
          fleet_expanded: hudExpanded,
        }
      });
      restartHudPolling();
      renderHud();
    });

    hud.addEventListener('mouseenter', () => {
      hudIsHovered = true;
      restartHudPolling();
    });
    hud.addEventListener('mouseleave', () => {
      hudIsHovered = false;
      restartHudPolling();
    });

    // Device hover highlight via event delegation (attached once, not per render)
    // Uses mouseover/mouseout + relatedTarget to avoid false clears when
    // moving between child elements inside the same .hud-device card.
    const hudContent = hud.querySelector('.hud-content');
    hudContent.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.hud-device');
      if (!card) return;
      if (hoveredDeviceName === card.dataset.device) return; // already hovering this device
      hoveredDeviceName = card.dataset.device;
      applyDeviceHighlight();
    });
    hudContent.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.hud-device');
      if (!card) return;
      // Only clear if mouse is actually leaving the card, not moving to a child within it
      const relatedCard = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.hud-device') : null;
      if (relatedCard === card) return;
      hoveredDeviceName = null;
      clearDeviceHighlight();
      renderHud(); // Catch up on any skipped renders during hover
    });
  }

  async function pollHud() {
    try {
      const onlineAgents = agents.filter(a => a.online);
      if (onlineAgents.length === 0) return;
      // Fetch metrics from all online agents in parallel
      const results = await Promise.all(
        onlineAgents.map(a => agentRequest('GET', '/api/metrics', null, a.agentId).catch(() => []))
      );
      // Merge all agents' device lists
      hudData.devices = results.flat();
      if (hudHidden) updateHudDotColor();
      // Skip DOM rebuild while hovering a device to prevent flickering;
      // data is still updated above — next render after hover ends picks it up.
      if (!hoveredDeviceName) renderHud();
    } catch (e) {
      // Silent — relay/agent may not be connected yet
    }
  }

  function restartHudPolling() {
    if (hudPollingTimer) clearInterval(hudPollingTimer);
    const rate = (hudExpanded && hudIsHovered) ? HUD_POLL_FAST : HUD_POLL_SLOW;
    hudPollingTimer = setInterval(pollHud, rate);
  }

  function getDevicePaneCounts(deviceName) {
    let terms = 0, files = 0;
    for (const p of state.panes) {
      const pDevice = p.device || hudData.devices.find(d => d.isLocal)?.name;
      if (pDevice !== deviceName) continue;
      if (p.type === 'terminal') {
        terms++;
      } else if (p.type === 'file') {
        files++;
      }
    }
    return { terms, files };
  }

  function renderHud() {
    const content = document.querySelector('#hud-overlay .hud-content');
    const collapseDots = document.querySelector('#hud-overlay .hud-collapse-dots');
    const hudEl = document.getElementById('hud-overlay');
    if (!content) return;

    // When fleet is empty, force expanded so "Add Machine" is always visible
    const fleetEmpty = hudData.devices.length === 0;
    if (fleetEmpty && !hudExpanded) {
      hudExpanded = true;
      if (hudEl) hudEl.classList.remove('collapsed');
    }

    // Build dots HTML for collapsed header
    let dotsHtml = '';
    if (!hudExpanded) {
      for (const device of hudData.devices) {
        const cls = device.online ? 'online' : 'offline';
        dotsHtml += `<span class="hud-dot ${cls}" data-tooltip="${escapeHtml(device.name)}"></span>`;
      }
    }
    if (collapseDots) collapseDots.innerHTML = dotsHtml;

    // Collapsed: nothing in content area
    if (!hudExpanded) {
      content.innerHTML = '';
      return;
    }

    // Expanded — split into active (has panes) and inactive (no panes + phones)
    const PHONE_OS = new Set(['iOS', 'android']);
    const active = [];
    const inactive = [];
    for (const device of hudData.devices) {
      const { terms, files } = getDevicePaneCounts(device.name);
      if (PHONE_OS.has(device.os) || (terms === 0 && files === 0)) {
        inactive.push(device);
      } else {
        active.push(device);
      }
    }

    // Pane count SVG icons (defined once)
    const termSvg = '<svg class="hud-count-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h16V6H4zm2 2l4 4-4 4 1.5 1.5L9 12l-5.5-5.5L2 8zm6 8h6v2h-6v-2z"/></svg>';
    const fileSvg = '<svg class="hud-count-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';

    function renderDeviceCard(device, showMetrics) {
      const online = device.online;
      const dotClass = online ? 'online' : 'offline';
      let icon = osIcon(device.os);
      const deviceColor = getDeviceColor(device.name);
      if (deviceColor) {
        icon = icon.replace('class="hud-os-icon"', `class="hud-os-icon" style="color:${deviceColor.text}"`);
      }
      const { terms, files } = getDevicePaneCounts(device.name);

      let countsHtml = '';
      const counts = [];
      if (terms > 0) counts.push(`<span class="hud-count" data-tooltip="Terminals">${termSvg}${terms}</span>`);
      if (files > 0) counts.push(`<span class="hud-count" data-tooltip="Files">${fileSvg}${files}</span>`);
      if (counts.length) countsHtml = `<span class="hud-counts">${counts.join('')}</span>`;

      // Agent version dot (green = up to date, yellow = outdated)
      let versionDotHtml = '';
      const agentEntry = agents.find(a => a.hostname === device.name || a.agentId === device.ip);
      if (agentEntry?.version && online) {
        const isOutdated = agentUpdates.has(agentEntry.agentId);
        const dotClass2 = isOutdated ? 'hud-version-dot outdated' : 'hud-version-dot current';
        const tooltipText = isOutdated
          ? `v${agentEntry.version} — update available. Re-download: click Add Machine, copy the command, re-run on this machine. Kill the old agent process first.`
          : `v${agentEntry.version} — up to date`;
        versionDotHtml = `<span class="${dotClass2}" data-tooltip="${escapeHtml(tooltipText)}"></span>`;
      }

      let metricsHtml = '';
      if (showMetrics && device.metrics) {
        const m = device.metrics;
        const ramPct = Math.round((m.ram.used / m.ram.total) * 100);
        const ramMax = formatBytes(m.ram.total);
        const ramClass = metricColorClass(ramPct);

        const cpuVal = m.cpu != null ? m.cpu : null;
        const cpuClass = cpuVal != null ? metricColorClass(cpuVal) : '';

        let parts = [];
        parts.push(`<span class="hud-metric ${ramClass}">RAM ${ramPct}% <span class="hud-metric-dim">${ramMax}</span></span>`);
        parts.push(`<span class="hud-metric ${cpuClass}">CPU ${cpuVal != null ? cpuVal + '%' : '...'}</span>`);

        if (m.gpu) {
          const gpuClass = metricColorClass(m.gpu.utilization);
          parts.push(`<span class="hud-metric ${gpuClass}">GPU ${m.gpu.utilization}%</span>`);
        }

        metricsHtml = `<div class="hud-metrics">${parts.join('<span class="hud-metric-sep">·</span>')}</div>`;
      } else if (showMetrics && online) {
        metricsHtml = '<div class="hud-metrics"><span class="hud-metric hud-metric-dim">loading...</span></div>';
      }

      return `
        <div class="hud-device" data-device="${escapeHtml(device.name)}" data-agent-id="${escapeHtml(device.ip)}">
          <div class="hud-device-row">
            <span class="hud-status-dot ${dotClass}"></span>
            ${icon}
            <span class="hud-device-name">${escapeHtml(device.name)}</span>
            ${versionDotHtml}
            ${countsHtml}
            <button class="hud-device-delete" data-agent-id="${escapeHtml(device.ip)}" data-tooltip="Remove machine">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4"/><path d="M12.5 4v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V4"/></svg>
            </button>
          </div>
          ${metricsHtml}
        </div>
      `;
    }

    let html = '';

    if (fleetEmpty) {
      // Empty fleet — show prominent "Add Machine" as the default view
      html += `<div style="text-align:center;padding:12px 8px 4px;">
        <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-bottom:10px;">No machines connected</div>
        <button class="add-machine-fleet-btn" style="width:100%;padding:8px 12px;background:#4ec9b0;border:none;color:#0a0a1a;border-radius:4px;cursor:pointer;font-family:monospace;font-size:12px;font-weight:600;transition:opacity 0.15s;">+ Add Machine</button>
      </div>`;
    } else {
      for (const device of active) {
        html += renderDeviceCard(device, !PHONE_OS.has(device.os));
      }

      if (inactive.length > 0) {
        html += '<div class="hud-section-sep"></div>';
        for (const device of inactive) {
          html += renderDeviceCard(device, !PHONE_OS.has(device.os));
        }
      }

      // Add "Add Machine" button at the bottom of the Machines HUD
      html += `<button class="add-machine-fleet-btn" style="width:100%;margin-top:8px;padding:6px;background:transparent;border:1px solid #4ec9b0;color:#4ec9b0;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;transition:background 0.15s,color 0.15s;">+ Add Machine</button>`;
    }

    content.innerHTML = html;

    const addBtn = content.querySelector('.add-machine-fleet-btn');
    if (addBtn) {
      addBtn.addEventListener('click', showAddMachineDialog);
      // Apply pulse animation if no agents are online
      if (window.__pulseAddMachine) addBtn.classList.add('pulsing');
      if (fleetEmpty) {
        // Filled button style for empty fleet
        addBtn.addEventListener('mouseenter', () => { addBtn.style.opacity = '0.8'; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.opacity = '1'; });
      } else {
        // Outline button style when devices exist
        addBtn.addEventListener('mouseenter', () => { addBtn.style.background = '#4ec9b0'; addBtn.style.color = '#0a0a1a'; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.background = 'transparent'; addBtn.style.color = '#4ec9b0'; });
      }
    }

    // Device color picker — click a device card to show swatches
    function showSwatchesForCard(card) {
      const deviceName = card.dataset.device;
      const row = document.createElement('div');
      row.className = 'device-color-swatches';
      row.style.cssText = 'display:flex; gap:4px; padding:4px 0 2px 20px; flex-wrap:wrap;';
      DEVICE_COLORS.forEach((c, idx) => {
        const swatch = document.createElement('span');
        swatch.style.cssText = `width:16px; height:16px; border-radius:4px; cursor:pointer; background:${c.bg}; border:2px solid ${c.border}; transition:transform 0.1s;`;
        // Highlight current selection
        const currentIdx = deviceColorOverrides[deviceName];
        if (currentIdx === idx) swatch.style.outline = '2px solid rgba(255,255,255,0.6)';
        swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.3)'; });
        swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
        swatch.addEventListener('click', (ev) => {
          ev.stopPropagation();
          deviceColorOverrides[deviceName] = idx;
          savePrefsToCloud({
            hudState: {
              fleet_expanded: hudExpanded,
              device_colors: deviceColorOverrides,
            }
          });
          renderHud();
          // Re-render pane headers with new device color
          for (const p of state.panes) {
            if (p.device === deviceName) {
              const paneEl = document.getElementById(`pane-${p.id}`);
              if (paneEl) applyDeviceHeaderColor(paneEl, deviceName);
            }
          }
        });
        row.appendChild(swatch);
      });
      card.appendChild(row);
    }

    // Delete machine buttons
    content.querySelectorAll('.hud-device-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const agentId = btn.dataset.agentId;
        const agentEntry = agents.find(a => a.agentId === agentId);
        if (!agentEntry) return;
        const deviceName = agentEntry.displayName || agentEntry.hostname || agentId;

        if (!confirm(`Remove "${deviceName}" and all its panes? This cannot be undone.`)) return;

        try {
          await cloudFetch('DELETE', `/api/agents/${agentEntry.agentId}`);

          // Remove all panes belonging to this agent
          const agentPanes = state.panes.filter(p => p.agentId === agentEntry.agentId || p.device === deviceName);
          for (const pane of agentPanes) {
            const paneEl = document.getElementById(`pane-${pane.id}`);
            if (paneEl) paneEl.remove();
            // Clean up terminal instances
            const termInfo = terminals.get(pane.id);
            if (termInfo) {
              termInfo.xterm.dispose();
              terminals.delete(pane.id);
              termDeferredBuffers.delete(pane.id);
            }
            // Clean up editor instances
            const editorInfo = fileEditors.get(pane.id);
            if (editorInfo) {
              if (editorInfo.monacoEditor) editorInfo.monacoEditor.dispose();
              if (editorInfo.resizeObserver) editorInfo.resizeObserver.disconnect();
              if (editorInfo.refreshInterval) clearInterval(editorInfo.refreshInterval);
              if (editorInfo.labelInterval) clearInterval(editorInfo.labelInterval);
              fileEditors.delete(pane.id);
            }
            const noteInfo = noteEditors.get(pane.id);
            if (noteInfo) {
              if (noteInfo.monacoEditor) noteInfo.monacoEditor.dispose();
              if (noteInfo.resizeObserver) noteInfo.resizeObserver.disconnect();
              noteEditors.delete(pane.id);
            }
            const ggInfo = gitGraphPanes.get(pane.id);
            if (ggInfo?.refreshInterval) clearInterval(ggInfo.refreshInterval);
            gitGraphPanes.delete(pane.id);
            const fpInfo = folderPanes.get(pane.id);
            if (fpInfo?.refreshInterval) clearInterval(fpInfo.refreshInterval);
            folderPanes.delete(pane.id);
          }
          state.panes = state.panes.filter(p => p.agentId !== agentEntry.agentId);

          // Remove agent from local state
          agents = agents.filter(a => a.agentId !== agentEntry.agentId);
          hudData.devices = hudData.devices.filter(d => d.ip !== agentId);
          renderHud();
        } catch (err) {
          console.error('[App] Failed to delete machine:', err);
          alert('Failed to remove machine. Please try again.');
        }
      });
    });

    // Double-click device name to rename
    content.querySelectorAll('.hud-device-name').forEach(nameEl => {
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const card = nameEl.closest('.hud-device');
        if (!card) return;
        const agentId = card.dataset.agentId;
        const agentEntry = agents.find(a => a.agentId === agentId);
        if (!agentEntry) return;

        // Prevent multiple inputs
        if (card.querySelector('.hud-device-name-input')) return;

        const input = document.createElement('input');
        input.className = 'hud-device-name-input';
        input.type = 'text';
        input.value = agentEntry.displayName || agentEntry.hostname || '';
        input.placeholder = agentEntry.hostname || 'Name';
        input.maxLength = 50;
        input.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,235,150,0.5);color:#fff;font-size:11px;font-family:monospace;padding:1px 4px;border-radius:3px;width:100px;outline:none;';

        nameEl.style.display = 'none';
        nameEl.parentNode.insertBefore(input, nameEl.nextSibling);
        input.focus();
        input.select();

        const commit = async () => {
          const val = input.value.trim();
          input.remove();
          nameEl.style.display = '';

          // If cleared or same as hostname, set to null (revert to hostname)
          const newDisplayName = (val && val !== agentEntry.hostname) ? val : null;
          if (newDisplayName === (agentEntry.displayName || null)) return; // No change

          try {
            await cloudFetch('PATCH', `/api/agents/${agentId}`, { displayName: newDisplayName || '' });
            agentEntry.displayName = newDisplayName;
            nameEl.textContent = newDisplayName || agentEntry.hostname || agentId;
            card.dataset.device = nameEl.textContent;
            // Update hudData too
            const hudDevice = hudData.devices.find(d => d.ip === agentId);
            if (hudDevice) hudDevice.name = nameEl.textContent;
          } catch (err) {
            console.error('[App] Failed to rename machine:', err);
          }
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
          if (ke.key === 'Escape') {
            input.value = agentEntry.displayName || agentEntry.hostname || '';
            input.blur();
          }
          ke.stopPropagation();
        });
        input.addEventListener('mousedown', (me) => me.stopPropagation());
      });
    });

    content.querySelectorAll('.hud-device').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const deviceName = card.dataset.device;
        // Toggle: if swatches already shown, close them
        if (card.querySelector('.device-color-swatches')) {
          deviceSwatchOpenFor = null;
          card.querySelector('.device-color-swatches').remove();
          return;
        }
        // Remove any other open swatches
        content.querySelectorAll('.device-color-swatches').forEach(el => el.remove());
        deviceSwatchOpenFor = deviceName;
        showSwatchesForCard(card);
      });
      // Restore swatches if this card was open before re-render
      if (deviceSwatchOpenFor && card.dataset.device === deviceSwatchOpenFor) {
        showSwatchesForCard(card);
      }
    });

    // Re-apply highlight if mouse is still over a device after re-render
    if (hoveredDeviceName) {
      applyDeviceHighlight();
    }
  }

  function applyDeviceHighlight() {
    if (!hoveredDeviceName) return;
    if (quickViewActive) return; // QV already has its own overlays
    const localDevice = hudData.devices.find(d => d.isLocal)?.name;
    const deviceColor = getDeviceColor(hoveredDeviceName);
    const rgb = deviceColor ? deviceColor.rgb : '96,165,250';

    deviceHoverActive = true;

    document.querySelectorAll('.pane').forEach(paneEl => {
      const paneData = state.panes.find(p => p.id === paneEl.dataset.paneId);
      if (!paneData) return;

      // Add QV-style overlay with device/path/icon info
      addQuickViewOverlay(paneEl, paneData);

      // Highlight panes matching the hovered device with device color
      if (paneData.type !== 'note') {
        const paneDevice = paneData.device || localDevice;
        if (paneDevice === hoveredDeviceName) {
          paneEl.classList.add('device-highlighted');
          paneEl.style.boxShadow = `0 0 20px rgba(${rgb},0.4), 0 0 50px rgba(${rgb},0.15), inset 0 0 20px rgba(${rgb},0.08)`;
          paneEl.style.borderColor = `rgba(${rgb},0.5)`;
        }
      }
    });

    // Remove focused state like QV does
    document.querySelectorAll('.pane.focused').forEach(p => p.classList.remove('focused'));
  }

  function clearDeviceHighlight() {
    deviceHoverActive = false;
    // Only remove overlays if QV isn't also active (they share the same overlay class)
    if (!quickViewActive) {
      document.querySelectorAll('.quick-view-overlay').forEach(o => o.remove());
      document.querySelectorAll('.pane.qv-hover').forEach(p => p.classList.remove('qv-hover'));
    }
    document.querySelectorAll('.pane').forEach(paneEl => {
      paneEl.classList.remove('device-highlighted', 'device-dimmed');
      paneEl.style.boxShadow = '';
      paneEl.style.borderColor = '';
    });
  }

  function applyTerminalTheme(themeKey) {
    const theme = TERMINAL_THEMES[themeKey];
    if (!theme) return;
    currentTerminalTheme = themeKey;
    // Apply to all existing terminals
    terminals.forEach(({ xterm }) => {
      xterm.options.theme = { ...theme };
    });
  }

  // Initialize
  async function init() {

    // Auth check
    try {
      const authRes = await fetch('/auth/me', { credentials: 'include' });
      if (authRes.status === 401) {
        window.location.href = '/login';
        return;
      }
      const currentUser = await authRes.json();
      window.__tcUser = currentUser;
    } catch (e) {
      // If auth check fails, continue anyway (might be local dev mode)
      console.warn('[App] Auth check failed:', e);
    }

    // Load cloud preferences (night mode, theme, sound)
    try {
      const prefs = await cloudFetch('GET', '/api/preferences');
      if (prefs.nightMode) setNightMode(true);
      if (prefs.terminalTheme && TERMINAL_THEMES[prefs.terminalTheme]) {
        currentTerminalTheme = prefs.terminalTheme;
      }
      if (prefs.notificationSound !== undefined) {
        notificationSoundEnabled = prefs.notificationSound;
      }
      if (prefs.autoRemoveDone !== undefined) {
        autoRemoveDoneNotifs = prefs.autoRemoveDone;
      }
      if (prefs.canvasBg) setCanvasBackground(prefs.canvasBg);
      if (prefs.snoozeDuration) {
        snoozeDurationMs = prefs.snoozeDuration * 1000;
      }
      if (prefs.terminalFont) {
        applyTerminalFont(prefs.terminalFont);
      }
      if (prefs.focusMode) {
        focusMode = prefs.focusMode;
      }
      if (prefs.hudState) {
        hudExpanded = !!prefs.hudState.fleet_expanded;
        if (prefs.hudState.device_colors) deviceColorOverrides = prefs.hudState.device_colors;
        hudHidden = !!prefs.hudState.hud_hidden;
      }
      if (prefs.tutorialsCompleted) {
        tutorialsCompleted = prefs.tutorialsCompleted;
      }
    } catch (e) {
      console.error('[App] Preferences load failed:', e.message);
      showRelayNotification('设置加载失败，已使用默认设置', 'warning', 3000);
    }

    // xterm.js is loaded via ESM import at top of file

    canvas = document.getElementById('canvas');
    canvasContainer = document.getElementById('canvas-container');

    // Selection rectangle for shift+drag broadcast selection
    const selectionRect = document.createElement('div');
    selectionRect.id = 'selection-rect';
    canvas.appendChild(selectionRect);

    // Start minimap render loop (check persisted collapse state first)
    try {
      if (localStorage.getItem('minimap-collapsed') === 'true') {
        minimapCollapsed = true;
        document.getElementById('minimap-expand').style.display = 'flex';
      }
    } catch (_) {}
    if (!minimapCollapsed) {
      startMinimapLoop();
    }

    // Delegated click handler for disconnect overlay action buttons
    canvas.addEventListener('click', (e) => {
      const btn = e.target.closest('.disconnect-action-btn');
      if (!btn) return;
      const paneId = btn.dataset.paneId;
      if (!paneId) return;
      resumeTerminalPane(paneId);
    });

    updateCanvasTransform();
    setupEventListeners();
    initNotifications();
    connectWebSocket();
    // loadTerminalsFromServer is called after agents:list arrives via WS

    const hudContainer = createHudContainer();
    createHud(hudContainer);
    // Apply HUD hidden state from preferences
    if (hudHidden) {
      hudContainer.style.display = 'none';
      const dot = document.getElementById('hud-restore-dot');
      if (dot) dot.style.display = 'block';
      applyNoHudMode(true);
    }
    pollHud();
    restartHudPolling();
    // Re-render every 5s to keep pane counts fresh (1s caused Firefox freeze from DOM thrashing)
    hudRenderTimer = setInterval(renderHud, 5000);

    // Redirect first-time users to the interactive tutorial
    // Skip if server-side prefs already show completion (returning user, new device)
    const tutorialState = localStorage.getItem('tc_tutorial');
    if (!tutorialState && !tutorialsCompleted['getting-started']) {
      window.location.href = '/tutorial';
      return;
    }
    // Sync localStorage if server says completed but local doesn't know
    if (!tutorialState && tutorialsCompleted['getting-started']) {
      try { localStorage.setItem('tc_tutorial', 'completed'); } catch (e) {}
    }

  }
