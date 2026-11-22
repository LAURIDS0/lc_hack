-- =====================================================================
--  lc_hack - terminals in the world
--  With ox_target: a sphere zone. Without: an ox_lib point with [E].
--  Terminals with a screen are also handed to screens.lua.
-- =====================================================================

local screens = require 'client.screens'
local useTarget = GetResourceState('ox_target') == 'started'
local zones = {} -- terminal id -> ox_target zone id or lib.points point

local function use(id)
    TriggerServerEvent('lc_hack:use', id)
end

local function remove(id)
    screens.remove(id)
    local zone = zones[id]
    if not zone then return end
    zones[id] = nil
    if useTarget then
        exports.ox_target:removeZone(zone)
    else
        if zone.currentDistance and zone.currentDistance <= zone.distance then lib.hideTextUI() end
        zone:remove()
    end
end

local function add(t)
    remove(t.id) -- Replace it if it already exists
    screens.add(t)
    if useTarget then
        zones[t.id] = exports.ox_target:addSphereZone({
            coords = t.coords,
            radius = t.radius,
            options = {
                {
                    name = 'lc_hack_' .. t.id,
                    label = t.label,
                    icon = 'fa-solid fa-terminal',
                    distance = t.radius + 2.5, -- The server accepts up to radius + 3 meters away
                    onSelect = function() use(t.id) end,
                },
            },
        })
    else
        zones[t.id] = lib.points.new({
            coords = t.coords,
            distance = t.radius + 1.0, -- The server accepts up to radius + 3 meters away
            onEnter = function() lib.showTextUI('[E] ' .. t.label, { icon = 'fa-solid fa-terminal' }) end,
            onExit = function() lib.hideTextUI() end,
            nearby = function()
                if IsControlJustReleased(0, 38) then use(t.id) end -- 38 = E
            end,
        })
    end
end

RegisterNetEvent('lc_hack:addTerminal', add)
RegisterNetEvent('lc_hack:removeTerminal', remove)

-- Fetch the terminals that already exist when joining
CreateThread(function()
    for _, t in pairs(lib.callback.await('lc_hack:getTerminals', false)) do
        add(t)
    end
end)
