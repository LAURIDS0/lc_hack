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
    // Echo the command with the prompt (and its colors), like a real terminal.
    const echo = print(line);
    echo.prepend(...[...prompt.childNodes].map(n => n.cloneNode(true)));

    const words = line.trim().split(/\s+/);
    if (!words[0]) return; // An empty line does nothing
    history.push(line.trim());
    runCommand(words);
}
