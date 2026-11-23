-- FX Information
fx_version 'cerulean'
lua54 'yes'
game 'gta5'

-- Resource Information
name 'lc_hack'
author 'LC Development'
version '1.5.0'
repository 'https://github.com/LAURIDS0/lc_hack'
description 'A fake Linux terminal and desktops hacking minigame with networks, firewalls and server-side passwords'

-- Manifest
ui_page 'web/index.html'

shared_scripts {
    '@ox_lib/init.lua',
}

client_scripts {
    'client/main.lua',
}

server_scripts {
    'server/main.lua',
}

files {
    'web/**',
    'client/api.lua',
    'client/terminal.lua',
    'client/zones.lua',
    'client/screens.lua',
}

dependency 'ox_lib'
