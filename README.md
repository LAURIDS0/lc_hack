# lc_hack

A hacking minigame for FiveM built around a fake Linux terminal and desktops. Players read files, scan networks, hop between machines with `ssh` and `rdp` and get past firewalls until they have root access on the target machine.

Passwords never leave the server, and the server decides when a player wins.

## Documentation

Open [`docs/index.html`](docs/index.html) in your browser.

## Features

- Realistic terminal with `ls`, `cd`, `cat`, `grep`, `find`, `ps`, `strings`, `base64`, tab completion and history.
- Networks with several machines: `ping`, `nmap`, `ssh`, `rdp`, `curl`, `ifconfig`, `arp`.
- Firewalls that drop traffic, and machines on several networks the player has to hop through.
- Graphical desktops (Ubuntu, Kali, macOS, ChromeOS, Linux Mint, Fedora or random) with a terminal, file manager, text editor, image viewer, web browser and system monitor that look like each OS. Files in `~/Desktop` show up on the desktop.
- Always-on servers and DNS in `config.lua`, with static websites players can browse and build in game.
- In-world screens (DUI) that show the hack to everyone nearby in real time.
- A minigame core: other resources register their own minigames and get server-side checks, attempts and time limits.
- Around 90 default Linux files per machine, including fake passwords to mislead players.
- Terminals in the world through ox_target, or ox_lib points when ox_target isn't running.
- Exports built like ox_target, with LuaLS annotations.
- Server-side password checks and win conditions.

## Requirements

- [ox_lib](https://github.com/overextended/ox_lib)
- [ox_target](https://github.com/overextended/ox_target) (optional)
- OneSync

## Installation

1. Download the [latest release](https://github.com/LAURIDS0/lc_hack/releases/latest) or clone the repository into your `resources` folder.

   ```
   git clone https://github.com/LAURIDS0/lc_hack.git
   ```

2. Start it after its dependencies in your `server.cfg`.

   ```cfg
   ensure ox_lib
   ensure ox_target
   ensure lc_hack
   ```

3. Use `/hack` or `/hackterminal` as an admin (`group.admin`) to try the example.

## Testing in the browser

You can try everything without FiveM. `web/js/dev.js` stands in for the client and server: it reads `config.lua` and the `/hack` example in `server/commands.lua`, so what you test is what the server runs. It does nothing in FiveM.

```
python3 -m http.server 8000
```

Run it in the resource folder and open http://localhost:8000/web/. Add `?desktop=macos`, `kali`, `ubuntu`, `chromeos`, `mint`, `fedora`, `random` or `none` to choose the desktop. Escape closes the window and starts the example again.

## Servers and DNS

Servers in `config.lua` are always on and every hack can reach them. `dns` points names to IPs, and `website` points to a folder with a static website:

```lua
servers = {
    { ip = '82.103.40.12', host = 'northbank-web', user = 'webadmin', password = 'N0rth!Web', website = 'websites/northbank' },
},
dns = {
    ['northbank.com'] = '82.103.40.12',
},
```

Players can then open `northbank.com` in the browser or with `curl`. They can also build websites in game: changes on these servers are checked and saved by the game server (`serverdata.json`) and everyone sees them. See the documentation for details.

## Usage

```lua
exports.lc_hack:createTerminal({
    name = 'bank_server',
    coords = vec3(253.1, 228.4, 101.7),
    label = 'Use server',
    config = {
        user = 'teller',
        desktop = 'macos',
        target = '10.1.0.10',
        network = {
            { ip = '10.1.0.10', host = 'bank-core', user = 'ops', password = 'Vault#2026', rootPassword = 'Valv-7781' },
        },
    },
    onSuccess = function(source)
        -- reward the player
    end,
})
```

See the documentation for every export and config field.

## License

This project is licensed under the [GNU Lesser General Public License v3.0](LICENSE).

Copyright (c) 2026 LC Development
