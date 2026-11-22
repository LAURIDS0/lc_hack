-- =====================================================================
--  lc_hack - minigame core
--  Other resources register a
--  game with a `check` function and ship their own UI. The core keeps the
--  secret on the server, checks every guess, counts attempts, enforces the
--  time limit and calls the win/loss callback.
--
--  Client side, a minigame resource listens for:
--    lc_hack:game:open   (name, { data, attempts, time })
--    lc_hack:game:close  (name)               -- time ran out, or stopGame
--  and uses:
--    lib.callback.await('lc_hack:game:guess', false, guess)
--      -> { correct, feedback, attempts, lost, timeout }
--    TriggerServerEvent('lc_hack:game:stop')  -- the player closed the UI
-- =====================================================================

local session = require 'server.session'

local game = {}
local registered = {} -- name -> { check, resource }
local playing = {}    -- source -> running game

local TIMEOUT_CHECK_INTERVAL = 1000

---@param name string
---@param check fun(secret: any, guess: any): { correct: boolean, feedback?: any }
---@param resource? string
function game.register(name, check, resource)
    registered[name] = { check = check, resource = resource }
end

---@param source number
---@return boolean
function game.exists(source)
    return playing[source] ~= nil
end

---Ends the player's game and calls the callback. The client UI closes itself on a
---guess result; `notify` also tells the client to close (timeouts, stopGame).
---@param source number
---@param success boolean
---@param notify? boolean
function game.finish(source, success, notify)
    local g = playing[source]
    if not g then return end
    playing[source] = nil
    if notify then TriggerClientEvent('lc_hack:game:close', source, g.name) end
    if g.onDone then
        local ok, err = pcall(g.onDone, success)
        if not ok then print(('^1[lc_hack] error in %s callback: %s^0'):format(g.name, err)) end
    end
end

---@param source number
---@param name string
---@param options { data?: table, secret: any, attempts?: number, time?: number }
---@param onDone? fun(success: boolean)
---@return boolean started false if the player is busy or the game isn't registered
function game.start(source, name, options, onDone)
    if playing[source] or session.exists(source) or not registered[name] then return false end

    local attempts = options.attempts or 3
    playing[source] = {
        name = name,
        secret = options.secret,
        attempts = attempts,
        expires = options.time and (os.time() + options.time) or nil,
        onDone = onDone,
    }
    TriggerClientEvent('lc_hack:game:open', source, name, { data = options.data or {}, attempts = attempts, time = options.time })
    return true
end

-- A guess from the player's minigame UI
lib.callback.register('lc_hack:game:guess', function(source, guess)
    local g = playing[source]
    if not g then return { correct = false, lost = true } end

    if g.expires and os.time() > g.expires then
        game.finish(source, false)
        return { correct = false, lost = true, timeout = true }
    end

    local ok, result = pcall(registered[g.name].check, g.secret, guess)
    if not ok or type(result) ~= 'table' then
        print(('^1[lc_hack] error in %s check: %s^0'):format(g.name, ok and 'check must return a table' or result))
        return { correct = false, attempts = g.attempts } -- Not the player's fault, no attempt used
    end

    if result.correct then
        game.finish(source, true)
        return { correct = true, feedback = result.feedback }
    end

    g.attempts = g.attempts - 1
    if g.attempts <= 0 then
        game.finish(source, false)
        return { correct = false, feedback = result.feedback, lost = true }
    end
    return { correct = false, feedback = result.feedback, attempts = g.attempts }
end)

-- The player closed the minigame
RegisterNetEvent('lc_hack:game:stop', function()
    game.finish(source, false)
end)

AddEventHandler('playerDropped', function()
    game.finish(source, false)
end)

-- Time limits
CreateThread(function()
    while true do
        Wait(TIMEOUT_CHECK_INTERVAL)
        local now = os.time()
        for source, g in pairs(playing) do
            if g.expires and now > g.expires then game.finish(source, false, true) end
        end
    end
end)

-- Forget games from resources that stop, and end their running games
AddEventHandler('onResourceStop', function(resource)
    for name, def in pairs(registered) do
        if def.resource == resource then
            registered[name] = nil
            for source, g in pairs(playing) do
                if g.name == name then game.finish(source, false, true) end
            end
        end
    end
end)

return game
