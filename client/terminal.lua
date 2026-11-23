-- =====================================================================
--  lc_hack - the terminal window (NUI)
-- =====================================================================

local terminal = { open = false, mirror = false }

---Closes the window without telling the server.
local function hide()
    terminal.open = false
    terminal.mirror = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

---Closes the window and tells the server the player gave up.
function terminal.close()
    if not terminal.open then return end
    hide()
    TriggerServerEvent('lc_hack:stop')
end

-- The server opens the terminal with a config without passwords
RegisterNetEvent('lc_hack:open', function(config)
    terminal.open = true
    terminal.mirror = config.mirror == true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', config = config })
end)

-- Screen updates from the NUI, sent on to players near the terminal's screen.
-- Latent, so a big update never blocks other network traffic.
RegisterNUICallback('mirror', function(data, cb)
    if terminal.mirror then TriggerLatentServerEvent('lc_hack:mirror', 100000, data) end
    cb('ok')
end)

-- The player changed files on an always-on server: the server checks and saves them
RegisterNUICallback('serverFiles', function(data, cb)
    if terminal.open then TriggerLatentServerEvent('lc_hack:serverFiles', 100000, data) end
    cb('ok')
end)

-- Another player changed files on an always-on server
RegisterNetEvent('lc_hack:serverFiles', function(ip, ops)
    SendNUIMessage({ action = 'serverFiles', ip = ip, ops = ops })
end)

-- A command from config.commands: it runs on the server, the lines go back to the NUI
RegisterNUICallback('command', function(data, cb)
    cb(lib.callback.await('lc_hack:command', false, data.name, data.args) or {})
end)

-- The server added a machine to the running hack (addMachine)
RegisterNetEvent('lc_hack:addMachine', function(machine)
    SendNUIMessage({ action = 'addMachine', machine = machine })
end)

-- The server closes the terminal (stopHack)
RegisterNetEvent('lc_hack:close', hide)

-- The player walked away from a paused terminal: forget its saved state
RegisterNetEvent('lc_hack:discard', function(terminalId)
    SendNUIMessage({ action = 'discard', terminal = terminalId })
end)

-- The player closes it (Escape / exit), or the game is over
RegisterNUICallback('close', function(_, cb)
    terminal.mirror = false
    terminal.close()
    cb('ok')
end)

-- Password checks are forwarded to the server, and the answer goes back to the NUI
RegisterNUICallback('verify', function(data, cb)
    cb(lib.callback.await('lc_hack:verify', false, data))
end)

return terminal
