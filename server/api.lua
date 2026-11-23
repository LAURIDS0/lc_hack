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
---@field desktop? 'ubuntu' | 'kali' | 'macos' | 'chromeos' | 'mint' | 'fedora' | 'random'
---@field processes? string[]
---@field files? table<string, string>
---@field locked? string[]
---@field website? string | true Only for servers in config.lua: folder with a static website, or true for an empty one to build in game
---@field onRoot? fun(source: number, machine: LcHackMachine) Called on the server when the player gets root on this machine

---@class LcHackConfig : LcHackMachine
---@field target? string | false The IP the player needs root on. false = no target, the hack ends when the player closes it
---@field attempts? number
---@field network? LcHackMachine[]
---@field commands? table<string, fun(source: number, args: string[]): string[] | string | nil> Extra terminal commands that run on the server

---@class LcHackScreen
---@field coords vector3 Center of the screen
---@field heading? number The heading of a player standing in front of the screen and looking at it
---@field width? number Width in meters (default 1.0)
---@field height? number Height in meters (default width * 9 / 16)
---@field distance? number How far away the screen is drawn (default 15.0)

---@class LcHackTerminal
---@field coords? vector3 Can be left out when there is a screen: the terminal is then placed on the screen
---@field config LcHackConfig
---@field screen? LcHackScreen
---@field name? string
---@field label? string
---@field radius? number
---@field keepDistance? number A closed hack is kept until the player is this far away (default 10.0)
---@field onSuccess? fun(source: number, id: number | string)
---@field onFail? fun(source: number, id: number | string)
---@field canUse? fun(source: number, id: number | string): boolean, string? Return false (and a message) to stop the player from using the terminal

---@class LcHackGameOptions
---@field secret any The answer, never sent to the client
---@field data? table Sent to the client UI
---@field attempts? number Wrong guesses allowed (default 3)
---@field time? number Time limit in seconds

local session = require 'server.session'
local terminal = require 'server.terminal'
local game = require 'server.game'

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
    if config.commands ~= nil and type(config.commands) ~= 'table' then typeError('config.commands', 'table', type(config.commands)) end
end

---Creates a terminal in the world. Using the same `name` again replaces the old one.
---@param data LcHackTerminal
---@return number id
function api.createTerminal(data)
    if type(data) ~= 'table' then typeError('data', 'table', type(data)) end

    checkConfig(data.config)

    local screen = data.screen
    if screen ~= nil then
        if type(screen) ~= 'table' then typeError('data.screen', 'table', type(screen)) end
        local screenType = type(screen.coords)
        if screenType ~= 'vector3' and (screenType ~= 'table' or not screen.coords.x) then typeError('data.screen.coords', 'vector3', screenType) end
    end

    -- coords may be left out when there is a screen: the terminal is then placed on the screen
    local coords = data.coords
    local coordsType = type(coords)
    if not (coords == nil and screen) and coordsType ~= 'vector3' and (coordsType ~= 'table' or not coords.x) then
        typeError('data.coords', 'vector3', coordsType)
    end

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
    if game.exists(source) then return false end
    return session.start(source, config, cb)
end

---Stops the player's hack (counts as a failure) and closes the terminal.
---@param source number
function api.stopHack(source)
    if not session.exists(source) then return end
    session.finish(source, false)
    TriggerClientEvent('lc_hack:close', source)
end

---Adds a machine to the player's running hack. Passwords stay on the server, like in a HackConfig.
---@param source number
---@param machine LcHackMachine
---@return boolean added false if the player isn't hacking
function api.addMachine(source, machine)
    if type(source) ~= 'number' then typeError('source', 'number', type(source)) end
    if type(machine) ~= 'table' then typeError('machine', 'table', type(machine)) end
    if machine.ip == nil then typeError('machine.ip', 'string', 'nil') end
    return session.addMachine(source, machine)
end

---@param source number
---@return boolean
function api.isHacking(source)
    return session.exists(source)
end

-- ---------------------------------------------------------------------
--  Minigames
-- ---------------------------------------------------------------------

---Registers a minigame. `check` runs on the server for every guess.
---@param name string
---@param data { check: fun(secret: any, guess: any): { correct: boolean, feedback?: any } }
function api.registerGame(name, data)
    if type(name) ~= 'string' then typeError('name', 'string', type(name)) end
    if type(data) ~= 'table' then typeError('data', 'table', type(data)) end
    if not data.check then typeError('data.check', 'function', type(data.check)) end
    game.register(name, data.check, GetInvokingResource())
end

---Starts a registered minigame for a player.
---@param source number
---@param name string
---@param options LcHackGameOptions
---@param cb? fun(success: boolean)
---@return boolean started false if the player is busy or the game isn't registered
function api.startGame(source, name, options, cb)
    if type(source) ~= 'number' then typeError('source', 'number', type(source)) end
    if type(options) ~= 'table' then typeError('options', 'table', type(options)) end
    return game.start(source, name, options, cb)
end

---Stops the player's minigame (counts as a failure) and closes its UI.
---@param source number
function api.stopGame(source)
    game.finish(source, false, true)
end

---@param source number
---@return boolean
function api.isPlaying(source)
    return game.exists(source)
end

return api
