-- =====================================================================
--  lc_hack - sessions
--  A hack running for a player. Configs (and passwords) live here: the
--  client only gets a copy without passwords, and every password attempt
--  is checked here. Win and loss are decided here as well.
-- =====================================================================

local session = {}
local sessions = {} -- source -> hack currently running for that player

-- ---------- Helpers ----------

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
    for k, v in pairs(machine) do copy[k] = v end
    copy.password, copy.rootPassword, copy.network = nil, nil, nil
    copy.hasPassword = machine.password ~= nil
    copy.hasRootPassword = machine.rootPassword ~= nil
    copy.index = index
    return copy
end

-- ---------- Start / finish ----------

---Starts a hack for a player. onDone(success) is called when it ends.
---@param source number
---@param config LcHackConfig
---@param onDone? fun(success: boolean)
---@return boolean started false if the player is already hacking
function session.start(source, config, onDone)
    if sessions[source] then return false end

    -- Machine 1 is the player's own, the rest is network (machines without ip are skipped)
    local machines = { config }
    for _, m in ipairs(config.network or {}) do
        if m.ip then machines[#machines + 1] = m end
    end

    -- The target is the machine with the IP in config.target, otherwise the player's own
    local target = machines[1]
    for _, m in ipairs(machines) do
        if config.target and hasIp(m, config.target) then target = m end
    end

    -- Build the copy without passwords for the client
    local public = publicMachine(config, 1)
    public.network = {}
    for i = 2, #machines do public.network[i - 1] = publicMachine(machines[i], i) end

    sessions[source] = {
        machines = machines,
        target = target,
        attempts = config.attempts or 3,
        onDone = onDone,
    }
    TriggerClientEvent('lc_hack:open', source, public)
    return true
end

---Ends the player's hack and calls onDone. Errors in other resources' callbacks must not break anything.
---@param source number
---@param success boolean
function session.finish(source, success)
    local s = sessions[source]
    if not s then return end
    sessions[source] = nil
    if s.onDone then
        local ok, err = pcall(s.onDone, success)
        if not ok then print(('^1[lc_hack] error in callback: %s^0'):format(err)) end
    end
end

---@param source number
---@return boolean
function session.exists(source)
    return sessions[source] ~= nil
end

-- ---------- From the client ----------

-- Checks a password.  data = { machine = index, kind = 'login' | 'root', user, value }
-- Responds with { ok, win, lost, attempts }
lib.callback.register('lc_hack:verify', function(source, data)
    local s = sessions[source]
    if not s or type(data) ~= 'table' then return { ok = false, lost = true } end
    local m = s.machines[tonumber(data.machine)]
    if not m then return { ok = false, attempts = s.attempts } end

    local value = tostring(data.value or '')
    local ok
    if data.kind == 'root' then
        ok = m.rootPassword == nil or value == m.rootPassword
    else
        -- ssh/rdp: the username must match, then the password (if there is one)
        ok = data.user == m.user and (m.password == nil or value == m.password)
    end

    if ok then
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

-- The player closed the terminal (Escape / exit) = gave up
RegisterNetEvent('lc_hack:stop', function()
    session.finish(source, false)
end)

AddEventHandler('playerDropped', function()
    session.finish(source, false)
end)

return session
