-- =====================================================================
--  lc_hack - terminals in the world
-- =====================================================================

local session = require 'server.session'

local terminal = {}
local terminals = {} -- id -> terminal
local lastId = 0

---What the client may know about a terminal (no config, no callbacks)
local function public(t)
    return { id = t.id, coords = t.coords, label = t.label, radius = t.radius }
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
    local c = data.coords
    local t = {
        id = lastId,
        name = data.name,
        coords = vector3(c.x, c.y, c.z),
        label = data.label or 'Hack terminal',
        radius = data.radius or 1.5,
        config = data.config,
        onSuccess = data.onSuccess,
        onFail = data.onFail,
        resource = data.resource,
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
    TriggerClientEvent('lc_hack:removeTerminal', -1, t.id)
    return true
end

-- The player wants to use a terminal. Make sure they are standing next to it.
RegisterNetEvent('lc_hack:use', function(id)
    local source = source
    local t = terminals[tonumber(id)]
    if not t then return end

    local distance = #(GetEntityCoords(GetPlayerPed(source)) - t.coords)
    if distance > t.radius + 3.0 then return end

    session.start(source, t.config, function(success)
        local cb = success and t.onSuccess or t.onFail
        if cb then cb(source, t.name or t.id) end
    end)
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
