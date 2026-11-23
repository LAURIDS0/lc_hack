-- =====================================================================
--  lc_hack - the laptop
--  The player's own laptop: an item (or a command) opens a hack without a
--  target, with two commands that run here on the server:
--    scan          lists the devices nearby
--    connect <ID>  adds that device to the hack as a machine
--  lc_hack finds no devices itself: other resources add device types
--  with registerDevice (phones, vehicles, ...). lc_hack keeps the list,
--  the IPs and the connections; the device type decides what is found,
--  what the machine looks like and what root on it gives.
-- =====================================================================

local session = require 'server.session'
local game = require 'server.game'
local config = (require 'config').laptop or {}

local laptop = {}
local types = {} -- name -> { scan, connect, resource }
local open = {}  -- source -> { devices = { [ID] = device }, connected = { [device key] = ip }, nextIp }

local SUBNET = '172.20.0.' -- The laptop and every device it connects to share this network

local function warn(name, err)
    print(('^1[lc_hack] error in device type %s: %s^0'):format(name, err))
end

local function key(device)
    return device.type .. ':' .. tostring(device.id)
end

---Signal strength from the distance, like a scanner shows it
local function signal(distance)
    return ('%d dBm'):format(-30 - math.floor(distance * 2))
end

-- ---------- Commands in the laptop's terminal ----------

---scan: the devices of every device type, closest first
local function scan(source)
    local found = {}
    for name, t in pairs(types) do
        local ok, list = pcall(t.scan, source)
        if not ok then
            warn(name, list)
        elseif type(list) == 'table' then
            for _, d in ipairs(list) do
                local distance = type(d) == 'table' and tonumber(d.distance)
                if distance and d.id ~= nil then
                    found[#found + 1] = { type = name, id = d.id, name = tostring(d.name or name), distance = distance, locked = d.locked == true }
                end
            end
        end
    end
    table.sort(found, function(a, b) return a.distance < b.distance end)

    local lines = { 'Scanning for devices nearby...', '' }
    if #found == 0 then
        lines[#lines + 1] = 'No devices found. Get closer.'
        return lines
    end

    local l = open[source]
    l.devices = {}
    lines[#lines + 1] = ('%-4s%-10s%-20s%-10s%s'):format('ID', 'TYPE', 'DEVICE', 'SIGNAL', 'STATUS')
    for i = 1, math.min(#found, config.maxDevices or 10) do
        local d = found[i]
        l.devices[i] = d
        local ip = l.connected[key(d)]
        local status = ip and ('connected ' .. ip) or d.locked and 'locked' or 'available'
        lines[#lines + 1] = ('%-4d%-10s%-20s%-10s%s'):format(i, d.type, d.name, signal(d.distance), status)
    end
    lines[#lines + 1] = ''
    lines[#lines + 1] = 'Use: connect <ID>'
    return lines
end

---connect <ID>: asks the device type for the machine and adds it to the hack
local function connect(source, args)
    local l = open[source]
    local id = tonumber(args[1])
    local d = id and l.devices[id]
    if not d then return 'connect: unknown ID. Run "scan" first.' end

    local ip = l.connected[key(d)]
    if ip then return ('Already connected. %s is at %s'):format(d.name, ip) end
    local t = types[d.type]
    if not t then return ('connect: %s is gone.'):format(d.name) end -- Its resource stopped
    if l.nextIp > 254 then return 'connect: too many connections. Close the laptop and start again.' end

    -- One return value: the machine, or why it can't connect (several values don't survive an export call)
    local ok, machine = pcall(t.connect, source, d.id)
    if not ok then
        warn(d.type, machine)
        machine = nil
    end
    if type(machine) == 'string' then return 'connect: ' .. machine end
    if type(machine) ~= 'table' then return ('connect: %s does not answer.'):format(d.name) end

    ip = SUBNET .. l.nextIp
    l.nextIp = l.nextIp + 1
    machine.ip = ip
    machine.host = machine.host or d.name
    session.addMachine(source, machine)
    l.connected[key(d)] = ip
    return {
        ('Connecting to %s...'):format(d.name),
        ('Connected. It is at %s'):format(ip),
        ('Log in with: ssh %s@%s'):format(machine.user or 'user', ip),
    }
end

-- ---------- The laptop ----------

---@param name string
---@param data table { scan, connect }
---@param resource string
function laptop.register(name, data, resource)
    types[name] = { scan = data.scan, connect = data.connect, resource = resource }
end

---Opens the laptop for a player
---@param source number
---@return boolean opened false if the player is already hacking
function laptop.open(source)
    if session.exists(source) or game.exists(source) then return false end
    local opened = session.start(source, {
        ip = SUBNET .. '1',
        host = 'laptop',
        user = 'user',
        desktop = config.desktop or nil,
        target = false, -- No target: the laptop is open until the player closes it
        attempts = config.attempts,
        files = {
            ['~/Desktop/README.txt'] = 'scan          find devices nearby\nconnect <ID>  connect to one of them\n\nLog in to it, find the password and become root with "su".',
        },
        commands = { scan = scan, connect = connect },
    }, function()
        open[source] = nil
    end)
    if opened then open[source] = { devices = {}, connected = {}, nextIp = 2 } end
    return opened
end

---ox_inventory calls this when the laptop item is used. The item is kept.
function laptop.useItem(event, _, inventory)
    if event ~= 'usingItem' then return end
    if not laptop.open(inventory.id) then
        TriggerClientEvent('ox_lib:notify', inventory.id, { type = 'error', description = 'You are busy.' })
    end
    return false
end

-- Without ox_inventory: a command opens the laptop
if config.command and GetResourceState('ox_inventory') ~= 'started' then
    lib.addCommand(config.command.name, {
        help = 'Open your laptop',
        restricted = config.command.restricted or nil,
    }, function(source)
        laptop.open(source)
    end)
end

-- A resource that stops takes its device types with it
AddEventHandler('onResourceStop', function(resource)
    for name, t in pairs(types) do
        if t.resource == resource then types[name] = nil end
    end
end)

return laptop
