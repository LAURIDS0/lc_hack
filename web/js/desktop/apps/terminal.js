// =====================================================================
//  App: Terminal. The real CLI is moved into the window. Only one.
//  Its look comes from the desktop's theme (#term[data-os]).
// =====================================================================

registerApp('terminal', {
    open: openTerminalWindow,
    name: 'Terminal', names: { kali: 'QTerminal' },
    icon: ICONS.terminal,
});

function openTerminalWindow() {
    const existing = desk.terminalWin;
    if (existing && existing.isConnected) {
        existing.classList.remove('minimized');
        existing.style.zIndex = ++desk.z;
        return input.focus();
    }
    const body = el('div', 'terminal-body');
    term.hidden = false;
    body.append(term);
    desk.terminalWin = createWindow(appName('terminal'), body, { width: 640, height: 380, app: 'terminal' });

    // Closing the window hides the CLI again instead of removing it
    desk.terminalWin.querySelector('.win-close').onclick = () => {
        term.hidden = true;
        box.prepend(term);
        desk.terminalWin.remove();
        desk.terminalWin = null;
    };
    updatePrompt();
    scrollDown();
    input.focus();
}
