// =====================================================================
//  Opening the terminal (called from client/terminal.lua)
// =====================================================================
function open(cfg = {}) {
    closeDesktop(); // In case a desktop was left open last time
    currentTerminal = cfg.terminal ?? null;
    dns = cfg.dns || {};
    finished = false;
    pending = null;
    input.value = '';
    input.type = 'text';
    input.disabled = false;

    // Coming back to a paused terminal: restore it exactly as it was left
    const state = currentTerminal !== null && cfg.resume ? saved[currentTerminal] : null;
    if (state) {
        restoreState(state);
        historyIndex = history.length;
        return input.focus();
    }
    if (currentTerminal !== null) delete saved[currentTerminal]; // A fresh start replaces anything old

    // Build every machine: the player's own (top-level config fields) + config.network.
    session = null;
    const local = buildMachine({ ip: '10.0.0.20', ...cfg });
    machines = [local, ...toList(cfg.network).filter(d => d && d.ip).map(buildMachine)];

    // The target is the machine with the IP in config.target, otherwise the player's own.
    target = (cfg.target && findMachine(cfg.target)) || local;

    // Reset everything from last time
    sessions = [];
    login(local, local.user);
    history = [];
    historyIndex = 0;
    output.innerHTML = '';

    print(`Last login: ${new Date().toDateString()} from 10.0.0.1`);
    print('Type "help" to list commands.');
    updatePrompt();
    box.style.display = 'block';

    // If the player's own machine has a desktop, start on it
    if (local.desktop) openDesktop(session, false);
    input.focus(); // So the player can type right away
}

// Messages from client/terminal.lua (SendNUIMessage).
window.addEventListener('message', (e) => {
    if (e.data.action === 'open') open(e.data.config);
    if (e.data.action === 'close') {
        if (currentTerminal !== null && !finished) saveState(); // Paused, not finished
        closeDesktop();
        box.style.display = 'none';
    }
    if (e.data.action === 'discard') delete saved[e.data.terminal];
    if (e.data.action === 'serverFiles') applyServerFiles(e.data.ip, e.data.ops);
});
