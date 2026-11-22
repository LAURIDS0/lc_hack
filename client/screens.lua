-- =====================================================================
--  lc_hack - screens (Direct-Rendered UI)
--  A terminal with a `screen` shows the hacker's terminal in the world,
--  so everyone nearby can watch in real time. Each screen is a DUI
--  running web/index.html in mirror mode, drawn as a flat quad with
--  DrawSpritePoly. DUIs are only created while the player is close.
-- =====================================================================

local screens = {}
local list = {} -- terminal id -> { screen, label, corners, dui, state }

local DUI_WIDTH, DUI_HEIGHT = 1280, 720
local DUI_URL = ('nui://%s/web/index.html?mirror'):format(cache.resource)

---The four corners of a screen. `heading` is the heading of a player
---standing in front of the screen and looking at it.
local function getCorners(screen)
    local rad = math.rad(screen.heading)
    local right = vector3(math.cos(rad), math.sin(rad), 0.0) * (screen.width / 2)
    local up = vector3(0.0, 0.0, screen.height / 2)
    local c = screen.coords
    return {
        topLeft = c - right + up,
        topRight = c + right + up,
        bottomRight = c + right - up,
        bottomLeft = c - right - up,
    }
end

---Sends the current state (or idle) to a screen's DUI.
local function send(entry)
    if entry.dui then entry.dui:sendMessage({ action = 'mirror', state = entry.state or false, label = entry.label }) end
end

---Draws one triangle of a screen. Drawn in both windings so the screen is visible
---no matter which side the game culls.
local function triangle(a, b, c, ua, va, ub, vb, uc, vc, dict, txt)
    DrawSpritePoly(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, 255, 255, 255, 255, dict, txt, ua, va, 1.0, ub, vb, 1.0, uc, vc, 1.0)
    DrawSpritePoly(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, 255, 255, 255, 255, dict, txt, uc, vc, 1.0, ub, vb, 1.0, ua, va, 1.0)
end

local function draw(entry)
    local q, dict, txt = entry.corners, entry.dui.dictName, entry.dui.txtName
    triangle(q.topLeft, q.topRight, q.bottomRight, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, dict, txt)
    triangle(q.topLeft, q.bottomRight, q.bottomLeft, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, dict, txt)
end

---@param t table Terminal from the server
function screens.add(t)
    screens.remove(t.id)
    if not t.screen then return end
    list[t.id] = { screen = t.screen, label = t.label, corners = getCorners(t.screen) }
end

---@param id number
function screens.remove(id)
    local entry = list[id]
    if not entry then return end
    if entry.dui then entry.dui:remove() end
    list[id] = nil
end

-- New screen state from the server (false = idle)
RegisterNetEvent('lc_hack:mirror', function(id, state)
    local entry = list[id]
    if not entry then return end
    entry.state = state or nil
    send(entry)
end)

-- Create DUIs for screens in range and remove them again when out of range.
-- The state is resent every couple of seconds, in case the DUI page loaded late.
CreateThread(function()
    while true do
        local pos = GetEntityCoords(cache.ped)
        for id, entry in pairs(list) do
            local distance = #(pos - entry.screen.coords)
            if distance <= entry.screen.distance and not entry.dui then
                entry.dui = lib.dui:new({ url = DUI_URL, width = DUI_WIDTH, height = DUI_HEIGHT })
                local state = lib.callback.await('lc_hack:getMirror', false, id)
                if list[id] == entry then entry.state = state or nil end
            elseif distance > entry.screen.distance + 5.0 and entry.dui then
                entry.dui:remove()
                entry.dui = nil
            end
            send(entry)
        end
        Wait(2000)
    end
end)

-- Draw every screen that has a DUI, every frame
CreateThread(function()
    while true do
        local drawing = false
        for _, entry in pairs(list) do
            if entry.dui then
                drawing = true
                draw(entry)
            end
        end
        Wait(drawing and 0 or 500)
    end
end)

return screens
