-- =====================================================================
--  lc_hack - exports
--  Built like ox_target: every function on `api` automatically becomes an export.
-- =====================================================================

---@class LcHackFirewall
---@field allow? string[] IPs that may do anything
---@field open? number[] Ports anyone may use
---@field ping? boolean Answers ping from anyone

---@class LcHackMachine
---@field ip? string | string[]
---@field host? string
---@field user? string
---@field password? string ssh/rdp login
---@field rootPassword? string su/sudo
---@field ports? number[]
---@field firewall? LcHackFirewall
---@field desktop? 'ubuntu' | 'windows' | 'kali' | 'macos' | 'random'
---@field processes? string[]
---@field files? table<string, string>
---@field locked? string[]

---@class LcHackConfig : LcHackMachine
---@field target? string The IP the player needs root on
---@field attempts? number
---@field network? LcHackMachine[]

---@class LcHackTerminal
---@field coords vector3
---@field config LcHackConfig
---@field name? string
---@field label? string
---@field radius? number
---@field onSuccess? fun(source: number, id: number | string)
---@field onFail? fun(source: number, id: number | string)

local session = require 'server.session'
local terminal = require 'server.terminal'

local api = setmetatable({}, {
    __newindex = function(self, index, value)
        rawset(self, index, value)
        exports(index, value)
    end
})

---Throws a formatted type error
---@param variable string
---@param expected string
---@param received string
local function typeError(variable, expected, received)
    error(("expected %s to have type '%s' (received %s)"):format(variable, expected, received), 3)
end

---@param config any
local function checkConfig(config)
    if type(config) ~= 'table' then typeError('config', 'table', type(config)) end
    if config.network ~= nil and type(config.network) ~= 'table' then typeError('config.network', 'table', type(config.network)) end
end

---Creates a terminal in the world. Using the same `name` again replaces the old one.
---@param data LcHackTerminal
---@return number id
function api.createTerminal(data)
    if type(data) ~= 'table' then typeError('data', 'table', type(data)) end

    local coords = data.coords
    local coordsType = type(coords)
    if coordsType ~= 'vector3' and (coordsType ~= 'table' or not coords.x) then typeError('data.coords', 'vector3', coordsType) end
    checkConfig(data.config)

    data.resource = GetInvokingResource()
    return terminal.create(data)
end

---Removes a terminal by id or name.
---@param id number | string
---@return boolean removed
function api.removeTerminal(id)
    return terminal.remove(id)
end

---@param id number | string
---@return boolean
function api.terminalExists(id)
    return terminal.get(id) ~= nil
end

---Opens a hack directly on a player (without a terminal), e.g. from an item.
---@param source number
---@param config LcHackConfig
---@param cb? fun(success: boolean)
---@return boolean started false if the player is already hacking
function api.startHack(source, config, cb)
    if type(source) ~= 'number' then typeError('source', 'number', type(source)) end
    checkConfig(config)
    return session.start(source, config, cb)
end

---Stops the player's hack (counts as a failure) and closes the terminal.
---@param source number
function api.stopHack(source)
    if not session.exists(source) then return end
    session.finish(source, false)
    TriggerClientEvent('lc_hack:close', source)
end

---@param source number
---@return boolean
function api.isHacking(source)
    return session.exists(source)
end

return api
