-- =====================================================================
--  lc_hack - the terminal window (NUI)
-- =====================================================================

local terminal = { open = false }

---Closes the window without telling the server.
local function hide()
    terminal.open = false
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
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', config = config })
end)

-- The server closes the terminal (stopHack)
RegisterNetEvent('lc_hack:close', hide)

-- The player closes it (Escape / exit), or the game is over
RegisterNUICallback('close', function(_, cb)
    terminal.close()
    cb('ok')
end)

-- Password checks are forwarded to the server, and the answer goes back to the NUI
RegisterNUICallback('verify', function(data, cb)
    cb(lib.callback.await('lc_hack:verify', false, data))
end)

return terminal
