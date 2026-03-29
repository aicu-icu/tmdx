  // Show device picker then git repo picker
  async function showGitRepoPickerWithDevice(placementPos) {
    showDevicePickerGeneric(
      (d) => showGitRepoPicker(d.name, placementPos, false, d.ip),
      () => showGitRepoPicker(undefined, placementPos)
    );
  }

  // Show folder browser then repo picker for git graph pane
  async function showGitRepoPicker(device, placementPos, thenPlace = false, targetAgentId) {
    const deviceLabel = device ? deviceLabelHtml(device, 'font-size:11px; padding:2px 8px;') : '';
    const headerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" style="color:rgba(255,255,255,0.6);">${ICON_GIT_GRAPH}</svg>
      ${deviceLabel}
      <span style="color:rgba(255,255,255,0.7); font-size:13px; font-weight:500;">Choose Folder</span>`;

    let masterOnly = true;

    showFolderScanPicker({
      id: 'git-repo-browser',
      headerHTML,
      scanLabel: 'Scan this folder for repos',
      device,
      targetAgentId,
      onScan: async (folderPath, contentArea, closeBrowser, navigateFolder, navRefresh) => {
        // Set up progressive UI immediately
        contentArea.innerHTML = '';
        const allRepos = [];
        let scanDone = false;

        // Toggle bar (back + master/main filter)
        const toggleBar = document.createElement('div');
        toggleBar.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 16px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0;';

        const backBtn = document.createElement('button');
        backBtn.setAttribute('data-nav-item', '');
        backBtn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:12px; padding:2px 6px; border-radius:3px;';
        backBtn.textContent = '\u2190 Back';
        backBtn.addEventListener('click', () => navigateFolder(folderPath));
        backBtn.addEventListener('mouseenter', () => { backBtn.style.color = '#fff'; });
        backBtn.addEventListener('mouseleave', () => { backBtn.style.color = 'rgba(255,255,255,0.5)'; });
        toggleBar.appendChild(backBtn);

        const scanStatus = document.createElement('span');
        scanStatus.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.3); margin-left:4px;';
        scanStatus.textContent = 'Scanning...';
        toggleBar.appendChild(scanStatus);

        const spacer = document.createElement('div');
        spacer.style.cssText = 'flex:1;';
        toggleBar.appendChild(spacer);

        const toggleWrap = document.createElement('label');
        toggleWrap.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;';

        const toggleTrack = document.createElement('div');
        toggleTrack.style.cssText = `width:32px; height:18px; border-radius:9px; position:relative; transition:background 0.2s; ${masterOnly ? 'background:rgba(255,255,255,0.15);' : 'background:rgba(var(--accent-rgb),0.6);'}`;

        const toggleThumb = document.createElement('div');
        toggleThumb.style.cssText = `width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; transition:left 0.2s; ${masterOnly ? 'left:2px;' : 'left:16px;'}`;
        toggleTrack.appendChild(toggleThumb);

        const toggleLabel = document.createElement('span');
        toggleLabel.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.5);';
        toggleLabel.textContent = masterOnly ? 'master/main only' : 'all branches';

        toggleWrap.appendChild(toggleTrack);
        toggleWrap.appendChild(toggleLabel);
        toggleWrap.addEventListener('click', (e) => {
          e.preventDefault();
          masterOnly = !masterOnly;
          toggleTrack.style.background = masterOnly ? 'rgba(255,255,255,0.15)' : 'rgba(var(--accent-rgb),0.6)';
          toggleThumb.style.left = masterOnly ? '2px' : '16px';
          toggleLabel.textContent = masterOnly ? 'master/main only' : 'all branches';
          rebuildRepoList();
        });
        toggleBar.appendChild(toggleWrap);
        contentArea.appendChild(toggleBar);

        const repoListEl = document.createElement('div');
        repoListEl.style.cssText = 'overflow-y:auto; flex:1;';
        contentArea.appendChild(repoListEl);

        function makeRepoItem(repo) {
          const item = document.createElement('div');
          item.setAttribute('data-nav-item', '');
          item.style.cssText = 'display:flex; align-items:center; gap:10px; padding:9px 16px; cursor:pointer; transition:background 0.1s; font-size:13px;';
          const branchColor = (repo.branch === 'master' || repo.branch === 'main') ? '#4ec9b0' : '#b392f0';
          item.innerHTML = `
            <span style="color:#f97583; font-size:14px;">&#9679;</span>
            <span style="flex:1; overflow:hidden;">
              <strong style="color:rgba(255,255,255,0.9);">${escapeHtml(repo.name)}</strong><br>
              <span style="opacity:0.4; font-size:11px;">${escapeHtml(repo.path)}</span>
            </span>
            <span style="color:${branchColor}; font-size:11px; white-space:nowrap;">${escapeHtml(repo.branch)}</span>
          `;
          item.addEventListener('click', () => {
            closeBrowser();
            if (thenPlace) {
              enterPlacementMode('git-graph', (pos) => createGitGraphPane(repo.path, device, pos, targetAgentId));
            } else {
              createGitGraphPane(repo.path, device, placementPos, targetAgentId);
            }
          });
          item.addEventListener('mouseenter', () => { item.style.background = 'rgba(var(--accent-rgb),0.15)'; });
          item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
          return item;
        }

        function shouldShow(repo) {
          return !masterOnly || repo.branch === 'master' || repo.branch === 'main';
        }

        function rebuildRepoList() {
          repoListEl.innerHTML = '';
          const filtered = allRepos.filter(shouldShow);
          if (filtered.length === 0 && scanDone) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px; text-align:center; color:rgba(255,255,255,0.3); font-size:12px;';
            empty.textContent = masterOnly ? 'No repos on master/main in this folder' : 'No git repos found in this folder';
            repoListEl.appendChild(empty);
          }
          for (const repo of filtered) repoListEl.appendChild(makeRepoItem(repo));
          if (navRefresh) navRefresh();
        }

        function appendRepo(repo) {
          scanStatus.textContent = `Scanning... (${allRepos.length} found)`;
          if (shouldShow(repo)) {
            repoListEl.appendChild(makeRepoItem(repo));
            if (navRefresh) navRefresh();
          }
        }

        try {
          const deviceParam = device ? `&device=${encodeURIComponent(device)}` : '';
          const finalRepos = await agentRequest('GET', `/api/git-repos/in-folder?path=${encodeURIComponent(folderPath)}${deviceParam}`, null, targetAgentId, {
            onPartial: (repos) => {
              for (const repo of repos) {
                allRepos.push(repo);
                appendRepo(repo);
              }
            }
          });
          scanDone = true;
          // Use final complete list (authoritative) and rebuild
          allRepos.length = 0;
          allRepos.push(...finalRepos);
          scanStatus.textContent = `${allRepos.length} repos`;
          rebuildRepoList();
        } catch (e) {
          contentArea.innerHTML = `<div style="padding:20px; text-align:center; color:#f44747; font-size:12px;">Error: ${escapeHtml(e.message)}</div>`;
        }
      }
    });
  }
  async function createGitGraphPane(repoPath, device, placementPos, targetAgentId) {
    const resolvedAgentId = targetAgentId || activeAgentId;

    const position = calcPlacementPos(placementPos, 250, 225);

    try {
      const reqBody = { repoPath, position, size: PANE_DEFAULTS['git-graph'] };
      if (device) reqBody.device = device;
      const ggPane = await agentRequest('POST', '/api/git-graphs', reqBody, resolvedAgentId);

      const pane = {
        id: ggPane.id,
        type: 'git-graph',
        x: ggPane.position.x,
        y: ggPane.position.y,
        width: ggPane.size.width,
        height: ggPane.size.height,
        zIndex: state.nextZIndex++,
        repoPath: ggPane.repoPath,
        repoName: ggPane.repoName,
        device: device || ggPane.device,
        agentId: resolvedAgentId
      };

      state.panes.push(pane);
      renderGitGraphPane(pane);
      cloudSaveLayout(pane);

    } catch (e) {
      console.error('[App] Failed to create git graph pane:', e);
      alert('Failed to create git graph pane: ' + e.message);
    }
  }

  function renderGitGraphPane(paneData) {
    const existingPane = document.getElementById(`pane-${paneData.id}`);
    if (existingPane) {
      existingPane.remove();
    }

    const pane = document.createElement('div');
    pane.className = 'pane git-graph-pane';
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
        <span class="pane-title git-graph-title">
          ${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_GIT_GRAPH}</svg>
          ${paneData.repoName || 'Git Graph'}
        </span>
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
        <div class="git-graph-container">
          <div class="git-graph-header">
            <span class="git-graph-branch"></span>
            <span class="git-graph-status"></span>
            <button class="git-graph-push-btn" data-tooltip="Push to remote"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push</button>
          </div>
          <div class="git-graph-output"><span class="git-graph-loading">Loading git graph...</span></div>
        </div>
      </div>
      <div class="pane-resize-handle"></div>
    `;

    setupPaneListeners(pane, paneData);
    setupGitGraphListeners(pane, paneData);
    canvas.appendChild(pane);

    // Initial data fetch
    fetchGitGraphData(pane, paneData);
  }

  function setupGitGraphListeners(paneEl, paneData) {
    const graphOutput = paneEl.querySelector('.git-graph-output');
    const pushBtn = paneEl.querySelector('.git-graph-push-btn');

    // Push to remote button
    pushBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      pushBtn.disabled = true;
      pushBtn.textContent = 'Pushing…';
      pushBtn.classList.add('pushing');
      try {
        const data = await agentRequest('POST', `/api/git-graphs/${paneData.id}/push`, null, paneData.agentId);
        pushBtn.textContent = 'Pushed!';
        pushBtn.classList.add('push-success');
        // Refresh the graph to show updated remote indicators
        fetchGitGraphData(paneEl, paneData);
      } catch (err) {
        pushBtn.textContent = 'Failed';
        pushBtn.classList.add('push-failed');
        showErrorToast('Git push failed: ' + err.message);
      }
      setTimeout(() => {
        pushBtn.disabled = false;
        pushBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push';
        pushBtn.classList.remove('pushing', 'push-success', 'push-failed');
      }, 2000);
    });

    // Allow scrolling inside the graph output
    graphOutput.addEventListener('mousedown', (e) => e.stopPropagation());
    graphOutput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    graphOutput.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Auto-refresh every 5 seconds
    const refreshInterval = setInterval(() => {
      fetchGitGraphData(paneEl, paneData);
    }, 5000);

    gitGraphPanes.set(paneData.id, { refreshInterval });
  }

  // ---------------------------------------------------------------------------
  // SVG Git Graph Renderer
  // ---------------------------------------------------------------------------
  const GG = {
    ROW_H: 28,        // height per commit row
    LANE_W: 16,       // horizontal spacing between lanes
    NODE_R: 4,        // commit dot radius
    LEFT_PAD: 12,     // left padding before first lane
    COLORS: [
      '#85e89d', // green  (master/main)
      '#79b8ff', // blue
      '#b392f0', // purple
      '#ffab70', // orange
      '#f97583', // red
      '#4ec9b0', // teal
      '#d1bcf9', // light purple
      '#ffd33d', // yellow
    ],
  };

  /**
   * Assign each commit a lane (column) and resolve branch colors.
   * Returns { lanes: Map<hash, lane>, maxLane, branchColors: Map<lane, colorIdx> }
   */
  function assignLanes(commits) {
    const hashIndex = new Map();
    commits.forEach((c, i) => hashIndex.set(c.hash, i));

    const lanes = new Map();       // hash -> lane number
    const activeLanes = [];        // activeLanes[lane] = hash that "owns" this lane (or null if free)
    let maxLane = 0;
    const branchColors = new Map(); // lane -> color index
    let nextColor = 1;             // 0 reserved for master/main

    // Detect which commit is master/main HEAD
    let masterHash = null;
    for (const c of commits) {
      if (c.refs && (/HEAD -> main\b/.test(c.refs) || /HEAD -> master\b/.test(c.refs))) {
        masterHash = c.hash;
        break;
      }
    }

    for (const commit of commits) {
      let lane = -1;

      // Check if any active lane expects this commit (i.e. it was set as the target)
      for (let i = 0; i < activeLanes.length; i++) {
        if (activeLanes[i] === commit.hash) {
          lane = i;
          break;
        }
      }

      // If no lane claimed this commit, find the first free lane
      if (lane === -1) {
        for (let i = 0; i < activeLanes.length; i++) {
          if (activeLanes[i] === null) { lane = i; break; }
        }
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(null);
        }
      }

      lanes.set(commit.hash, lane);
      if (lane > maxLane) maxLane = lane;

      // Assign color for this lane if not yet assigned
      if (!branchColors.has(lane)) {
        if (commit.hash === masterHash) {
          branchColors.set(lane, 0);
        } else {
          branchColors.set(lane, nextColor);
          nextColor = (nextColor + 1) % GG.COLORS.length;
          if (nextColor === 0) nextColor = 1; // skip master color
        }
      }

      // Free this lane since we've consumed the commit
      activeLanes[lane] = null;

      // Assign parents to lanes
      if (commit.parents.length > 0) {
        const firstParent = commit.parents[0];
        // First parent continues in the same lane
        if (hashIndex.has(firstParent) && !lanes.has(firstParent)) {
          // Check if another lane already claims this parent
          const existingLane = activeLanes.indexOf(firstParent);
          if (existingLane === -1) {
            activeLanes[lane] = firstParent;
          }
        }

        // Additional parents (merges) get new or existing lanes
        for (let p = 1; p < commit.parents.length; p++) {
          const parentHash = commit.parents[p];
          if (!hashIndex.has(parentHash)) continue;
          if (lanes.has(parentHash)) continue;

          // Check if an active lane already targets this parent
          const existing = activeLanes.indexOf(parentHash);
          if (existing !== -1) continue;

          // Find a free lane for this merge parent
          let mergeLane = -1;
          for (let i = 0; i < activeLanes.length; i++) {
            if (activeLanes[i] === null) { mergeLane = i; break; }
          }
          if (mergeLane === -1) {
            mergeLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[mergeLane] = parentHash;
          if (mergeLane > maxLane) maxLane = mergeLane;
          if (!branchColors.has(mergeLane)) {
            branchColors.set(mergeLane, nextColor);
            nextColor = (nextColor + 1) % GG.COLORS.length;
            if (nextColor === 0) nextColor = 1;
          }
        }
      }
    }

    return { lanes, maxLane, branchColors };
  }

  /**
   * Format relative time from unix timestamp
   */
  function gitRelativeTime(ts) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return '1m';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  /**
   * Render commits into the outputEl as an SVG graph + HTML rows.
   */
  function renderSvgGitGraph(outputEl, commits, currentBranch) {
    if (!commits || commits.length === 0) {
      outputEl.innerHTML = '<span class="git-graph-loading">No commits found</span>';
      return;
    }

    const { lanes, maxLane, branchColors } = assignLanes(commits);
    const svgWidth = GG.LEFT_PAD + (maxLane + 1) * GG.LANE_W + 8;
    const totalHeight = commits.length * GG.ROW_H;

    // Build SVG paths for connections and nodes
    const paths = [];  // { d, color } for connection lines
    const nodes = [];  // { cx, cy, color, hash }
    const hashIndex = new Map();
    commits.forEach((c, i) => hashIndex.set(c.hash, i));

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const lane = lanes.get(commit.hash);
      const colorIdx = branchColors.get(lane) ?? 1;
      const color = GG.COLORS[colorIdx];
      const cx = GG.LEFT_PAD + lane * GG.LANE_W;
      const cy = i * GG.ROW_H + GG.ROW_H / 2;

      nodes.push({ cx, cy, color, hash: commit.hash });

      // Draw connections to parents
      for (const parentHash of commit.parents) {
        const pi = hashIndex.get(parentHash);
        if (pi === undefined) continue;
        const parentLane = lanes.get(parentHash);
        if (parentLane === undefined) continue;
        const parentColorIdx = branchColors.get(parentLane) ?? 1;
        const px = GG.LEFT_PAD + parentLane * GG.LANE_W;
        const py = pi * GG.ROW_H + GG.ROW_H / 2;

        let d;
        if (lane === parentLane) {
          // Straight vertical line
          d = `M${cx} ${cy} L${px} ${py}`;
        } else {
          // Bezier curve for merge/branch connections
          const midY = cy + GG.ROW_H * 0.8;
          d = `M${cx} ${cy} C${cx} ${midY}, ${px} ${py - GG.ROW_H * 0.8}, ${px} ${py}`;
        }
        // Use the color of the branch being merged from
        const lineColor = lane !== parentLane ? GG.COLORS[parentColorIdx] : color;
        paths.push({ d, color: lineColor });
      }
    }

    // Also draw vertical continuation lines for active lanes between commits
    // This fills gaps where a lane is active but the commit isn't on that lane
    for (let i = 0; i < commits.length - 1; i++) {
      const commit = commits[i];
      const nextCommit = commits[i + 1];
      const y1 = i * GG.ROW_H + GG.ROW_H / 2;
      const y2 = (i + 1) * GG.ROW_H + GG.ROW_H / 2;

      // For each parent of the current commit, if the parent is further down than i+1,
      // we may need continuation lines. But the parent connections already handle this
      // via straight/bezier lines. The issue is when a lane passes *through* a row
      // without a commit on it. We handle this by checking all active connections.
    }

    // Build SVG
    const svgPaths = paths.map(p =>
      `<path d="${p.d}" stroke="${p.color}" stroke-width="2" fill="none" stroke-opacity="0.7"/>`
    ).join('');
    const svgNodes = nodes.map(n =>
      `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.NODE_R}" fill="${n.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`
    ).join('');

    // Build commit rows HTML
    const rowsHtml = commits.map((commit, i) => {
      const lane = lanes.get(commit.hash);
      const colorIdx = branchColors.get(lane) ?? 1;
      const color = GG.COLORS[colorIdx];
      const timeStr = commit.timestamp ? gitRelativeTime(commit.timestamp) : '';

      // Parse refs for display
      let refsHtml = '';
      if (commit.refs) {
        const refParts = commit.refs.split(',').map(r => r.trim()).filter(Boolean);
        for (const ref of refParts) {
          if (ref.startsWith('HEAD -> ')) {
            const brName = escapeHtml(ref.replace('HEAD -> ', ''));
            refsHtml += `<span class="gg-ref gg-ref-head">${brName}</span>`;
          } else if (ref.startsWith('tag: ')) {
            const tagName = escapeHtml(ref.replace('tag: ', ''));
            refsHtml += `<span class="gg-ref gg-ref-tag">${tagName}</span>`;
          } else if (ref.startsWith('origin/')) {
            const remoteName = escapeHtml(ref);
            refsHtml += `<span class="gg-ref gg-ref-remote">${remoteName}</span>`;
          } else {
            refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
          }
        }
      }

      const subject = escapeHtml(commit.subject || '');
      const author = escapeHtml(commit.author || '');

      return `<div class="gg-row" data-hash="${commit.hash}" style="height:${GG.ROW_H}px">
        <div class="gg-graph-spacer" style="width:${svgWidth}px"></div>
        <div class="gg-info">
          <span class="gg-hash" style="color:${color}">${commit.hash}</span>
          <span class="gg-time">${timeStr}</span>
          ${refsHtml}
          <span class="gg-subject">${subject}</span>
          <span class="gg-author">${author}</span>
        </div>
      </div>`;
    }).join('');

    outputEl.innerHTML = `
      <div class="gg-scroll-container">
        <svg class="gg-svg" width="${svgWidth}" height="${totalHeight}"
             viewBox="0 0 ${svgWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
          ${svgPaths}
          ${svgNodes}
        </svg>
        <div class="gg-rows">${rowsHtml}</div>
      </div>`;
  }

  async function fetchGitGraphData(paneEl, paneData) {
    try {
      const outputEl = paneEl.querySelector('.git-graph-output');
      const maxCommits = 200;
      const data = await agentRequest('GET', `/api/git-graphs/${paneData.id}/data?maxCommits=${maxCommits}`, null, paneData.agentId);

      const branchEl = paneEl.querySelector('.git-graph-branch');
      const statusEl = paneEl.querySelector('.git-graph-status');

      if (data.error) {
        outputEl.innerHTML = `<span class="git-graph-error">Error: ${data.error}</span>`;
        return;
      }

      branchEl.innerHTML = `<span class="git-graph-branch-name">${escapeHtml(data.branch)}</span>`;

      if (data.clean) {
        statusEl.innerHTML = '<span class="git-graph-clean">&#x25cf; clean</span>';
      } else {
        const u = data.uncommitted;
        const details = [];
        if (u.staged > 0) details.push(`<span class="git-detail-staged">\u2713${u.staged}</span>`);
        if (u.unstaged > 0) details.push(`<span class="git-detail-modified">\u270E${u.unstaged}</span>`);
        if (u.untracked > 0) details.push(`<span class="git-detail-new">+${u.untracked}</span>`);
        const detailHtml = details.length ? `<span class="git-graph-detail">${details.join(' ')}</span>` : '';
        statusEl.innerHTML = `<span class="git-graph-dirty">&#x25cf; ${u.total} uncommitted</span>${detailHtml}`;
      }

      // Render SVG graph (supports both new structured data and old graphHtml fallback)
      if (data.commits) {
        renderSvgGitGraph(outputEl, data.commits, data.branch);
      } else if (data.graphHtml) {
        // Fallback for old agent versions that still return graphHtml
        outputEl.innerHTML = `<pre style="margin:0;padding:8px 10px;white-space:pre;font-family:inherit;font-size:inherit;color:inherit;">${data.graphHtml}</pre>`;
      }
    } catch (e) {
      console.error('[App] Failed to fetch git graph data:', e);
    }
  }
