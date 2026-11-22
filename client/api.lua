-- =====================================================================
--  lc_hack - client exports
--  Built like ox_target: every function on `api` automatically becomes an export.
-- =====================================================================

local terminal = require 'client.terminal'

local api = setmetatable({}, {
    __newindex = function(self, index, value)
        rawset(self, index, value)
        exports(index, value)
    end
})

---Is the hack terminal open right now?
---@return boolean
function api.isOpen()
    return terminal.open
end

---Closes the terminal. Counts as giving up, like pressing Escape.
function api.close()
    terminal.close()
end

return api
