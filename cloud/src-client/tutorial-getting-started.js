/**
 * Getting Started tutorial guide.
 *
 * Registers itself on window.TUT_GUIDES['getting-started'].
 * Receives a `ctx` object from the tutorial engine with all shared
 * helpers, DOM refs, and state accessors.
 */
(function () {
  'use strict';

  window.TUT_GUIDES = window.TUT_GUIDES || {};

  window.TUT_GUIDES['getting-started'] = async function gettingStarted(ctx) {
    const TOTAL_STEPS = 11;

    // ── Welcome ──
    await ctx.waitForClick('#tut-start-btn');
    ctx.tutOverlay.classList.add('hiding');
    await ctx.sleep(500);
    ctx.tutOverlay.classList.add('hidden');

    // Create HUD
    ctx.createHud();

    // Show zoom controls
    const controls = ctx.controls;
    controls.style.display = '';

    const hudContainer = document.getElementById('hud-container');

    // ── Step 1: Add Machine ──
    ctx.tutDim.classList.add('visible');
    hudContainer.classList.add('tut-above-dim');

    ctx.showPrompt('Connect a Machine', 'Add your first machine',
      'Click <span class="hl">+ Add Machine</span> in the Machines panel to connect a remote dev machine.',
      0, TOTAL_STEPS);

    await ctx.waitForClick('#tut-add-machine-btn', 'tut-glow-teal');
    ctx.hidePrompt();

    ctx.showPrompt('Connect a Machine', 'Connecting...',
      'The agent is connecting to your machine...',
      0, TOTAL_STEPS);
    await ctx.sleep(1500);

    ctx.renderHudWithDevice();
    ctx.tutDim.classList.remove('visible');
    hudContainer.classList.remove('tut-above-dim');
    ctx.hidePrompt();

    ctx.addPaneBtn.style.display = '';
    await ctx.sleep(300);

    // ── Step 2: Click + -> Terminal (menu shows only Terminal) ──
    ctx.tutDim.classList.add('visible');
    ctx.showMenuItems(['terminal']);

    ctx.showPrompt('Add Panes', 'Add a terminal pane',
      'Click the <span class="hl">+</span> button to open the pane menu.',
      1, TOTAL_STEPS);

    ctx.addPaneBtn.classList.add('tut-above-dim');
    await ctx.waitForClick(ctx.addPaneBtn, 'tut-glow-purple');
    ctx.addPaneBtn.classList.remove('tut-above-dim');

    ctx.paneMenu.classList.remove('hidden');

    ctx.hidePrompt();
    ctx.showPrompt('Add Panes', 'Select Terminal',
      'Click <span class="hl">Terminal</span> to open a terminal on your remote machine.',
      1, TOTAL_STEPS);

    await ctx.waitForMenuItemClick('terminal');
    ctx.hidePrompt();
    ctx.tutDim.classList.remove('visible');

    // ── Step 3: Place terminal ──
    ctx.showPrompt('Place Terminal', 'Click to place',
      'Move your cursor and <span class="hl">click anywhere</span> on the canvas to place the terminal.',
      2, TOTAL_STEPS);

    const termPos = await ctx.enterPlacementMode('terminal');
    ctx.hidePrompt();

    const termPaneData = ctx.createFakeTerminalPane(termPos.x, termPos.y);
    termPaneData.el.style.opacity = '0';
    termPaneData.el.style.transform = 'scale(0.95)';
    termPaneData.el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      termPaneData.el.style.opacity = '1';
      termPaneData.el.style.transform = 'scale(1)';
    });
    await ctx.sleep(400);

    // Brief note about the terminal
    ctx.showPrompt('Your Terminal', 'This is your actual CLI',
      'This is your actual CLI on your machine\'s terminal \u2014 run commands, use Claude Code, or any tool you need. Click anywhere to continue.',
      2, TOTAL_STEPS);
    await new Promise(resolve => {
      document.addEventListener('click', () => resolve(), { once: true });
    });
    ctx.hidePrompt();
    await ctx.sleep(200);

    // ── Step 4: Drag terminal ──
    termPaneData.el.classList.add('tut-drag-target');
    ctx.showPrompt('Move Panes', 'Drag the terminal',
      'Grab the terminal by its <span class="hl">header bar</span> and drag it to a new position.',
      3, TOTAL_STEPS);

    await ctx.waitForDrag(termPaneData, 30);
    termPaneData.el.classList.remove('tut-drag-target');
    ctx.hidePrompt();
    await ctx.sleep(300);

    // ── Step 5: Pan & Zoom -- zoom out ──
    ctx.showPrompt('Navigate Canvas', 'Zoom out to see more',
      'Use <span class="hl">Ctrl+scroll</span> to zoom out the canvas, or click the <span class="hl">\u2212</span> button in the corner.<br>You can also <span class="hl">scroll</span> to pan, or hold <span class="hl">middle mouse</span> and drag to move around.<br><span class="hl">Ctrl+/\u2212</span> on a focused pane zooms just that pane.',
      4, TOTAL_STEPS);

    controls.classList.add('tut-above-dim');
    await ctx.waitForZoomOut(0.85);
    controls.classList.remove('tut-above-dim');
    ctx.hidePrompt();
    await ctx.sleep(300);

    // ── Step 6: Click + -> File (menu shows Terminal + File) ──
    ctx.tutDim.classList.add('visible');
    ctx.showMenuItems(['terminal', 'file']);

    ctx.showPrompt('Add Panes', 'Add a file pane',
      'Click <span class="hl">+</span> to open the pane menu.',
      5, TOTAL_STEPS);

    ctx.addPaneBtn.classList.add('tut-above-dim');
    await ctx.waitForClick(ctx.addPaneBtn, 'tut-glow-purple');
    ctx.addPaneBtn.classList.remove('tut-above-dim');

    ctx.paneMenu.classList.remove('hidden');

    ctx.hidePrompt();
    ctx.showPrompt('Add Panes', 'Select File',
      'Click <span class="hl">File</span> to browse and open a source file.',
      5, TOTAL_STEPS);

    await ctx.waitForMenuItemClick('file');
    ctx.hidePrompt();
    ctx.tutDim.classList.remove('visible');

    // ── Step 6b: File browser modal ──
    ctx.showPrompt('Browse Files', 'Navigate to a file',
      'Browse the file tree and click <span class="hl">main.py</span> in <span class="hl">~/projects/tmdx/</span> to open it.',
      5, TOTAL_STEPS);

    await ctx.showFileBrowserModal();
    ctx.hidePrompt();

    // ── Step 7: Place file ──
    ctx.showPrompt('Place File', 'Click to place',
      'Place the file pane on the canvas. Try <span class="hl">snapping</span> it next to the terminal.',
      6, TOTAL_STEPS);

    const filePos = await ctx.enterPlacementMode('file');
    ctx.hidePrompt();

    const filePaneData = ctx.createFakeFilePane(filePos.x, filePos.y);
    filePaneData.el.style.opacity = '0';
    filePaneData.el.style.transform = 'scale(0.95)';
    filePaneData.el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      filePaneData.el.style.opacity = '1';
      filePaneData.el.style.transform = 'scale(1)';
    });
    await ctx.sleep(400);

    // ── Step 8: Click + -> Git Graph (menu shows Terminal + File + Git Graph) ──
    ctx.tutDim.classList.add('visible');
    ctx.showMenuItems(['terminal', 'file', 'git-graph']);

    ctx.showPrompt('Add Panes', 'Now add a Git Graph',
      'Click <span class="hl">+</span> one more time.',
      7, TOTAL_STEPS);

    ctx.addPaneBtn.classList.add('tut-above-dim');
    await ctx.waitForClick(ctx.addPaneBtn, 'tut-glow-purple');
    ctx.addPaneBtn.classList.remove('tut-above-dim');

    ctx.paneMenu.classList.remove('hidden');

    ctx.hidePrompt();
    ctx.showPrompt('Add Panes', 'Select Git Graph',
      'Click <span class="hl">Git Graph</span> to visualize your repository.',
      7, TOTAL_STEPS);

    await ctx.waitForMenuItemClick('git-graph');
    ctx.hidePrompt();
    ctx.tutDim.classList.remove('visible');

    // ── Step 8b: Git repo picker modal ──
    ctx.showPrompt('Choose Repository', 'Navigate and scan for repos',
      'Follow the highlighted path: <span class="hl">projects</span> \u2192 <span class="hl">tmdx</span> \u2192 click <span class="hl">Scan this folder</span> \u2192 select the <span class="hl">master</span> branch repo.',
      7, TOTAL_STEPS);

    await ctx.showGitRepoPickerModal();
    ctx.hidePrompt();

    // ── Step 9: Place git graph ──
    ctx.showPrompt('Place Git Graph', 'Click to place',
      'Place the git graph on the canvas. Snap it <span class="hl">next to your other panes</span>.',
      8, TOTAL_STEPS);

    const gitPos = await ctx.enterPlacementMode('git-graph');
    ctx.hidePrompt();

    const gitPaneData = ctx.createFakeGitGraphPane(gitPos.x, gitPos.y);
    gitPaneData.el.style.opacity = '0';
    gitPaneData.el.style.transform = 'scale(0.95)';
    gitPaneData.el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      gitPaneData.el.style.opacity = '1';
      gitPaneData.el.style.transform = 'scale(1)';
    });
    await ctx.sleep(400);

    // ── Step 10: Resize git graph ──
    gitPaneData.el.classList.add('tut-resize-target');
    ctx.showPrompt('Resize Panes', 'Resize the Git Graph',
      'Drag the <span class="hl">bottom-right corner</span> of the Git Graph to resize it. Edges snap to nearby panes.',
      9, TOTAL_STEPS);

    await ctx.waitForResize(gitPaneData, 30);
    gitPaneData.el.classList.remove('tut-resize-target');
    ctx.hidePrompt();
    await ctx.sleep(300);

    // ── Completion ──
    // Mark tutorial as completed so app doesn't redirect back here
    try { localStorage.setItem('tc_tutorial', 'completed'); } catch (e) {}

    // Fire-and-forget: persist completion to server
    try {
      const resp = await fetch('/api/preferences', { credentials: 'include' });
      if (resp.ok) {
        const prefs = await resp.json();
        const tc = prefs.tutorialsCompleted || {};
        tc['getting-started'] = true;
        prefs.tutorialsCompleted = tc;
        fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(prefs),
        }).catch(() => {});
      }
    } catch (e) { /* not logged in -- skip server sync */ }

    ctx.tutComplete.classList.add('visible');
  };
})();
