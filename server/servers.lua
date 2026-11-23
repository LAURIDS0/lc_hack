-- =====================================================================
--  lc_hack - always-on servers and DNS (config.lua)
--  The servers are added to every hack. Their websites are loaded once,
--  when the resource starts: from index.html, every page, stylesheet and
--  image it links to is read and put in /var/www/html on the server.
--
--  Files players change on a server (e.g. a website they build in game)
--  are saved in serverdata.json, so they stay for everyone, also after
--  a restart. They are kept apart from config.lua:
--    written = path -> content (false = a folder)
--    deleted = path -> true
-- =====================================================================

local servers = {}

local MAX_FILES = 200 -- Per website, so a link loop or a huge site can't run away
local DATA_FILE = 'serverdata.json'
local MAX_FILE_SIZE = 100000 -- Bytes per file written by a player
local MAX_WRITTEN = 500      -- Files and folders written by players, per server
local MAX_OPS = 50           -- Changes in one message from a player
local WRITABLE = { '/tmp/', '/var/www/html/' } -- Besides the user's home; root writes everywhere
local IMAGE_TYPES = { png = 'image/png', jpg = 'image/jpeg', jpeg = 'image/jpeg', gif = 'image/gif', webp = 'image/webp' }
local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

---Binary images can't travel as text to the NUI, so they become base64.
---@param data string
---@return string
local function base64(data)
    return ((data:gsub('.', function(c)
        local bits, byte = '', c:byte()
        for i = 8, 1, -1 do bits = bits .. (byte % 2 ^ i - byte % 2 ^ (i - 1) > 0 and '1' or '0') end
        return bits
    end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(bits)
        if #bits < 6 then return '' end
        local n = 0
        for i = 1, 6 do n = n + (bits:sub(i, i) == '1' and 2 ^ (6 - i) or 0) end
        return B64:sub(n + 1, n + 1)
    end) .. ({ '', '==', '=' })[#data % 3 + 1])
end

---'a/b/../c.html' -> 'a/c.html'. '..' can never leave the website's folder.
---@param path string
---@return string
local function normalize(path)
    local parts = {}
    for part in path:gmatch('[^/]+') do
        if part == '..' then parts[#parts] = nil
        elseif part ~= '.' then parts[#parts + 1] = part end
    end
    return table.concat(parts, '/')
end

---Local files a page links to (href and src), relative to the website's root.
---@param html string
---@param page string The page's own path, e.g. 'careers/index.html'
---@return string[]
local function links(html, page)
    local dir = page:match('^(.*)/') or ''
    local found = {}
    for _, attr in ipairs({ 'href', 'src' }) do
        for raw in html:gmatch(attr .. '%s*=%s*["\']([^"\']+)["\']') do
            local url = raw:gsub('[?#].*$', '')
            -- Skip other sites (http:, mailto:, //cdn...) and anchors
            if url ~= '' and not url:find(':') and not url:find('^//') then
                local path = normalize(url:sub(1, 1) == '/' and url or dir .. '/' .. url)
                if url:sub(-1) == '/' or path == '' then path = (path == '' and '' or path .. '/') .. 'index.html' end
                found[#found + 1] = path
            end
        end
    end
    return found
end

---Loads a static website, starting at index.html.
---@param read fun(path: string): string? Reads a file in the resource
---@param folder string
---@return table<string, string> files path -> content (images as data: URLs)
function servers.loadWebsite(read, folder)
    local files, seen, queue, count = {}, {}, { 'index.html' }, 0
    while #queue > 0 and count < MAX_FILES do
        local path = table.remove(queue, 1)
        if not seen[path] then
            seen[path] = true
            local data = read(folder .. '/' .. path)
            if not data then
                print(('^3[lc_hack] website %s: %s not found^0'):format(folder, path))
            else
                count = count + 1
                local ext = (path:match('%.(%w+)$') or ''):lower()
                if IMAGE_TYPES[ext] then data = ('data:%s;base64,%s'):format(IMAGE_TYPES[ext], base64(data)) end
                files[path] = data
                if ext == 'html' or ext == 'htm' then
                    for _, link in ipairs(links(data, path)) do queue[#queue + 1] = link end
                end
            end
        end
    end
    return files
end

---Builds the servers from config: a copy of each, with the website's files added.
---@param config table
---@param read fun(path: string): string?
---@return table[] list, table<string, string> dns
function servers.build(config, read)
    local list = {}
    for _, s in ipairs(config.servers or {}) do
        local m = {}
        for k, v in pairs(s) do m[k] = v end
        m.files = {}
        for k, v in pairs(s.files or {}) do m.files[k] = v end
        if s.website then
            for path, data in pairs(servers.loadWebsite(read, s.website)) do m.files['/var/www/html/' .. path] = data end
            m.ports = m.ports or { 22, 80, 443 }
        end
        if s.website == true then m.files['/var/www/html/'] = '' end -- An empty website to build in game
        m.website = nil
        m.internet = true -- Every machine can reach it
        m.written, m.deleted = {}, {}
        list[#list + 1] = m
    end
    -- Names are matched in lowercase, like real DNS
    local dns = {}
    for name, ip in pairs(config.dns or {}) do dns[name:lower()] = ip end
    return list, dns
end

-- ---------- Changes made by players ----------

---The key a server's changes are saved under
local function key(m)
    return type(m.ip) == 'table' and m.ip[1] or m.ip
end

---'/a//b/./c' -> '/a/b/c'. nil for anything odd ('..', relative, too long).
---@param path any
---@return string?
local function cleanPath(path)
    if type(path) ~= 'string' or #path > 256 or path:sub(1, 1) ~= '/' then return nil end
    local parts = {}
    for part in path:gmatch('[^/]+') do
        if part == '..' then return nil end
        if part ~= '.' then parts[#parts + 1] = part end
    end
    return #parts > 0 and '/' .. table.concat(parts, '/') or nil
end

---May this login change the path? Same rule as canWrite in the NUI.
local function allowed(path, user, root)
    if root then return true end
    path = path .. '/'
    for _, dir in ipairs({ '/home/' .. user .. '/', table.unpack(WRITABLE) }) do
        if path:sub(1, #dir) == dir then return true end
    end
    return false
end

local function count(t)
    local n = 0
    for _ in pairs(t) do n = n + 1 end
    return n
end

---Applies a player's changes to a server. Everything is checked here, the NUI is not trusted.
---@param m table A server from servers.list
---@param ops table { op = 'write' | 'mkdir' | 'delete', path, content? }[]
---@param user string The machine user the player logged in as
---@param root boolean Did the player get root on it?
---@return table applied The changes that were allowed (to send to other players)
function servers.apply(m, ops, user, root)
    local applied = {}
    if type(ops) ~= 'table' or #ops > MAX_OPS then return applied end
    for _, op in ipairs(ops) do
        local path = type(op) == 'table' and cleanPath(op.path)
        local ok = path and allowed(path, user, root)
        local isNew = ok and m.written[path] == nil
        if ok and (op.op == 'write' or op.op == 'mkdir') and isNew and count(m.written) >= MAX_WRITTEN then ok = false end
        if ok and op.op == 'write' then
            local content = op.content
            -- An image that is a URL would make every player who views it load that URL (and leak their IP)
            local ext = (path:match('%.(%w+)$') or ''):lower()
            local isUrlImage = type(content) == 'string' and (IMAGE_TYPES[ext] or ext == 'svg') and content:match('^%s*https?:')
            if type(content) == 'string' and #content <= MAX_FILE_SIZE and not isUrlImage then
                m.written[path], m.deleted[path] = content, nil
                applied[#applied + 1] = { op = 'write', path = path, content = content }
            end
        elseif ok and op.op == 'mkdir' then
            if m.written[path] == nil then m.written[path] = false end
            m.deleted[path] = nil
            applied[#applied + 1] = { op = 'mkdir', path = path }
        elseif ok and op.op == 'delete' then
            for p in pairs(m.written) do
                if p == path or p:sub(1, #path + 1) == path .. '/' then m.written[p] = nil end
            end
            m.deleted[path] = true
            applied[#applied + 1] = { op = 'delete', path = path }
        end
    end
    if #applied > 0 and servers.save then servers.save() end
    return applied
end

-- ---------- In FiveM: build once from config.lua when the resource starts ----------

if LoadResourceFile then
    local config = require 'config'
    servers.list, servers.dns = servers.build(config, function(path)
        return LoadResourceFile(cache.resource, path)
    end)
    servers.search = config.search

    -- Changes saved last time
    local saved = json.decode(LoadResourceFile(cache.resource, DATA_FILE) or '{}') or {}
    for _, m in ipairs(servers.list) do
        local data = saved[key(m)]
        if data then m.written, m.deleted = data.written or {}, data.deleted or {} end
    end

    -- Saves at most once a second, however many changes come in
    local queued = false
    function servers.save()
        if queued then return end
        queued = true
        SetTimeout(1000, function()
            queued = false
            local data = {}
            for _, m in ipairs(servers.list) do data[key(m)] = { written = m.written, deleted = m.deleted } end
            SaveResourceFile(cache.resource, DATA_FILE, json.encode(data), -1)
        end)
    end
end

---Is the machine one of the servers from config.lua?
---@param m table
---@return boolean
function servers.isServer(m)
    for _, s in ipairs(servers.list or {}) do
        if s == m then return true end
    end
    return false
end

return servers
