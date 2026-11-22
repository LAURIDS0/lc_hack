// =====================================================================
//  Desktops (Ubuntu, Windows, Kali, macOS)
//  Same content on all of them: a panel with a clock, a dock, desktop
//  icons and windows with Terminal, Files and Text Editor. Only the look
//  and the app names change. Files come from the same filesystem as the
//  CLI (terminal.js). All icons are Font Awesome.
// =====================================================================

const desktopEl = document.getElementById('desktop');

// App names and the menu icon per desktop
const THEMES = {
    ubuntu: { menuIcon: 'fa-brands fa-ubuntu', menu: 'Activities', terminal: 'Terminal', files: 'Files', editor: 'Text Editor', home: 'Home', trash: 'Trash', logout: 'Log Out' },
    windows: { menuIcon: 'fa-brands fa-windows', menu: '', terminal: 'Windows Terminal', files: 'File Explorer', editor: 'Notepad', home: 'This PC', trash: 'Recycle Bin', logout: 'Sign out' },
    kali: { menuIcon: 'fa-solid fa-dragon', menu: 'Applications', terminal: 'QTerminal', files: 'Thunar', editor: 'Mousepad', home: 'Home', trash: 'Trash', logout: 'Log Out' },
    macos: { menuIcon: 'fa-brands fa-apple', menu: '', terminal: 'Terminal', files: 'Finder', editor: 'TextEdit', home: 'Home', trash: 'Trash', logout: 'Log Out' },
};

// Font Awesome icons used on every desktop
const ICONS = {
    terminal: 'fa-solid fa-terminal',
    files: 'fa-solid fa-folder-open',
    editor: 'fa-solid fa-file-pen',
    home: 'fa-solid fa-house',
    trash: 'fa-solid fa-trash-can',
    power: 'fa-solid fa-power-off',
    close: 'fa-solid fa-xmark',
    up: 'fa-solid fa-arrow-up',
    folder: 'fa-solid fa-folder',
    lock: 'fa-solid fa-lock',
    file: 'fa-solid fa-file-lines',
    image: 'fa-solid fa-file-image',
    script: 'fa-solid fa-file-code',
    binary: 'fa-solid fa-gear',
    warning: 'fa-solid fa-triangle-exclamation',
};

let desk = null; // The open desktop: { session, theme, remote, z, terminalWin, clock, timer }

// ---------- Helpers ----------

// Creates an element.  el('div', 'class', 'text')
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

// Creates a Font Awesome icon.  icon('fa-solid fa-folder')
function icon(classes) {
    const i = document.createElement('i');
    i.className = classes;
    return i;
}

// Shows a path the way the current desktop does. Windows: C:\home\jens
function displayPath(path) {
    return desk.theme === 'windows' ? 'C:\\' + path.join('\\') : '/' + path.join('/');
}

// Updates the clock in the panel
function updateClock() {
    if (!desk) return;
    desk.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// =====================================================================
//  Opening / closing the desktop
// =====================================================================

// Opens the desktop for a login. remote = opened with rdp (logging out also logs off the machine).
function openDesktop(s, remote) {
    closeDesktop();
    const theme = s.machine.desktop;
    const t = THEMES[theme];
    desk = { session: s, theme, remote, z: 10, terminalWin: null, clock: null, timer: null };

    desktopEl.className = 'theme-' + theme;
    desktopEl.innerHTML = '';
    desktopEl.hidden = false;
    term.hidden = true; // The CLI only shows up inside the terminal window

    // --- Panel: menu, hostname, clock, log out ---
    const panel = el('div', 'panel');
    const menu = el('span', 'menu');
    menu.append(icon(t.menuIcon));
    if (t.menu) menu.append(document.createTextNode(' ' + t.menu));
    panel.append(menu, el('span', 'host', `${s.user}@${s.machine.host}`));
    desk.clock = el('span', 'clock');
    const power = el('button', 'power');
    power.append(icon(ICONS.power));
    power.title = t.logout;
    power.onclick = logoutDesktop;
    panel.append(desk.clock, power);

    // --- Dock / taskbar: apps ---
    const dock = el('div', 'dock');
    dock.append(
        dockButton(ICONS.terminal, t.terminal, openTerminalWindow),
        dockButton(ICONS.files, t.files, () => openFiles(s.home)),
        dockButton(ICONS.editor, t.editor, () => openEditor(null)),
    );

    // --- Desktop icons ---
    const icons = el('div', 'icons');
    icons.append(
        desktopIcon(ICONS.home, t.home, () => openFiles(s.home)),
        desktopIcon(ICONS.terminal, t.terminal, openTerminalWindow),
        desktopIcon(ICONS.trash, t.trash, () => openFiles(s.home, `${t.trash} is empty.`)),
    );

    desktopEl.append(icons, panel, dock);
    updateClock();
    desk.timer = setInterval(updateClock, 10000);
}

// Closes the desktop and puts the CLI back in the whole box.
function closeDesktop() {
    if (!desk) return;
    clearInterval(desk.timer);
    box.prepend(term);         // Move the CLI out of the terminal window again
    term.hidden = false;
    desktopEl.hidden = true;
    desktopEl.innerHTML = '';
    desk = null;
    updatePrompt();
    input.focus();
}

// The "Log Out" button. If the desktop was opened with rdp, it also logs off the machine.
function logoutDesktop() {
    const d = desk;
    closeDesktop();
    if (d.remote && sessions.includes(d.session)) {
        while (sessions[sessions.length - 1] !== d.session) sessions.pop();
        commands.exit();
        updatePrompt();
    }
}

function dockButton(iconClass, label, onClick) {
    const b = el('button', 'dock-item');
    b.append(icon(iconClass));
    b.title = label;
    b.onclick = onClick;
    return b;
}

function desktopIcon(iconClass, label, onClick) {
    const d = el('div', 'icon');
    const img = el('div', 'icon-img');
    img.append(icon(iconClass));
    d.append(img, el('div', 'icon-label', label));
    d.ondblclick = onClick;
    return d;
}

// =====================================================================
//  Windows
// =====================================================================

// Creates a window that can be moved, closed and brought to the front.
function createWindow(title, body, { width = 520, height = 340 } = {}) {
    const win = el('div', 'window');
    const bar = el('div', 'titlebar');
    const close = el('button', 'win-close');
    if (desk.theme !== 'macos') close.append(icon(ICONS.close)); // macOS uses traffic lights
    const name = el('span', 'win-title', title);
    bar.append(close, name);
    win.append(bar, body);
    body.classList.add('win-body');

    // Offset windows a little so they don't cover each other completely
    const offset = (desktopEl.querySelectorAll('.window').length % 6) * 28;
    win.style.width = width + 'px';
    win.style.height = height + 'px';
    win.style.left = 180 + offset + 'px';
    win.style.top = 50 + offset + 'px';

    const focus = () => { win.style.zIndex = ++desk.z; };
    win.addEventListener('mousedown', focus);
    close.onclick = () => win.remove();

    // Drag the title bar to move the window (kept inside the desktop)
    bar.addEventListener('mousedown', (e) => {
        if (close.contains(e.target)) return;
        const startX = e.clientX - win.offsetLeft;
        const startY = e.clientY - win.offsetTop;
        const move = (ev) => {
            const maxX = desktopEl.clientWidth - 80;
            const maxY = desktopEl.clientHeight - 30;
            win.style.left = Math.min(Math.max(ev.clientX - startX, -width + 80), maxX) + 'px';
            win.style.top = Math.min(Math.max(ev.clientY - startY, 0), maxY) + 'px';
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });

    desktopEl.append(win);
    focus();
    return win;
}

// A small error dialog, e.g. for locked files
function showError(message) {
    const body = el('div', 'dialog');
    const iconEl = el('div', 'dialog-icon');
    iconEl.append(icon(ICONS.warning));
    body.append(iconEl, el('div', 'dialog-text', message));
    createWindow('Error', body, { width: 340, height: 140 });
}

// =====================================================================
//  Apps
// =====================================================================

// Terminal: the real CLI is moved into the window. Only one terminal window.
function openTerminalWindow() {
    if (desk.terminalWin && desk.terminalWin.isConnected) {
        desk.terminalWin.style.zIndex = ++desk.z;
        return input.focus();
    }
    const body = el('div', 'terminal-body');
    term.hidden = false;
    body.append(term);
    desk.terminalWin = createWindow(THEMES[desk.theme].terminal, body, { width: 620, height: 360 });

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

// Files: shows a directory on the desktop's machine. message = show a text instead of files.
function openFiles(startPath, message) {
    const s = desk.session;
    const body = el('div', 'files');
    const toolbar = el('div', 'files-toolbar');
    const back = el('button', 'files-btn');
    back.append(icon(ICONS.up));
    back.title = 'Up';
    const pathEl = el('div', 'files-path');
    const hiddenLabel = el('label', 'files-hidden');
    const hiddenBox = el('input');
    hiddenBox.type = 'checkbox';
    hiddenLabel.append(hiddenBox, document.createTextNode(' Hidden'));
    toolbar.append(back, pathEl, hiddenLabel);
    const list = el('div', 'files-list');
    body.append(toolbar, list);

    const win = createWindow(THEMES[desk.theme].files, body, { width: 560, height: 360 });
    const title = win.querySelector('.win-title');
    let path = [...startPath];

    // Draws the contents of the current directory
    const render = () => {
        list.innerHTML = '';
        pathEl.textContent = displayPath(path);
        title.textContent = `${path[path.length - 1] || '/'} - ${THEMES[desk.theme].files}`;
        if (message) return list.append(el('div', 'files-empty', message));

        const node = withSession(s, () => getNode(path));
        if (!isDir(node)) return list.append(el('div', 'files-empty', node === null ? 'Permission denied' : 'Folder not found'));
        const names = Object.keys(node)
            .filter(n => hiddenBox.checked || !n.startsWith('.'))
            .sort((a, b) => (isDir(node[b]) - isDir(node[a])) || a.localeCompare(b)); // Folders first

        if (!names.length) list.append(el('div', 'files-empty', 'This folder is empty'));
        for (const name of names) {
            const childPath = [...path, name];
            const dir = isDir(node[name]);
            const locked = withSession(s, () => isLocked(childPath));
            const item = el('div', 'file');
            const iconEl = el('div', 'file-icon' + (locked ? ' locked' : dir ? ' folder' : ''));
            iconEl.append(icon(locked ? ICONS.lock : dir ? ICONS.folder : fileIcon(name, node[name])));
            item.append(iconEl, el('div', 'file-name', name));
            item.ondblclick = () => openPath(childPath);
            list.append(item);
        }
    };

    // Double click: folder = go in, file = open in the text editor. Locked = error.
    const openPath = (p) => {
        const node = withSession(s, () => getNode(p));
        if (node === null) return showError(`You don't have permission to open "${p[p.length - 1]}".`);
        if (node === undefined) return showError('The file no longer exists.');
        if (isDir(node)) {
            path = p;
            message = null;
            return render();
        }
        openEditor(p);
    };

    back.onclick = () => {
        if (!path.length) return;
        path = path.slice(0, -1);
        message = null;
        render();
    };
    hiddenBox.onchange = render;
    render();
}

// Icon based on the file type
function fileIcon(name, content) {
    if (/\.(jpe?g|png|gif)$/i.test(name)) return ICONS.image;
    if (/\.(sh|py|php)$/i.test(name) || content.startsWith('#!')) return ICONS.script;
    if (content.startsWith('\x7fELF')) return ICONS.binary;
    return ICONS.file;
}

// Text editor: shows a file read-only. path = null opens an empty document.
function openEditor(path) {
    const t = THEMES[desk.theme];
    const body = el('div', 'editor');
    const text = el('pre', 'editor-text');
    body.append(text);

    if (path) {
        const content = withSession(desk.session, () => getNode(path));
        const name = path[path.length - 1];
        if (content === null) return showError(`You don't have permission to open "${name}".`);
        if (typeof content !== 'string') return showError(`"${name}" can't be opened.`);
        // Binary files show up as garbage, like in a real editor
        text.textContent = content;
        createWindow(`${name} - ${t.editor}`, body, { width: 540, height: 340 });
    } else {
        createWindow(`Untitled - ${t.editor}`, body, { width: 540, height: 340 });
    }
}
