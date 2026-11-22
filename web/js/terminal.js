// =====================================================================
//  Fake Linux terminal with networking (minigame)
//  Goal: get root on the target machine. Players may have to hop between
//  machines with ssh, find passwords in files and get past firewalls.
//  Everything is configured on the server, which also checks passwords.
// =====================================================================

// ---------- Elements from index.html ----------
const box = document.getElementById('box');       // The whole window (80% of the screen)
const term = document.getElementById('term');     // The CLI (output + input line)
const output = document.getElementById('output'); // All printed text goes here
const prompt = document.getElementById('prompt'); // "user@host:~$ " in front of the input
const input = document.getElementById('input');   // The input field

// ---------- State ----------
let machines = [];     // All machines: the player's own (first) + config.network
let target = null;     // The machine the player needs root on to win
let sessions = [];     // Login stack: ssh and su push a login, exit pops it
let session = null;    // The top login = where the player "is" right now
let history = [];      // Every command typed (for arrow keys and "history")
let historyIndex = 0;  // Position in history while pressing up/down
let pending = null;    // When set, the terminal is waiting for a password: { label, onValue }

// Known ports and their service names (used by nmap)
const SERVICES = {
    21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 110: 'pop3',
    143: 'imap', 443: 'https', 445: 'microsoft-ds', 3306: 'mysql', 3389: 'ms-wbt-server',
    5432: 'postgresql', 5900: 'vnc', 6379: 'redis', 8080: 'http-proxy', 9100: 'jetdirect', 27017: 'mongodb',
};

// Paths only root can read by default. "~" is the machine user's home directory.
const DEFAULT_LOCKED = ['/root', '/etc/shadow', '/etc/sudoers', '/var/backups/shadow.bak', '~/.ssh/id_rsa'];

// =====================================================================
//  Default Linux files
//  Lots of "normal" files to distract the player. Some contain fake
//  passwords. A path ending with "/" is an empty directory.
//  Every machine gets its own set, with its own user, host and IPs.
// =====================================================================
function defaultFiles(user, host, ips) {
    const BIN = '\x7fELF\x02\x01\x01\x00\x00\x00 >\x00\x01 @\x00 (binary file)'; // Looks like a program
    const files = {
        // --- Root directories ---
        '/boot/vmlinuz-5.15.0-91-generic': BIN,
        '/boot/initrd.img-5.15.0-91-generic': BIN,
        '/boot/grub/grub.cfg': 'set default="0"\nset timeout=5\nmenuentry "Ubuntu" {\n  linux /boot/vmlinuz-5.15.0-91-generic root=/dev/sda1 ro quiet splash\n}',
        '/dev/null': '',
        '/dev/tty': '',
        '/dev/sda1': BIN,
        '/lib/x86_64-linux-gnu/libc.so.6': BIN,
        '/media/': null,
        '/mnt/': null,
        '/srv/': null,
        '/tmp/.X11-unix/': null,
        '/tmp/systemd-private-8f2a1c-apache2.service-Xk2Lq/': null,
        '/tmp/sess_a81f9c2b': 'user_id|i:1;logged_in|b:0;',

        // --- /root: root only ---
        '/root/.bashrc': '# ~/.bashrc for root\nexport PS1="\\u@\\h:\\w# "',
        '/root/.bash_history': 'ufw status\ncat /etc/shadow\napt upgrade -y\nreboot',

        // --- /etc: system configuration ---
        '/etc/hostname': host,
        '/etc/hosts': `127.0.0.1\tlocalhost\n127.0.1.1\t${host}\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback`,
        '/etc/passwd': [
            'root:x:0:0:root:/root:/bin/bash',
            'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
            'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
            'sys:x:3:3:sys:/dev:/usr/sbin/nologin',
            'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
            'sshd:x:110:65534::/run/sshd:/usr/sbin/nologin',
            'mysql:x:111:116:MySQL Server,,,:/nonexistent:/bin/false',
            `${user}:x:1000:1000:${user},,,:/home/${user}:/bin/bash`,
        ].join('\n'),
        '/etc/group': `root:x:0:\nsudo:x:27:${user}\nwww-data:x:33:\n${user}:x:1000:`,
        '/etc/shadow': `root:$6$Vx8rT2qL$3kQ0b9Zp1mW7yHc2NfE5sJ4uRgT8vXa0LdKoP6iB1nM:19682:0:99999:7:::\ndaemon:*:19682:0:99999:7:::\n${user}:$6$aP3nZ7wQ$9fLm2XcV8bN1kJ4hG6dS0qWeR5tY7uIoP3aZxCvBnM:19682:0:99999:7:::`,
        '/etc/sudoers': 'Defaults env_reset\nroot  ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL',
        '/etc/os-release': 'NAME="Ubuntu"\nVERSION="22.04.3 LTS (Jammy Jellyfish)"\nID=ubuntu\nPRETTY_NAME="Ubuntu 22.04.3 LTS"',
        '/etc/fstab': 'UUID=3f1c2e7a-91b4-4d2e-a1f0-7c9d8e2b1a44 /    ext4 errors=remount-ro 0 1\n/swapfile none swap sw 0 0',
        '/etc/resolv.conf': 'nameserver 127.0.0.53\noptions edns0 trust-ad',
        '/etc/crontab': 'SHELL=/bin/sh\n# m h dom mon dow user command\n17 *  * * *  root  cd / && run-parts --report /etc/cron.hourly\n0 3  * * *  root  /opt/backup.sh',
        '/etc/ssh/sshd_config': 'Port 22\nPermitRootLogin no\nPasswordAuthentication yes\nX11Forwarding yes',
        '/etc/ufw/ufw.conf': 'ENABLED=yes\nLOGLEVEL=low',
        // Network setup, shows the machine's real IP addresses
        '/etc/netplan/01-netcfg.yaml': 'network:\n  version: 2\n  ethernets:\n' +
            ips.map((ip, i) => `    eth${i}:\n      addresses: [${ip}/24]`).join('\n'),
        '/etc/apt/sources.list': 'deb http://archive.ubuntu.com/ubuntu jammy main restricted\ndeb http://archive.ubuntu.com/ubuntu jammy-updates main restricted',
        '/etc/mysql/my.cnf': '[mysqld]\nbind-address = 127.0.0.1\n# the password is NOT stored here anymore',

        // --- /var: logs, web and backups ---
        '/var/log/syslog': `Nov 22 08:01:12 ${host} systemd[1]: Started Daily apt download activities.\nNov 22 08:14:55 ${host} CRON[1123]: (root) CMD (/opt/backup.sh)\nNov 22 09:30:02 ${host} kernel: [UFW BLOCK] IN=eth0 SRC=185.23.11.4`,
        '/var/log/auth.log': `Nov 22 07:58:01 ${host} sshd[901]: Failed password for root from 185.23.11.4 port 51022\nNov 22 07:58:04 ${host} sshd[901]: Failed password for root from 185.23.11.4 port 51022\nNov 22 08:02:40 ${host} sudo: ${user} : TTY=pts/0 ; PWD=/home/${user} ; USER=root ; COMMAND=/usr/bin/apt update`,
        '/var/log/dpkg.log': '2026-11-20 10:12:01 install mysql-server:amd64 <none> 8.0.35\n2026-11-20 10:13:44 install apache2:amd64 <none> 2.4.52',
        '/var/log/apache2/access.log': '185.23.11.4 - - [22/Nov/2026:09:31:10] "GET /admin HTTP/1.1" 403 199\n10.0.0.12 - - [22/Nov/2026:09:40:01] "GET / HTTP/1.1" 200 512',
        '/var/www/html/index.html': '<html><body><h1>It works!</h1></body></html>',
        '/var/www/html/config.php': "<?php\n$db_host = 'db-server';\n$db_user = 'webapp';\n$db_pass = 'Pa$$w0rd!';\n?>",
        '/var/backups/passwd.bak': 'root:x:0:0:root:/root:/bin/bash\nold_admin:x:1001:1001::/home/old_admin:/bin/bash',
        '/var/backups/shadow.bak': 'root:$6$oLd5aLt$Qm3n8Bv2Cx7Zl1Kj4Hg6Fd9Sa0PoIuYtReWq:18900:0:99999:7:::\nold_admin:$6$Zz9Yy8Xx$Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv:18900:0:99999:7:::',
        '/var/mail/': null,

        // --- /opt and /proc ---
        '/opt/backup.sh': '#!/bin/bash\n# Nightly backup\nPASS="changeme"\ntar -czf /var/backups/home.tar.gz /home',
        '/proc/version': 'Linux version 5.15.0-91-generic (buildd@lcy02-amd64-045) (gcc 11.4.0) #101-Ubuntu SMP',
        '/proc/cpuinfo': 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz',

        // --- The user's home directory (~) ---
        '~/.bashrc': '# ~/.bashrc\nalias ll="ls -la"\nalias la="ls -a"\nexport PATH=$PATH:/opt',
        '~/.profile': '# ~/.profile\nif [ -f ~/.bashrc ]; then . ~/.bashrc; fi',
        '~/.bash_logout': '# ~/.bash_logout\nclear',
        '~/.bash_history': 'ls -la\ncd Documents\nnano passwords.txt\nrm passwords.txt\nmysql -u root -ptoor\nssh admin@10.0.0.5\nsudo apt update\nhistory -c',
        '~/.ssh/known_hosts': '10.0.0.5 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMq...\n10.0.0.12 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBx7...',
        '~/.ssh/id_rsa': '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\n-----END OPENSSH PRIVATE KEY-----',
        '~/.cache/motd.legal-displayed': '',
        '~/.config/htop/htoprc': 'fields=0 48 17 18 38 39 40 2 46 47 49 1\nsort_key=46',
        '~/Desktop/': null,
        '~/Documents/todo.txt': '- Call the bank\n- Change password (again!)\n- Delete old backups',
        '~/Documents/old_passwords.txt': 'facebook: summer2019\ngmail: Football123\nwifi: 12345678',
        '~/Documents/report_q3.txt': 'Quarterly report Q3\nRevenue grew by 4%.',
        '~/Downloads/setup.sh': '#!/bin/bash\necho "Installing..."\nsudo apt install -y htop',
        '~/Downloads/cat.jpg': BIN,
        '~/Pictures/vacation.png': BIN,
        '~/Music/': null,
    };

    // Common programs in /bin, /sbin and /usr/bin (just binary files)
    for (const name of ['bash', 'sh', 'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'grep', 'su', 'sudo', 'nano', 'ps', 'kill', 'ping', 'ip']) files['/bin/' + name] = BIN;
    for (const name of ['reboot', 'shutdown', 'iptables', 'ufw', 'ifconfig', 'fdisk']) files['/sbin/' + name] = BIN;
    for (const name of ['python3', 'perl', 'ssh', 'curl', 'wget', 'vim', 'htop', 'mysql', 'nmap', 'arp', 'netstat']) files['/usr/bin/' + name] = BIN;
    files['/usr/share/doc/'] = null;
    files['/usr/lib/'] = null;

    return files;
}

// =====================================================================
//  Small helpers
// =====================================================================

// Lua sends a single value, a list or nothing. Always turn it into a list.
function toList(value) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return typeof value === 'object' ? Object.values(value) : [value];
}

// Is it a directory? (null doesn't count, even though typeof null is 'object' in JS)
function isDir(node) {
    return node !== null && typeof node === 'object';
}

// Does the object itself have this key? (so "constructor" etc. don't count as files)
function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

// Prints a line of text in the terminal.
// textContent is used (not innerHTML), so text never turns into HTML.
// An empty line gets a space, otherwise it takes up no height.
function print(text) {
    const div = document.createElement('div');
    div.textContent = text === '' ? ' ' : text;
    output.appendChild(div);
}

// Prints lines one at a time with a delay (ping, nmap etc.).
// null in the list means "wait without printing". Input is disabled meanwhile.
function printSlow(lines, delay, done) {
    input.disabled = true;
    let i = 0;
    const next = () => {
        if (i < lines.length) {
            const line = lines[i++];
            if (line !== null) print(line);
            scrollDown();
            return setTimeout(next, delay);
        }
        input.disabled = false;
        input.focus();
        updatePrompt();
        if (done) done();
    };
    next();
}

// Scrolls the CLI to the newest line.
function scrollDown() {
    term.scrollTop = term.scrollHeight;
}

// Sends a message to client/terminal.lua (RegisterNUICallback).
function post(name, data = {}) {
    fetch(`https://${GetParentResourceName()}/${name}`, { method: 'POST', body: JSON.stringify(data) });
}

// =====================================================================
//  Filesystem
//  Every machine has its own filesystem: directory = object, file = string.
//  Locked paths are stored in the machine's "locked" set; only root can read them.
// =====================================================================

// Turns a path typed by the player (e.g. "../docs", "/etc", "~/x") into a list of names.
// "base" is the login to resolve from (its working directory and home directory).
function resolve(arg, base = session) {
    // Start at the root for "/", at home for "~", otherwise in the current directory.
    const path = arg.startsWith('/') ? [] : arg.startsWith('~') ? [...base.home] : [...base.cwd];
    for (const part of arg.replace(/^~/, '').split('/')) {
        if (part === '' || part === '.') continue; // "." and empty parts are ignored
        if (part === '..') path.pop();              // ".." goes up a directory
        else path.push(part);                        // Anything else goes down
    }
    return path;
}

// Is the path locked for the current login? Root can read everything.
function isLocked(path) {
    return !session.root && session.machine.locked.has('/' + path.join('/'));
}

// Returns whatever is at a path on the current machine.
// undefined if it doesn't exist, null if it (or a directory on the way) is locked.
function getNode(path) {
    let node = session.machine.fs;
    for (let i = 0; i < path.length; i++) {
        if (!isDir(node) || !has(node, path[i])) return undefined;
        node = node[path[i]];
        if (isLocked(path.slice(0, i + 1))) return null;
    }
    return node;
}

// Adds a file (or an empty directory) to a filesystem.
// Directories on the way are created automatically, like "mkdir -p".
function addPath(fs, parts, isDirPath, content) {
    parts = [...parts];
    const name = isDirPath ? null : parts.pop();
    let node = fs;
    for (const part of parts) {
        if (!isDir(node[part])) node[part] = {};
        node = node[part];
    }
    if (name) node[name] = String(content ?? '');
}

// Turns a path list into text. The home directory is shown as "~", like on Linux.
function pathToString(path) {
    const str = '/' + path.join('/');
    const homeStr = '/' + session.home.join('/');
    return (str + '/').startsWith(homeStr + '/') ? '~' + str.slice(homeStr.length) : str;
}

// Shared error message for things that don't exist or are locked.
function notFound(cmd, arg, node) {
    return node === null
        ? `${cmd}: ${arg}: Permission denied`
        : `${cmd}: ${arg}: No such file or directory`;
}

// Returns a file's text, or prints an error and returns undefined.
function readFile(cmd, arg) {
    if (!arg) return print(`${cmd}: missing file operand`);
    const node = getNode(resolve(arg));
    if (typeof node === 'string') return node;
    print(isDir(node) ? `${cmd}: ${arg}: Is a directory` : notFound(cmd, arg, node));
}

// May the current login write here? Like Linux: users write in their own home and /tmp, root everywhere.
function canWrite(path) {
    if (session.root) return true;
    const str = '/' + path.join('/') + '/';
    return str.startsWith(`/home/${session.user}/`) || str.startsWith('/tmp/');
}

// Writes (creates or replaces) a file. Returns an error text, or null on success.
// Used by "echo > file", "touch" and the desktop text editor.
function writeFile(path, text) {
    if (!path.length) return 'Is a directory';
    const parent = getNode(path.slice(0, -1));
    if (parent === null) return 'Permission denied';
    if (!isDir(parent)) return 'No such file or directory';
    const name = path[path.length - 1];
    if (has(parent, name) && isDir(parent[name])) return 'Is a directory';
    if (isLocked(path) || !canWrite(path)) return 'Permission denied';
    parent[name] = String(text);
    return null;
}

// What kind of file is it? Used by "file" and the desktop file manager.
function fileType(name, node) {
    if (isDir(node)) return 'directory';
    if (/\.(jpe?g)$/i.test(name)) return 'JPEG image data';
    if (/\.png$/i.test(name)) return 'PNG image data';
    if (node === '') return 'empty';
    if (node.startsWith('\x7fELF')) return 'ELF 64-bit LSB executable, x86-64, dynamically linked';
    if (node.startsWith('#!')) return 'Bourne-Again shell script, ASCII text executable';
    return /[^\x00-\x7f]/.test(node) ? 'UTF-8 Unicode text' : 'ASCII text';
}

// =====================================================================
//  Machines and logins
// =====================================================================

// Available desktops. 'random' picks one of them every time the terminal opens.
const DESKTOPS = ['ubuntu', 'windows', 'kali', 'macos'];

// The desktop's process in "ps aux"
const DESKTOP_PROCESS = {
    ubuntu: '/usr/bin/gnome-shell',
    windows: 'C:\\Windows\\explorer.exe',
    kali: 'xfce4-session',
    macos: '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
};

// Remote desktop port: Windows uses RDP (3389), the rest VNC (5900).
function desktopPort(desktop) {
    return desktop === 'windows' ? 3389 : 5900;
}

// Builds a machine from config (the player's own, or one from config.network).
function buildMachine(cfg) {
    // Desktop: one of DESKTOPS, a random one for 'random', or null (CLI only)
    const desktop = cfg.desktop === 'random'
        ? DESKTOPS[Math.floor(Math.random() * DESKTOPS.length)]
        : DESKTOPS.includes(cfg.desktop) ? cfg.desktop : null;

    // Without ports in config: ssh, plus remote desktop if the machine has one
    const defaultPorts = desktop ? [22, desktopPort(desktop)] : [22];

    const m = {
        desktop,
        processes: toList(cfg.processes),                     // Extra processes for "ps aux"
        ips: toList(cfg.ip),                                  // A machine can have several IPs (several networks)
        host: cfg.host || 'pc',
        user: cfg.user || 'user',
        index: cfg.index,                                     // The server's number for this machine
        hasPassword: !!cfg.hasPassword,                       // Does ssh/rdp login need a password?
        hasRootPassword: !!cfg.hasRootPassword,               // Does su/sudo need a password?
        ports: toList(cfg.ports ?? defaultPorts).map(Number), // Open services, e.g. 22 (ssh), 80 (web)
        firewall: cfg.firewall ? {
            enabled: true,
            allow: toList(cfg.firewall.allow),                // IPs that may do anything
            open: toList(cfg.firewall.open).map(Number),      // Ports anyone may use
            ping: cfg.firewall.ping === true,                 // Does it answer ping from anyone?
        } : null,
        fs: {},
        locked: new Set(),                                    // Paths only root can read
        arp: new Set(),                                       // IPs this machine has "seen" on the network
    };

    // Build the filesystem: default files first, then the machine's own files on top.
    const base = { cwd: [], home: ['home', m.user] };
    const files = { ...defaultFiles(m.user, m.host, m.ips), ...cfg.files };
    for (const path in files) addPath(m.fs, resolve(path, base), path.endsWith('/'), files[path]);
    for (const path of [...DEFAULT_LOCKED, ...toList(cfg.locked)]) m.locked.add('/' + resolve(path, base).join('/'));

    return m;
}

// Runs fn as another login than the top one (e.g. the desktop's), then restores it.
// Used by the file manager, so it keeps showing the desktop's machine after ssh-ing elsewhere.
function withSession(s, fn) {
    const old = session;
    session = s;
    try { return fn(); } finally { session = old; }
}

// Logs in to a machine and pushes the login onto the stack.
function login(machine, user, root = false, cwd = null) {
    const home = root ? ['root'] : ['home', user];
    session = { machine, user: root ? 'root' : user, root, home, cwd: cwd || [...home] };
    sessions.push(session);
}

// Becomes root on the current machine (the server has accepted the password).
function becomeRoot() {
    login(session.machine, 'root', true, [...session.cwd]);
}

// Updates the text in front of the input, e.g. "jens@workstation:~/Documents$ ".
// Root gets "#" instead of "$", like on Linux.
function updatePrompt() {
    if (!session) return;
    prompt.textContent = `${session.user}@${session.machine.host}:${pathToString(session.cwd)}${session.root ? '#' : '$'} `;
}

// =====================================================================
//  Networking
//  Machines can only reach each other directly when they have an IP in
//  the same /24 (first three numbers match). To reach another network,
//  the player has to ssh into a machine that sits on both.
// =====================================================================

// "10.0.0.20" -> "10.0.0"
function subnet(ip) {
    return ip.split('.').slice(0, 3).join('.');
}

// Finds the machine with a given IP.
function findMachine(ip) {
    return machines.find(m => m.ips.includes(ip));
}

// Builds a fake but stable MAC address from an IP.
function mac(ip) {
    return '52:54:00:' + ip.split('.').slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join(':');
}

// Random LAN ping time, e.g. "0.412"
function latency() {
    return (Math.random() * 0.8 + 0.2).toFixed(3);
}

// Turns a hostname into an IP by reading /etc/hosts on the current machine.
// An IP is returned as is. An unknown name returns null.
function lookup(name) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name;
    const hosts = session.machine.fs.etc && session.machine.fs.etc.hosts;
    if (typeof hosts !== 'string') return null;
    for (const line of hosts.split('\n')) {
        const [ip, ...names] = line.trim().split(/\s+/);
        if (!ip.startsWith('#') && names.includes(name)) return ip;
    }
    return null;
}

// Does the machine's firewall let the traffic through?
// port is a port number, or 'icmp' for ping.
function firewallAllows(machine, port, srcIp) {
    const fw = machine.firewall;
    if (!fw || !fw.enabled) return true;          // No firewall = everything is allowed
    if (fw.allow.includes(srcIp)) return true;    // This IP may do anything
    return port === 'icmp' ? fw.ping : fw.open.includes(port);
}

// Tries to reach an IP on a port from the current machine.
// Returns a status:
//   'noroute' = not on the same network        'nohost' = no machine on that IP
//   'blocked' = the firewall drops the traffic  'closed' = the machine doesn't run that service
//   'ok'      = it gets through
function reach(ip, port) {
    const me = session.machine;
    if (ip.startsWith('127.') || me.ips.includes(ip)) {
        // Itself: the firewall doesn't apply from the inside
        return { status: port === 'icmp' || me.ports.includes(port) ? 'ok' : 'closed', machine: me, src: ip };
    }

    const src = me.ips.find(a => subnet(a) === subnet(ip)); // Our IP on the same network
    if (!src) return { status: 'noroute' };

    const other = findMachine(ip);
    if (!other) return { status: 'nohost', src };
    me.arp.add(ip); // ARP sees the machine even when the firewall blocks, like in real life

    if (!firewallAllows(other, port, src)) return { status: 'blocked', machine: other, src };
    if (port !== 'icmp' && !other.ports.includes(port)) return { status: 'closed', machine: other, src };
    return { status: 'ok', machine: other, src };
}

// Error text when a connection fails (used by ssh, rdp and curl).
const CONNECT_ERRORS = {
    noroute: 'Network is unreachable',
    nohost: 'No route to host',
    blocked: 'Connection timed out',
    closed: 'Connection refused',
};

// Builds the nmap report for one IP. Returns null if the host seems to be down.
function scanHost(ip, skipPing, onlyPing) {
    const ping = reach(ip, 'icmp');
    if (ping.status === 'noroute' || ping.status === 'nohost') return null;
    const m = ping.machine;
    const open = m.ports.filter(p => reach(ip, p).status === 'ok');

    // nmap checks if a host is up with ping and a probe on port 80/443.
    // If neither answers, it looks down (unless -Pn is used).
    const up = ping.status === 'ok' || open.includes(80) || open.includes(443);
    if (!up && !skipPing) return null;

    const lines = ['', `Nmap scan report for ${m.host} (${ip})`, `Host is up (0.000${Math.floor(Math.random() * 900 + 100)}s latency).`];
    if (onlyPing) return lines;

    // Ports the machine runs but the firewall blocks are shown as "filtered".
    const shown = [...m.ports].sort((a, b) => a - b);
    const hidden = m.firewall && m.firewall.enabled && !open.length ? 'filtered' : 'closed';
    lines.push(`Not shown: ${1000 - shown.length} ${hidden} ports`);
    lines.push('PORT      STATE    SERVICE');
    for (const p of shown) {
        const state = open.includes(p) ? 'open' : 'filtered';
        lines.push(`${(p + '/tcp').padEnd(10)}${state.padEnd(9)}${SERVICES[p] || 'unknown'}`);
    }
    return lines;
}

// =====================================================================
//  Passwords and win/loss
// =====================================================================

// Passwords ONLY live on the server. The client only knows whether a machine has one.
// Every attempt is sent to the server, which also counts attempts and decides the outcome.

// Asks for a password and passes it to onValue. If no prompt is needed, onValue gets ''.
function askPassword(label, needPrompt, onValue) {
    if (!needPrompt) return onValue('');
    pending = { label, onValue };
    input.type = 'password';     // Hides what is typed
    prompt.textContent = label;
}

// Asks the server whether a password is correct.
//   kind = 'login' (ssh/rdp) or 'root' (su/sudo)
//   onSuccess runs on a correct password, fail is the text shown on a wrong one.
function verify(machine, kind, user, value, onSuccess, fail) {
    input.disabled = true; // No typing while the server answers
    fetch(`https://${GetParentResourceName()}/verify`, {
        method: 'POST',
        body: JSON.stringify({ machine: machine.index, kind, user, value }),
    })
        .then(res => res.json())
        .then(res => {
            input.disabled = false;
            if (res.win) return finish(true);   // Root on the target machine
            if (res.ok) {
                onSuccess();
            } else {
                print(fail);
                if (res.lost) return finish(false); // No attempts left
                print(`(${res.attempts} attempts left)`);
            }
            if (!input.disabled) { // onSuccess may have started something that is still running
                updatePrompt();
                input.focus();
            }
            scrollDown();
        })
        .catch(() => {
            input.disabled = false;
            print('Connection to the server failed.');
            updatePrompt();
        });
}

// Shows the result and closes the terminal. The server has already decided it.
function finish(success) {
    print(success
        ? `root@${target.host}: access granted. Target reached.`
        : 'Too many failed attempts. ACCESS DENIED. Closing connection.');
    input.disabled = true;
    prompt.textContent = '';
    scrollDown();
    finished = true; // Nothing to resume after a win or a loss
    if (currentTerminal !== null) delete saved[currentTerminal];
    setTimeout(() => post('close'), 2000); // Short pause so the player can read it
}

// =====================================================================
//  Commands
//  Every command gets a list of arguments (the words after the command).
//  New command? Just add a function here and it works with Tab too.
// =====================================================================
const commands = {
    // ---------- Help ----------
    help() {
        print('Files:    ls, la, ll, cd, pwd, cat, head, tail, grep, find, file, wc, strings, base64, touch, echo > file');
        print('System:   whoami, id, hostname, uname, date, ps, crontab, history, echo, clear');
        print('Network:  ifconfig, ip, ping, nmap, arp, netstat, curl, ssh, rdp, ufw');
        print('Access:   su, sudo, startx, exit');
        print(`Goal: get root access on ${target.host}.`);
    },

    // ---------- Files ----------

    // Lists files in a directory.  -a = show hidden files (starting with "."),  -l = long list.
    ls(args) {
        const flags = args.filter(a => a.startsWith('-')).join('');
        const arg = args.find(a => !a.startsWith('-')) || '.';
        const path = resolve(arg);
        const node = getNode(path);

        if (typeof node === 'string') return print(arg);        // ls on a file just prints its name
        if (!isDir(node)) return print(notFound('ls', arg, node));

        const names = Object.keys(node).filter(n => flags.includes('a') || !n.startsWith('.'));
        if (!flags.includes('l')) {
            // Short list: directories get a trailing "/" so they stand out.
            return print(names.map(n => isDir(node[n]) ? n + '/' : n).join('  '));
        }
        // Long list: permissions, owner, size and name.
        // Things in the user's home directory are owned by the user, the rest by root.
        const m = session.machine;
        const inHome = ('/' + path.join('/') + '/').startsWith(`/home/${m.user}/`);
        for (const n of names) {
            const locked = m.locked.has('/' + [...path, n].join('/'));
            const dir = isDir(node[n]);
            const perms = dir ? (locked ? 'drwx------' : 'drwxr-xr-x') : (locked ? '-rw-------' : '-rw-r--r--');
            const owner = inHome && !locked ? m.user : 'root';
            const size = dir ? 4096 : node[n].length;
            print(`${perms} 1 ${owner.padEnd(8)} ${String(size).padStart(5)} ${n}`);
        }
    },

    // Shortcuts, like in ~/.bashrc
    la(args) { commands.ls(['-a', ...args]); },
    ll(args) { commands.ls(['-la', ...args]); },

    // Changes directory. Without an argument it goes home.
    cd(args) {
        const path = resolve(args[0] || '~');
        const node = getNode(path);
        if (typeof node === 'string') return print(`cd: ${args[0]}: Not a directory`);
        if (!isDir(node)) return print(notFound('cd', args[0], node));
        session.cwd = path;
    },

    // Prints the current directory.
    pwd() { print('/' + session.cwd.join('/')); },

    // Prints one or more files.
    cat(args) {
        if (!args.length) return print('cat: missing file operand');
        for (const arg of args) {
            const text = readFile('cat', arg);
            if (text !== undefined) print(text);
        }
    },

    // Prints the first / last 10 lines of a file.
    head(args) {
        const text = readFile('head', args[0]);
        if (text !== undefined) print(text.split('\n').slice(0, 10).join('\n'));
    },
    tail(args) {
        const text = readFile('tail', args[0]);
        if (text !== undefined) print(text.split('\n').slice(-10).join('\n'));
    },

    // Prints lines containing some text.  grep <text> <file>
    grep(args) {
        if (args.length < 2) return print('usage: grep <text> <file>');
        const text = readFile('grep', args[1]);
        if (text === undefined) return;
        const lines = text.split('\n').filter(l => l.includes(args[0]));
        if (lines.length) print(lines.join('\n'));
    },

    // Finds files.  find [dir] [-name pattern]   (* is a wildcard)
    find(args) {
        const nameIndex = args.indexOf('-name');
        const pattern = nameIndex >= 0 ? args[nameIndex + 1] : null;
        const start = args[0] && args[0] !== '-name' ? args[0] : '.';

        // Turns "*.txt" into a regular expression: ^.*\.txt$
        const regex = pattern && new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

        const startPath = resolve(start);
        const startNode = getNode(startPath);
        if (startNode === undefined || startNode === null) return print(notFound('find', start, startNode));

        // Walks every directory and prints each path. Locked directories can't be entered.
        const walk = (node, path, str) => {
            if (!regex || regex.test(path[path.length - 1] || '')) print(str);
            if (!isDir(node)) return;
            if (isLocked(path)) return print(`find: '${str}': Permission denied`);
            for (const name of Object.keys(node)) walk(node[name], [...path, name], str.replace(/\/$/, '') + '/' + name);
        };
        walk(startNode, startPath, start);
    },

    // ---------- System ----------

    // Prints text, or writes it to a file.  echo <text>   echo <text> > file   echo <text> >> file
    echo(args) {
        const i = args.findIndex(a => a === '>' || a === '>>');
        const text = (i < 0 ? args : args.slice(0, i)).join(' ').replace(/^(["'])(.*)\1$/, '$2'); // Strip "quotes"
        if (i < 0) return print(text);

        const file = args[i + 1];
        if (!file) return print("bash: syntax error near unexpected token `newline'");
        const path = resolve(file);
        const existing = getNode(path);
        const append = args[i] === '>>' && typeof existing === 'string' && existing !== '';
        const error = writeFile(path, append ? existing + '\n' + text : text);
        if (error) print(`bash: ${file}: ${error}`);
    },
    whoami() { print(session.user); },
    id() {
        print(session.root
            ? 'uid=0(root) gid=0(root) groups=0(root)'
            : `uid=1000(${session.user}) gid=1000(${session.user}) groups=1000(${session.user}),27(sudo)`);
    },
    // "hostname -I" prints the machine's IPs
    hostname(args) { print(args.includes('-I') ? session.machine.ips.join(' ') : session.machine.host); },
    uname(args) {
        print(args.includes('-a') ? `Linux ${session.machine.host} 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux` : 'Linux');
    },
    date() { print(new Date().toString()); },
    history() { history.forEach((cmd, i) => print(`${String(i + 1).padStart(4)}  ${cmd}`)); },
    clear() { output.innerHTML = ''; },

    // ---------- Network ----------

    // Prints the machine's network interfaces and IPs.
    ifconfig() {
        session.machine.ips.forEach((ip, i) => {
            print(`eth${i}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`);
            print(`        inet ${ip}  netmask 255.255.255.0  broadcast ${subnet(ip)}.255`);
            print(`        ether ${mac(ip)}  txqueuelen 1000  (Ethernet)`);
            print('');
        });
        print('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
        print('        inet 127.0.0.1  netmask 255.0.0.0');
    },

    // "ip a" prints IPs, "ip r" prints which networks are reachable.
    ip(args) {
        const sub = args[0] || '';
        const ips = session.machine.ips;
        if (sub && 'addr'.startsWith(sub)) {
            print('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN');
            print('    inet 127.0.0.1/8 scope host lo');
            ips.forEach((ip, i) => {
                print(`${i + 2}: eth${i}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP`);
                print(`    link/ether ${mac(ip)} brd ff:ff:ff:ff:ff:ff`);
                print(`    inet ${ip}/24 brd ${subnet(ip)}.255 scope global eth${i}`);
            });
        } else if (sub && 'route'.startsWith(sub)) {
            ips.forEach((ip, i) => print(`${subnet(ip)}.0/24 dev eth${i} proto kernel scope link src ${ip}`));
        } else {
            print('Usage: ip [ addr | route ]');
        }
    },

    // Pings an IP or a name from /etc/hosts.  ping [-c count] <host>   (default 4)
    ping(args) {
        const cIndex = args.indexOf('-c');
        const count = Math.min(Math.max(Number(args[cIndex + 1]) || 4, 1), 10); // 1-10, so it never runs forever
        const host = args.filter((a, i) => !a.startsWith('-') && !(cIndex >= 0 && i === cIndex + 1)).pop();
        if (!host) return print('ping: usage error: Destination address required');
        const ip = lookup(host);
        if (!ip) return print(`ping: ${host}: Name or service not known`);

        const r = reach(ip, 'icmp');
        if (r.status === 'noroute') return print('ping: connect: Network is unreachable');

        const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`];
        for (let i = 1; i <= count; i++) {
            if (r.status === 'ok') lines.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=64 time=${latency()} ms`);
            else if (r.status === 'nohost') lines.push(`From ${r.src} icmp_seq=${i} Destination Host Unreachable`);
            else lines.push(null); // Firewall: no reply, just waiting
        }
        const received = r.status === 'ok' ? count : 0;
        const errors = r.status === 'nohost' ? `+${count} errors, ` : '';
        lines.push('', `--- ${host} ping statistics ---`,
            `${count} packets transmitted, ${received} received, ${errors}${received ? 0 : 100}% packet loss, time ${(count - 1) * 1001}ms`);
        printSlow(lines, 500);
    },

    // Scans a host or a whole network for open ports.
    //   nmap 10.0.0.5        one host
    //   nmap 10.0.0.0/24     the whole network
    //   -Pn                  scan even if the host doesn't answer ping
    //   -sn                  only find hosts, don't scan ports
    nmap(args) {
        const arg = args.find(a => !a.startsWith('-'));
        if (!arg) return print('Usage: nmap [-Pn] [-sn] <host | ip | net/24>');
        const skipPing = args.includes('-Pn');
        const onlyPing = args.includes('-sn');
        const isNet = arg.endsWith('/24');

        let ips;
        if (isNet) {
            const net = subnet(arg.replace('/24', ''));
            ips = machines.flatMap(m => m.ips).filter(ip => subnet(ip) === net);
        } else {
            const ip = lookup(arg);
            if (!ip) return print(`Failed to resolve "${arg}".`);
            ips = [ip];
        }

        const lines = ['Starting Nmap 7.80 ( https://nmap.org )', null, null]; // null = "scanning..."
        let up = 0;
        for (const ip of ips) {
            const report = scanHost(ip, skipPing, onlyPing);
            if (report) { up++; lines.push(...report); }
        }
        if (!isNet && !up && !skipPing) lines.push('Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn');
        const count = isNet ? '256 IP addresses' : '1 IP address';
        lines.push(`Nmap done: ${count} (${up} host${up === 1 ? '' : 's'} up) scanned in ${(1 + Math.random() * 2).toFixed(2)} seconds`);
        printSlow(lines, 300);
    },

    // Prints the machines this machine has talked to on the network.
    arp() {
        const me = session.machine;
        for (const ip of me.arp) {
            const eth = me.ips.findIndex(a => subnet(a) === subnet(ip));
            print(`? (${ip}) at ${mac(ip)} [ether] on eth${eth}`);
        }
    },

    // Prints the ports this machine listens on.
    netstat() {
        print('Active Internet connections (only servers)');
        print('Proto Recv-Q Send-Q Local Address           Foreign Address         State');
        for (const p of session.machine.ports) {
            print(`tcp        0      0 ${('0.0.0.0:' + p).padEnd(24)}0.0.0.0:*               LISTEN`);
        }
    },

    // Fetches a web page.  curl 10.0.0.30   /   curl http://web01:8080
    // Prints the machine's /var/www/html/index.html
    curl(args) {
        const arg = args.find(a => !a.startsWith('-'));
        if (!arg) return print("curl: try 'curl --help' for more information");
        const [, host, port] = arg.replace(/^https?:\/\//, '').match(/^([^:/]+)(?::(\d+))?/) || [];
        if (!host) return print('curl: (3) URL using bad/illegal format');
        const portNum = Number(port || (arg.startsWith('https') ? 443 : 80));

        const ip = lookup(host);
        if (!ip) return print(`curl: (6) Could not resolve host: ${host}`);

        const r = reach(ip, portNum);
        if (r.status !== 'ok') {
            const msg = `curl: (7) Failed to connect to ${host} port ${portNum}: ${CONNECT_ERRORS[r.status]}`;
            return printSlow([null, msg], r.status === 'blocked' ? 1500 : 200); // Firewall = long wait
        }
        const www = r.machine.fs.var && r.machine.fs.var.www && r.machine.fs.var.www.html;
        printSlow([null, www && typeof www['index.html'] === 'string' ? www['index.html'] : ''], 300);
    },

    // Logs in to another machine.  ssh user@ip   /   ssh ip (uses the same username)
    ssh(args) {
        const arg = args.find(a => !a.startsWith('-'));
        if (!arg) return print('usage: ssh [user@]hostname');
        const [user, host] = arg.includes('@') ? arg.split('@') : [session.user, arg];

        const ip = lookup(host);
        if (!ip) return print(`ssh: Could not resolve hostname ${host}: Name or service not known`);

        const r = reach(ip, 22);
        if (r.status !== 'ok') {
            const msg = `ssh: connect to host ${host} port 22: ${CONNECT_ERRORS[r.status]}`;
            return printSlow([null, msg], r.status === 'blocked' ? 1500 : 200);
        }

        const m = r.machine;
        // Wrong username (or root): Linux still asks for a password, but the server says no.
        const needPrompt = m.hasPassword || user !== m.user;
        askPassword(`${user}@${host}'s password: `, needPrompt, value => verify(m, 'login', user, value, () => {
            print('Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)');
            print('');
            print(`Last login: ${new Date().toDateString()} from ${r.src}`);
            login(m, user);
        }, 'Permission denied, please try again.'));
    },

    // Firewall (root only).  ufw status | enable | disable | allow <port> | allow from <ip>
    ufw(args) {
        if (!session.root) return print('ERROR: You need to be root to run this script');
        const m = session.machine;
        const fw = m.firewall || (m.firewall = { enabled: false, allow: [], open: [], ping: false });

        if (args[0] === 'status') {
            if (!fw.enabled) return print('Status: inactive');
            print('Status: active');
            print('');
            print('To                         Action      From');
            print('--                         ------      ----');
            for (const p of fw.open) print(`${String(p).padEnd(27)}ALLOW       Anywhere`);
            for (const ip of fw.allow) print(`${'Anywhere'.padEnd(27)}ALLOW       ${ip}`);
        } else if (args[0] === 'disable') {
            fw.enabled = false;
            print('Firewall stopped and disabled on system startup');
        } else if (args[0] === 'enable') {
            fw.enabled = true;
            print('Firewall is active and enabled on system startup');
        } else if (args[0] === 'allow' && args[1] === 'from' && args[2]) {
            fw.allow.push(args[2]);
            print('Rule added');
        } else if (args[0] === 'allow' && Number(args[1])) {
            fw.open.push(Number(args[1]));
            print('Rule added');
        } else {
            print('Usage: ufw status | enable | disable | allow <port> | allow from <ip>');
        }
    },

    // ---------- More tools ----------

    // Lists running processes. Passwords in arguments are a classic find.
    ps() {
        const m = session.machine;
        const list = [
            ['root', '/sbin/init splash'],
            ['root', '/lib/systemd/systemd-journald'],
            ['root', '/usr/sbin/cron -f'],
            ['syslog', '/usr/sbin/rsyslogd -n -iNONE'],
            ['root', 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups'],
            ...(m.desktop ? [['root', DESKTOP_PROCESS[m.desktop]]] : []),
            ...m.processes.map(p => ['root', p]),          // From config
            [session.user, '-bash'],
            [session.user, 'ps aux'],
        ];
        print('USER       PID %CPU %MEM COMMAND');
        list.forEach(([user, cmd], i) => {
            const pid = i < 5 ? [1, 312, 655, 702, 811][i] : 1200 + i * 37;
            print(`${user.padEnd(9)}${String(pid).padStart(5)}  0.${i % 7}  0.${(i * 3) % 9} ${cmd}`);
        });
    },

    // Prints the user's crontab (/var/spool/cron/crontabs/<user>), or /etc/crontab for root.
    crontab(args) {
        if (!args.includes('-l')) return print('usage: crontab -l');
        const file = session.root ? '/etc/crontab' : `/var/spool/cron/crontabs/${session.user}`;
        const node = withSession({ ...session, root: true }, () => getNode(resolve(file)));
        if (typeof node === 'string') print(node);
        else print(`no crontab for ${session.user}`);
    },

    // Tells what kind of file something is.
    file(args) {
        if (!args[0]) return print('Usage: file <file>');
        const node = getNode(resolve(args[0]));
        if (node === undefined || node === null) return print(`${args[0]}: cannot open \`${args[0]}' (${node === null ? 'Permission denied' : 'No such file or directory'})`);
        print(`${args[0]}: ${fileType(args[0], node)}`);
    },

    // Counts lines, words and characters.
    wc(args) {
        const text = readFile('wc', args.find(a => !a.startsWith('-')));
        if (text === undefined) return;
        const words = text.split(/\s+/).filter(Boolean).length;
        print(`${String(text.split('\n').length).padStart(3)} ${String(words).padStart(4)} ${String(text.length).padStart(5)} ${args[args.length - 1]}`);
    },

    // Prints readable text inside a (binary) file.
    strings(args) {
        const text = readFile('strings', args[0]);
        if (text === undefined) return;
        const found = text.match(/[\x20-\x7e\t]{4,}/g) || [];
        if (found.length) print(found.map(s => s.trim()).filter(Boolean).join('\n'));
    },

    // Encodes / decodes base64.  base64 <file>   base64 -d <file>
    // If the file doesn't exist, the argument is used as text (to decode a string found somewhere).
    base64(args) {
        const decode = args.includes('-d') || args.includes('--decode');
        const arg = args.find(a => !a.startsWith('-'));
        if (!arg) return print('Usage: base64 [-d] <file | text>');
        const node = getNode(resolve(arg));
        if (node === null) return print(`base64: ${arg}: Permission denied`);
        if (isDir(node)) return print(`base64: ${arg}: Is a directory`);
        const text = typeof node === 'string' ? node.trim() : arg;
        try {
            // TextEncoder/Decoder so non-ASCII characters work too
            print(decode
                ? new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)))
                : btoa(String.fromCharCode(...new TextEncoder().encode(text))));
        } catch {
            print('base64: invalid input');
        }
    },

    // ---------- Desktop ----------

    // Starts the desktop on the current machine.
    startx() {
        const m = session.machine;
        if (!m.desktop) return print('startx: no desktop environment installed');
        if (desk && desk.session === session) return print('Fatal server error: Server is already active for display 0');
        openDesktop(session, false);
    },

    // Remote desktop to another machine.  rdp [user@]host
    // Windows: port 3389 (RDP). Others: port 5900 (VNC). Firewall and password work like ssh.
    rdp(args) {
        const arg = args.find(a => !a.startsWith('-'));
        if (!arg) return print('usage: rdp [user@]hostname');
        const [user, host] = arg.includes('@') ? arg.split('@') : [session.user, arg];

        const ip = lookup(host);
        if (!ip) return print(`rdp: Could not resolve hostname ${host}`);

        // We don't know what kind of machine it is yet: try RDP, then VNC
        let r = reach(ip, 3389);
        if (r.status === 'closed') r = reach(ip, 5900);
        if (r.status !== 'ok' || !r.machine.desktop) {
            const reason = r.status === 'ok' ? CONNECT_ERRORS.closed : CONNECT_ERRORS[r.status];
            return printSlow([`Connecting to ${host}...`, null, `rdp: connect to host ${host}: ${reason}`], r.status === 'blocked' ? 1500 : 300);
        }

        const m = r.machine;
        const needPrompt = m.hasPassword || user !== m.user;
        askPassword(`${user}@${host}'s password: `, needPrompt, value => verify(m, 'login', user, value, () => {
            print(`Connected to ${host} (${m.desktop === 'windows' ? 'RDP' : 'VNC'})`);
            login(m, user);
            openDesktop(session, true);
        }, 'Permission denied, please try again.'));
    },

    // ---------- Access ----------

    // Becomes root with the root password. On the target machine = win (the server decides).
    su() {
        if (session.root) return;
        const m = session.machine;
        askPassword('Password: ', m.hasRootPassword,
            value => verify(m, 'root', 'root', value, becomeRoot, 'su: Authentication failure'));
    },

    // Runs one command as root.  "sudo su" or "sudo -i" gives a root shell.
    sudo(args) {
        if (!args.length) return print('usage: sudo <command>');
        const go = () => {
            if (['su', '-i', '-s', 'bash'].includes(args[0])) return becomeRoot();
            const wasRoot = session.root;
            const s = session;
            s.root = true;
            runCommand(args);
            s.root = wasRoot;
        };
        if (session.root) return go();
        const m = session.machine;
        askPassword(`[sudo] password for ${session.user}: `, m.hasRootPassword,
            value => verify(m, 'root', 'root', value, go, 'Sorry, try again.'));
    },

    // Logs out of the top login (root -> user, ssh -> back).
    // On the player's own machine it closes the window, like Escape.
    exit() {
        if (sessions.length === 1) return post('close');
        const old = sessions.pop();
        session = sessions[sessions.length - 1];
        if (!session) return post('close');
        print('logout');
        if (old.machine !== session.machine) print(`Connection to ${old.machine.host} closed.`);
        if (desk && desk.session === old) closeDesktop(); // Logged out of the desktop's login
    },

    // Creates an empty file, or does nothing if it exists.  touch <file>
    touch(args) {
        if (!args[0]) return print('touch: missing file operand');
        const node = getNode(resolve(args[0]));
        if (node !== undefined) return node === null ? print(`touch: cannot touch '${args[0]}': Permission denied`) : undefined;
        const error = writeFile(resolve(args[0]), '');
        if (error) print(`touch: cannot touch '${args[0]}': ${error}`);
    },
};
commands.logout = commands.exit; // Same command, two names

// =====================================================================
//  Running commands
// =====================================================================

// Runs a command from a list of words: the first word is the command, the rest are arguments.
function runCommand([name, ...args]) {
    if (commands[name]) commands[name](args);
    else print(`${name}: command not found`);
}

// Runs a full line typed by the player.
function run(line) {
    // Echo the command, like a real terminal.
    print(prompt.textContent + line);

    const words = line.trim().split(/\s+/);
    if (!words[0]) return; // An empty line does nothing
    history.push(line.trim());
    runCommand(words);
}

// =====================================================================
//  Tab completion
//  The first word completes commands, the rest complete files and directories.
// =====================================================================

// Finds the longest common prefix, e.g. ["Documents/", "Downloads/"] -> "Do"
function commonPrefix(list) {
    let prefix = list[0];
    for (const s of list) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    return prefix;
}

function complete() {
    const words = input.value.split(' ');
    const word = words.pop(); // The word being typed
    let options;

    if (words.length === 0) {
        // First word: match commands
        options = Object.keys(commands).filter(c => c.startsWith(word)).map(c => c + ' ');
    } else {
        // Otherwise: match files in the directory the word points to, e.g. "Doc" or "/etc/pa"
        const slash = word.lastIndexOf('/');
        const dirPart = word.slice(0, slash + 1);  // "/etc/"
        const namePart = word.slice(slash + 1);    // "pa"
        const dir = getNode(resolve(dirPart || '.'));
        if (!isDir(dir)) return;
        options = Object.keys(dir)
            .filter(n => n.startsWith(namePart))
            .filter(n => namePart.startsWith('.') || !n.startsWith('.')) // Hidden files only when typing "."
            .map(n => dirPart + n + (isDir(dir[n]) ? '/' : ' '));
    }

    if (options.length === 0) return;
    if (options.length > 1) {
        // Several options: list them all, like Linux does on double Tab
        print(prompt.textContent + input.value);
        print(options.map(o => o.trim().split('/').filter(Boolean).pop() + (o.endsWith('/') ? '/' : '')).join('  '));
    }
    input.value = [...words, options.length === 1 ? options[0] : commonPrefix(options)].join(' ');
}

// =====================================================================
//  Saved state per terminal
//  Closing a terminal pauses it: everything is saved here and restored
//  when the player uses the same terminal again. The server tells us to
//  forget it (discard) once the player walks too far away.
// =====================================================================
const saved = {};             // terminal id -> saved state
let currentTerminal = null;   // The terminal the open hack came from (null for startHack)
let finished = false;         // The hack was won or lost, nothing to save

function saveState() {
    const deskIndex = desk ? sessions.indexOf(desk.session) : -1;
    saved[currentTerminal] = {
        machines, target, sessions, history,
        output: output.innerHTML,
        desktop: deskIndex >= 0 ? {
            index: deskIndex,
            remote: desk.remote,
            terminalOpen: !!(desk.terminalWin && desk.terminalWin.isConnected),
        } : null,
    };
}

function restoreState(state) {
    machines = state.machines;
    target = state.target;
    sessions = state.sessions;
    session = sessions[sessions.length - 1];
    history = state.history;
    output.innerHTML = state.output;
    box.style.display = 'block';
    updatePrompt();
    if (state.desktop) {
        openDesktop(sessions[state.desktop.index], state.desktop.remote);
        if (state.desktop.terminalOpen) openTerminalWindow();
    }
    scrollDown();
}

// =====================================================================
//  Opening the terminal (called from client/terminal.lua)
// =====================================================================
function open(cfg = {}) {
    closeDesktop(); // In case a desktop was left open last time
    currentTerminal = cfg.terminal ?? null;
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
});

// =====================================================================
//  Keyboard
// =====================================================================
input.addEventListener('keydown', (e) => {
    if (input.disabled) return; // The game is over, or a command is still running
    if (e.key === 'Enter') {
        const value = input.value;
        input.value = '';
        if (pending) {
            const p = pending;
            pending = null;
            input.type = 'text';
            print(p.label); // The password itself is never printed
            p.onValue(value);
        } else {
            run(value);
        }
        // Update the prompt (cd/ssh/su may have changed it), unless something is still running
        if (!pending && !input.disabled) updatePrompt();
        historyIndex = history.length;
        scrollDown();
    }

    if (e.key === 'Tab') {
        e.preventDefault(); // Otherwise Tab moves focus away from the input
        if (!pending) complete();
        scrollDown();
    }

    // Arrow keys: browse previous commands
    if (e.key === 'ArrowUp' && historyIndex > 0) {
        e.preventDefault();
        input.value = history[--historyIndex];
    }
    if (e.key === 'ArrowDown' && historyIndex < history.length) {
        e.preventDefault();
        input.value = history[++historyIndex] || '';
    }
});

// Escape closes the terminal (counts as giving up).
document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') post('close');
});

// Clicking anywhere in the terminal focuses the input again.
term.addEventListener('click', () => input.focus());
