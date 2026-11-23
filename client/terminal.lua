-- =====================================================================
--  lc_hack - the terminal window (NUI)
-- =====================================================================

local terminal = { open = false, mirror = false }

-- ---------- Cameras: the live camera window shows the game from this camera ----------

local camera = nil

---A number from the NUI, or nil
local function num(value)
    value = tonumber(value)
    return value and value == value and value or nil -- not NaN
end

local function cameraOff()
    if not camera then return end
    RenderScriptCams(false, false, 0, true, true)
    DestroyCam(camera, false)
    ClearFocus()
    camera = nil
end

-- Shows the game from a camera: { coords = { x, y, z }, rotation = { x, y, z }, fov }
RegisterNUICallback('cameraView', function(data, cb)
    local c, r = type(data) == 'table' and data.coords, type(data) == 'table' and data.rotation
    local x, y, z = c and num(c.x), c and num(c.y), c and num(c.z)
    if not (x and y and z) then return cb(false) end
    if not camera then camera = CreateCam('DEFAULT_SCRIPTED_CAMERA', true) end
    SetCamCoord(camera, x, y, z)
    SetCamRot(camera, r and num(r.x) or -15.0, r and num(r.y) or 0.0, r and num(r.z) or 0.0, 2)
    SetCamFov(camera, num(data.fov) or 60.0)
    SetFocusPosAndVel(x, y, z, 0.0, 0.0, 0.0) -- Load the world around the camera
    RenderScriptCams(true, false, 0, true, true)
    cb(true)
end)

RegisterNUICallback('cameraOff', function(_, cb)
    cameraOff()
    cb(true)
end)

-- The picture the live camera shows right now, for the window that freezes. Needs screenshot-basic.
RegisterNUICallback('cameraSnapshot', function(_, cb)
    if not camera or GetResourceState('screenshot-basic') ~= 'started' then return cb(false) end
    exports['screenshot-basic']:requestScreenshot({ encoding = 'jpg', quality = 0.6 }, function(picture)
        cb(picture or false)
    end)
end)

---Closes the window without telling the server.
local function hide()
    cameraOff()
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
