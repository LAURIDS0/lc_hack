// Commands: Files
Object.assign(commands, {
    // Creates folders.  mkdir blog   /   mkdir -p a/b/c
    mkdir(args) {
        const dirs = args.filter(a => !a.startsWith('-'));
        if (!dirs.length) return print('mkdir: missing operand');
        for (const dir of dirs) {
            const error = makeDir(resolve(dir), args.includes('-p'));
            if (error) print(`mkdir: cannot create directory '${dir}': ${error}`);
        }
    },

    // Deletes files.  rm notes.txt   /   rm -r folder
    rm(args) {
        const files = args.filter(a => !a.startsWith('-'));
        if (!files.length) return print('rm: missing operand');
        const recursive = args.some(a => /^-[a-z]*r/i.test(a));
        for (const file of files) {
            const error = removeFile(resolve(file), recursive);
            if (error) print(`rm: cannot remove '${file}': ${error}`);
        }
    },

    // Moves or renames a file.  mv notes.txt ~/Desktop
    mv(args) {
        const files = args.filter(a => !a.startsWith('-'));
        if (files.length < 2) return print(files.length ? `mv: missing destination file operand after '${files[0]}'` : 'mv: missing file operand');
        const error = moveFile(resolve(files[0]), resolve(files[1]));
        if (error) print(`mv: cannot move '${files[0]}' to '${files[1]}': ${error}`);
    },

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
});
