-- =====================================================================
--  lc_hack - terminals in the world
--  A terminal can have a screen: a DUI in the world that shows the
--  hacker's terminal to everyone nearby in real time.
-- =====================================================================

local session = require 'server.session'
local game = require 'server.game'

local terminal = {}
local terminals = {} -- id -> terminal
local mirrorTerminal = {} -- source -> terminal the player may send screen updates to
local lastId = 0

local MIRROR_MAX_SIZE = 100000 -- Max bytes of HTML in one screen update
local MIRROR_INTERVAL = 100    -- Min ms between screen updates from one player
local MIRROR_IDLE_DELAY = 5000 -- How long the result stays on the screen after a hack ends
local MIRROR_BANDWIDTH = 200000 -- Bytes per second for latent events

---What the client may know about a terminal (no config, no callbacks)
local function public(t)
    return { id = t.id, coords = t.coords, label = t.label, radius = t.radius, screen = t.screen }
end

---Sends a screen update (or false = idle) to every player close to the screen.
local function broadcast(t, state)
    for _, player in ipairs(GetPlayers()) do
        local ped = GetPlayerPed(player)
        if ped ~= 0 and #(GetEntityCoords(ped) - t.screen.coords) <= t.screen.distance + 25.0 then
            TriggerLatentClientEvent('lc_hack:mirror', player, MIRROR_BANDWIDTH, t.id, state)
        end
    end
end

---Finds a terminal by id (number) or name (string), like ox_target's zones.
---@param id number | string
---@return table?
function terminal.get(id)
    if type(id) == 'number' then return terminals[id] end
    for _, t in pairs(terminals) do
        if t.name == id then return t end
    end
end

---@param data LcHackTerminal
---@return number id
function terminal.create(data)
    -- The same name again replaces the old terminal
    local old = data.name and terminal.get(data.name)
    if old then terminal.remove(old.id) end

    lastId = lastId + 1
    local s = data.screen
    local c = data.coords or s.coords -- Without coords, the terminal sits on the screen
    local t = {
        id = lastId,
        name = data.name,
        coords = vector3(c.x, c.y, c.z),
        label = data.label or 'Hack terminal',
        -- On a screen, the zone covers the screen's width by default
        radius = data.radius or (not data.coords and math.max((s.width or 1.0) / 2, 0.5)) or 1.5,
        keepDistance = data.keepDistance or 10.0, -- A paused hack is kept until the player is this far away
        config = data.config,
        onSuccess = data.onSuccess,
        onFail = data.onFail,
        canUse = data.canUse,
        resource = data.resource,
        screen = s and {
            coords = vector3(s.coords.x, s.coords.y, s.coords.z),
            heading = s.heading or 0.0,
            width = s.width or 1.0,
            height = s.height or (s.width or 1.0) * 9 / 16,
            distance = s.distance or 15.0,
        } or nil,
    }
    terminals[t.id] = t
    TriggerClientEvent('lc_hack:addTerminal', -1, public(t))
    return t.id
end

---@param id number | string
---@return boolean removed
function terminal.remove(id)
    local t = terminal.get(id)
    if not t then return false end
    terminals[t.id] = nil
    session.discardTerminal(t.id)
    TriggerClientEvent('lc_hack:removeTerminal', -1, t.id)
    return true
end

-- The player wants to use a terminal. Make sure they are standing next to it.
RegisterNetEvent('lc_hack:use', function(id)
    local source = source
    local t = terminals[tonumber(id)]
    if not t or game.exists(source) then return end

    local distance = #(GetEntityCoords(GetPlayerPed(source)) - t.coords)
    if distance > t.radius + 3.0 then return end

    -- The resource that made the terminal can say no, e.g. a missing item or a cooldown
    if t.canUse then
        local ok, allowed, message = pcall(t.canUse, source, t.name or t.id)
        if not ok then
            print(('^1[lc_hack] error in canUse: %s^0'):format(allowed))
            return
        end
        if not allowed then
            if message then TriggerClientEvent('ox_lib:notify', source, { type = 'error', description = message }) end
            return
        end
    end

    local started = session.start(source, t.config, function(success)
        local cb = success and t.onSuccess or t.onFail
        if cb then cb(source, t.name or t.id) end

        -- Keep the result on the screen for a moment, then go back to idle.
        -- Updates are still accepted until then, so the final result reaches the screen.
        if t.screen then
            SetTimeout(MIRROR_IDLE_DELAY, function()
                -- Unless the player is back on this terminal in the meantime
                local usingIt = session.exists(source) and mirrorTerminal[source] == t
                if mirrorTerminal[source] == t and not usingIt then mirrorTerminal[source] = nil end
                if t.mirrorOwner ~= source or usingIt then return end
                t.mirror, t.mirrorOwner = nil, nil
                broadcast(t, false)
            end)
        end
    end, t)

    if started and t.screen then mirrorTerminal[source] = t end
end)

-- Screen updates from the hacker. Only accepted from a player hacking (or who just
-- finished hacking) a terminal with a screen.
local lastMirror = {}
RegisterNetEvent('lc_hack:mirror', function(state)
    local source = source
    local t = mirrorTerminal[source]
    if not t or not t.screen or not terminals[t.id] then return end
    if type(state) ~= 'table' or type(state.html) ~= 'string' or #state.html > MIRROR_MAX_SIZE then return end

    local now = GetGameTimer()
    if lastMirror[source] and now - lastMirror[source] < MIRROR_INTERVAL then return end
    lastMirror[source] = now

    t.mirror = { html = state.html, width = tonumber(state.width) or 1280, height = tonumber(state.height) or 720 }
    t.mirrorOwner = source
    broadcast(t, t.mirror)
end)

AddEventHandler('playerDropped', function()
    lastMirror[source] = nil
    mirrorTerminal[source] = nil
end)

-- Clients fetch the current screen when they get close to it
lib.callback.register('lc_hack:getMirror', function(_, id)
    local t = terminals[tonumber(id)]
    return t and t.mirror or false
end)

-- The client fetches every terminal when it starts
lib.callback.register('lc_hack:getTerminals', function()
    local list = {}
    for _, t in pairs(terminals) do list[#list + 1] = public(t) end
    return list
end)

-- Remove terminals created by resources that stop (their callbacks no longer work)
AddEventHandler('onResourceStop', function(resource)
    for id, t in pairs(terminals) do
        if t.resource == resource then terminal.remove(id) end
    end
end)

return terminal
