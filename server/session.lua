-- =====================================================================
--  lc_hack - sessions
--  A hack running for a player. Configs (and passwords) live here: the
--  client only gets a copy without passwords, and every password attempt
--  is checked here. Win and loss are decided here as well.
--
--  Hacks started from a terminal are paused when the player closes the
--  window, and resumed when they use the same terminal again. A paused
--  hack is discarded (and counts as a failure) once the player walks
--  further than the terminal's keepDistance away.
-- =====================================================================

local servers = require 'server.servers'

local session = {}
local sessions = {} -- source -> the hack that is open right now
local paused = {}   -- source -> { [terminal id] = paused hack }

local DISCARD_CHECK_INTERVAL = 1000 -- ms between distance checks for paused hacks

-- ---------- Helpers ----------

---Is it a function? Functions from other resources arrive through exports as function
---references: tables you can call, so type() says 'table'. rawget, because indexing one throws.
---@param v any
---@return boolean
local function isFunction(v)
    return type(v) == 'function' or type(v) == 'table' and rawget(v, '__cfx_functionReference') ~= nil
end

---Does the machine have this IP? (ip can be a string or a list)
---@param machine LcHackMachine
---@param ip string
---@return boolean
local function hasIp(machine, ip)
    if type(machine.ip) == 'table' then
        for _, v in pairs(machine.ip) do
            if v == ip then return true end
        end
        return false
    end
    return machine.ip == ip
end

---Copy of a machine the client is allowed to see: passwords are removed, but it learns whether there is one.
---@param machine LcHackMachine
---@param index number Sent back by the client, so we know which machine an attempt is for
---@return table
local function publicMachine(machine, index)
    local copy = {}
    for k, v in pairs(machine) do
        if not isFunction(v) then copy[k] = v end -- onRoot etc. stay on the server
    end
    copy.password, copy.rootPassword, copy.network, copy.commands = nil, nil, nil, nil
    copy.hasPassword = machine.password ~= nil
    copy.hasRootPassword = machine.rootPassword ~= nil
    copy.index = index
    return copy
end

---Calls onDone without letting errors in other resources' callbacks break anything.
local function done(s, success)
    if not s.onDone then return end
    local ok, err = pcall(s.onDone, success)
    if not ok then print(('^1[lc_hack] error in callback: %s^0'):format(err)) end
end

---Calls a function from another resource; an error there is printed, never thrown.
local function safeCall(fn, ...)
    local result = table.pack(pcall(fn, ...))
    if not result[1] then
        print(('^1[lc_hack] error in callback: %s^0'):format(result[2]))
        return nil
    end
    return table.unpack(result, 2, result.n)
end

-- ---------- Start / pause / finish ----------

---Starts a hack for a player, or resumes the paused hack on the same terminal.
---onDone(success) is called when it ends.
---@param source number
---@param config LcHackConfig
---@param onDone? fun(success: boolean)
---@param terminal? table The terminal the hack was started from, if any
---@return boolean started false if the player already has a hack open
function session.start(source, config, onDone, terminal)
    if sessions[source] then return false end

    -- Resume: the client gets the same config and restores its saved state
    local resume = terminal and paused[source] and paused[source][terminal.id]
    if resume then
        paused[source][terminal.id] = nil
        sessions[source] = resume
        resume.public.resume = true
        TriggerClientEvent('lc_hack:open', source, resume.public)
        return true
    end

    -- Machine 1 is the player's own, the rest is network (machines without ip are skipped)
    local machines = { config }
    for _, m in ipairs(config.network or {}) do
        if m.ip then machines[#machines + 1] = m end
    end
    -- The always-on servers from config.lua are part of every hack
    for _, m in ipairs(servers.list) do machines[#machines + 1] = m end

    -- The target is the machine with the IP in config.target, otherwise the player's own.
    -- target = false: no target, the hack only ends when the player closes it.
    local target = config.target ~= false and machines[1] or nil
    for _, m in ipairs(machines) do
        if config.target and hasIp(m, config.target) then target = m end
    end

    -- Build the copy without passwords for the client
    local public = publicMachine(config, 1)
    public.network = {}
    for i = 2, #machines do public.network[i - 1] = publicMachine(machines[i], i) end
    public.dns = servers.dns
    -- Commands from config.commands run on the server; the client only learns their names
    public.serverCommands = {}
    for name, fn in pairs(config.commands or {}) do
        if type(name) == 'string' and isFunction(fn) then public.serverCommands[#public.serverCommands + 1] = name end
    end
    public.mirror = terminal and terminal.screen and true or nil -- Send the screen to nearby players
    public.terminal = terminal and terminal.id or nil           -- The client keeps its state per terminal

    sessions[source] = {
        machines = machines,
        target = target,
        attempts = config.attempts or 3,
        onDone = onDone,
        terminal = terminal,
        public = public,
        logins = {}, -- machine index -> { root = boolean }: where the player has logged in
        commands = config.commands or {},
    }
    TriggerClientEvent('lc_hack:open', source, public)
    return true
end

---Ends the player's open hack and calls onDone.
---@param source number
---@param success boolean
function session.finish(source, success)
    local s = sessions[source]
    if not s then return end
    sessions[source] = nil
    done(s, success)
end

---Pauses the player's open hack if it came from a terminal, otherwise ends it as a failure.
---@param source number
function session.pause(source)
    local s = sessions[source]
    if not s then return end
    if not s.terminal then return session.finish(source, false) end

    sessions[source] = nil
    paused[source] = paused[source] or {}
    paused[source][s.terminal.id] = s
end

---Discards a paused hack (counts as a failure) and tells the client to forget its state.
---@param source number
---@param terminalId number
function session.discard(source, terminalId)
    local s = paused[source] and paused[source][terminalId]
    if not s then return end
    paused[source][terminalId] = nil
    TriggerClientEvent('lc_hack:discard', source, terminalId)
    done(s, false)
end

---Discards every paused hack on a terminal (used when the terminal is removed).
---@param terminalId number
function session.discardTerminal(terminalId)
    for source in pairs(paused) do session.discard(source, terminalId) end
end

---Is the player's hack open right now? (paused hacks don't count)
---@param source number
---@return boolean
function session.exists(source)
    return sessions[source] ~= nil
end

-- ---------- Discard paused hacks when the player walks away ----------

CreateThread(function()
    while true do
        Wait(DISCARD_CHECK_INTERVAL)
        for source, list in pairs(paused) do
            local ped = GetPlayerPed(source)
            for terminalId, s in pairs(list) do
                local t = s.terminal
                if ped == 0 or #(GetEntityCoords(ped) - t.coords) > t.keepDistance then
                    session.discard(source, terminalId)
                end
            end
            if not next(list) then paused[source] = nil end
        end
    end
end)

-- ---------- From the client ----------

-- Checks a password.  data = { machine = index, kind = 'login' | 'root', user, value }
-- Responds with { ok, win, lost, attempts }
lib.callback.register('lc_hack:verify', function(source, data)
    local s = sessions[source]
    if not s or type(data) ~= 'table' then return { ok = false, lost = true } end
    local m = s.machines[tonumber(data.machine)]
    if not m then return { ok = false, attempts = s.attempts } end

    local index = tonumber(data.machine)
    -- Root only on a machine the player is logged in to (machine 1 is their own)
    if data.kind == 'root' and index ~= 1 and not s.logins[index] then return { ok = false, attempts = s.attempts } end

    local value = tostring(data.value or '')
    local ok
    if data.kind == 'root' then
        ok = m.rootPassword == nil or value == m.rootPassword
    else
        -- ssh/rdp: the username must match, then the password (if there is one)
        ok = data.user == m.user and (m.password == nil or value == m.password)
    end

    if ok then
        s.logins[index] = s.logins[index] or { root = false }
        if data.kind == 'root' then
            s.logins[index].root = true
            if isFunction(m.onRoot) then safeCall(m.onRoot, source, m) end
            if sessions[source] ~= s then return { ok = false, lost = true } end -- onRoot stopped the hack
        end

        -- Root on the target machine = win
        if data.kind == 'root' and m == s.target then
            session.finish(source, true)
            return { ok = true, win = true }
        end
        return { ok = true }
    end

    s.attempts = s.attempts - 1
    if s.attempts <= 0 then
        session.finish(source, false)
        return { ok = false, lost = true }
    end
    return { ok = false, attempts = s.attempts }
end)

---Adds a machine to the player's running hack, e.g. a device found with a command.
---@param source number
---@param machine LcHackMachine
---@return boolean added false if the player isn't hacking
function session.addMachine(source, machine)
    local s = sessions[source]
    if not s then return false end
    local index = #s.machines + 1
    s.machines[index] = machine
    local public = publicMachine(machine, index)
    s.public.network[#s.public.network + 1] = public -- So a resumed terminal has it too
    TriggerClientEvent('lc_hack:addMachine', source, public)
    return true
end

-- Runs a command from config.commands for the player. Returns the lines to print.
lib.callback.register('lc_hack:command', function(source, name, args)
    local s = sessions[source]
    local fn = s and type(name) == 'string' and s.commands[name]
    if not isFunction(fn) or type(args) ~= 'table' or #args > 20 then return {} end
    local clean = {}
    for i, arg in ipairs(args) do clean[i] = tostring(arg):sub(1, 200) end
    local lines = safeCall(fn, source, clean)
    if type(lines) == 'string' then return { lines } end
    if type(lines) ~= 'table' then return {} end
    local out = {}
    for i, line in ipairs(lines) do out[i] = tostring(line) end
    return out
end)

-- The player changed files on an always-on server (config.lua): save them for everyone.
-- Only on a server they logged in to in this hack; servers.apply checks every path.
RegisterNetEvent('lc_hack:serverFiles', function(data)
    local source = source
    local s = sessions[source]
    if not s or type(data) ~= 'table' then return end
    local index = tonumber(data.machine)
    local m = index and s.machines[index]
    local login = index and s.logins[index]
    if not m or not login or not servers.isServer(m) then return end

    local applied = servers.apply(m, data.ops, m.user, login.root)
    if #applied == 0 then return end

    -- Everyone else in a hack right now sees the change straight away
    local ip = type(m.ip) == 'table' and m.ip[1] or m.ip
    for player in pairs(sessions) do
        if player ~= source then TriggerLatentClientEvent('lc_hack:serverFiles', player, 100000, ip, applied) end
    end
end)

-- The player closed the window (Escape / exit on their own machine)
RegisterNetEvent('lc_hack:stop', function()
    session.pause(source)
end)

AddEventHandler('playerDropped', function()
    local source = source
    session.finish(source, false)
    for terminalId in pairs(paused[source] or {}) do session.discard(source, terminalId) end
    paused[source] = nil
end)

return session
