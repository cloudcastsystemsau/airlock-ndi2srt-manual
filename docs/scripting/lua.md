# Lua

Lua 5.4, compiled into the binary. Nothing to install on either platform. This is the language most operators already write, and a ported script runs by pasting it — the `air:Build(1)` colon spelling included.

## The entry function

```lua
function main(trigger, channel, event, args)
  air.log("info", "ran on " .. trigger)
  if trigger == "DataReceived" and args.receiver == "auto" then
    return air.build(1)
  end
end
```

`args` is a plain table of string keys to string values, and it is **`nil`** when the trigger carries no arguments. Guard it: `local line = args and args.data or ""`.

Return a short string saying what happened. It is recorded with the run and shown on the Scripts page.

Set the function's name in the editor's **Entry function** field. Leave it empty and the script is called at `scripting.entry` (`main` by default), or at `onstart` / `onstop` for a `startup` / `shutdown` binding.

## Module shape

Keep the top level to **constants and function definitions**. Do the work inside the entry function, where the invocation budget applies.

```lua
-- Configuration at the top, where an operator can find it.
local CH = 1
local NOTIFY = "plant"   -- data sender to report on; "" = don't report

-- Helpers next.
local function tell(line)
  air.log("info", line)
  if NOTIFY ~= "" then
    air.send_data(NOTIFY, line)
  end
end

-- The entry function last.
function main(trigger, channel, event, args)
  tell("depth is " .. air.depth(CH))
end
```

A script that must handle several triggers is one file installed several times, switching on `trigger`:

```lua
function main(trigger, channel, event, args)
  if trigger == "EncoderEvent" then
    return on_block(channel, "encoder", event)
  elseif trigger == "Alarm" then
    return on_alarm(channel, event, args)
  end
  air.log("info", "nothing to do for " .. trigger)
  return "ignored " .. trigger
end
```

## Both spellings, and the colon form

Every host call answers to three spellings, and they are the same call:

```lua
air.build(1)      air.Build(1)      air:Build(1)
```

The colon form passes the host table as an implicit first argument, and no host call takes a table first, so it is dropped. A script written against a PascalCase host runs unchanged.

## What is not there

The libraries that reach the machine are **never opened**, so there is nothing to take away afterwards. Opened: `string`, `table`, `math`, `coroutine`, and the base library.

- No **`os`** — no `os.execute`, no `os.getenv`, no `os.remove`, and **no clock**: no `os.time`, no `os.date`.
- No **`io`** — no file handles, no `io.open`, no stdin or stdout of its own. `print` is redirected to the host log.
- No **`package`** and no **`require`** — nothing can be loaded from disk, and there is no module path to point anywhere.
- No **`debug`** — no introspection of the host state, no hook tampering.
- No **`load`**, **`loadstring`**, **`loadfile`** or **`dofile`** — the doors back to all of the above are closed before a line of your source runs, so a script cannot compile more code at run time.
- No **`collectgarbage`**.
- No JSON, no XML, no HTTP, no sockets — there is no library and no binding.
- **No Rust value is ever handed to Lua.** The `air` table holds plain functions over numbers, strings and booleans; there is no userdata to reach through.

## Gotchas

**There is no clock.** A Lua script knows when it ran only from the trigger that ran it. A `schedule` binding is handed its own cron expression in `args.cron` and in `event`, which is exact and is enough: install one file twice and tell the passes apart by the expression.

**There is no JSON.** If the payload is JSON, write that script in [JavaScript](javascript.md). Pattern-matching JSON by hand is how quoting bugs get on air.

**Numbers are floats.** `tostring(2.0)` writes `2.0`, which is not what an operator wants to read in a counter. Use `string.format("%d", math.floor(n))`:

```lua
local function bump(name)
  local n = math.floor((air.get_number(name) or 0) + 1)
  air.set_var(name, string.format("%d", n))
  return n
end
```

**`air.get_number` and `air.get_bool` answer `nil` when the variable is absent *or* unparseable.** Always supply your own default: `air.get_number("n") or 0`.

**Do not write `cond and f() or g()`.** Host calls return `false` when they are refused, so `asserted and air.censor_on(ch) or air.censor_off(ch)` calls `censor_off` whenever `censor_on` is refused. Spell it out:

```lua
local ok
if asserted then
  ok = air.censor_on(ch)
else
  ok = air.censor_off(ch)
end
```

**A trigger with no channel hands the script `-1`.** Clamp it before you use it:

```lua
local ch = channel
if ch < 1 then ch = 1 end
```

**A loop at the top level costs the load's whole budget.** The load is bounded at 5 seconds and then cut with *the top level ran past its budget — keep it to definitions*. Validation cannot catch it either: **Check** and every save *compile* without executing, which is what makes a syntax check side-effect-free. Keep the top level to constants and function definitions.

**`print` goes to the host log at `info`.** Several arguments are joined with a space. Use `air.log(level, message)` when you want a level.

## Example: a timer that remembers

`examples/timer-counter.lua`. Bound to `timer`, every 30 s. It samples the delay and keeps what it found in four persistent variables, so the box can answer "has this channel been holding its depth?" across restarts.

```lua
local CH = 1          -- the delay channel to watch
local SHORT_PCT = 0.90 -- below this fraction of target counts as short
local WARN_AFTER = 3   -- ticks short of target before one warning is logged

local function num(name, default)
  return air.get_number(name) or default
end

local function bump(name)
  local n = math.floor(num(name, 0) + 1)
  air.set_var(name, string.format("%d", n))
  return n
end

function main(trigger, channel, event, args)
  local samples = bump("depth.samples")

  local state = air.state(CH)
  local depth = air.depth(CH)
  local target = air.target_depth(CH)
  if depth < 0 then
    air.log("warn", "there is no channel " .. CH .. " on this box")
    return "no channel"
  end

  -- Only a channel that is meant to be at depth can be short of it: live,
  -- building and rolling out are all legitimately shallow.
  if state ~= "delayed" then
    air.set_var("depth.short_run", "0")
    return string.format("%s, nothing to measure (sample %d)", state, samples)
  end

  if depth < num("depth.lowest", depth + 1) then
    air.set_var("depth.lowest", string.format("%.2f", depth))
  end

  if target > 0 and depth < target * SHORT_PCT then
    local run = bump("depth.short_run")
    -- The latch is the variable, not the script: one line per episode however
    -- long it lasts, and the next episode warns again.
    if run == WARN_AFTER then
      bump("depth.short_episodes")
      air.log("warn", string.format("ch%d short of depth for %d ticks — %.2f of %.2f s", CH, run, depth, target))
    end
  else
    air.set_var("depth.short_run", "0")
  end

  return string.format("%s %.2f/%.2f s (sample %d)", state, depth, target, samples)
end
```

The variables it keeps — visible on **Scripting ▸ Variables**:

| Variable | Meaning |
|---|---|
| `depth.samples` | Ticks since the counters were last cleared |
| `depth.lowest` | The shallowest depth seen while delayed, in seconds |
| `depth.short_run` | Consecutive ticks short of target; `0` when healthy |
| `depth.short_episodes` | How many separate shortfalls there have been |

## Example: automation commands on a data receiver

`examples/automation.lua`. Bound to `dataReceived`, with the **Receiver** filter set to the receiver's name. The automation system sends one command per line, and the script turns those lines into the controls an operator would otherwise press.

| Command | What it does |
|---|---|
| `BUILD` | Build the delay to its target depth |
| `DUMP` | Dump the channel's configured `dump_seconds` |
| `DUMP <seconds>` | Dump that many seconds |
| `DUMP ALL` | Dump the whole buffer |
| `ROLLOUT` | Roll out of delay, back to live |
| `DEPTH <seconds>` | Set the target depth |
| `COUGH ON` · `COUGH OFF` | Hold the cough open, and let it go |
| `ENCODER START` · `ENCODER STOP` | Run or stop this channel's encoder |
| `STATUS` | Report state, depth and encoder back out through a data sender |
| `… CH <n>` | Address a channel other than 1 — `DUMP 5 CH 2` |

Set the receiver's framing to **`lines`**: that is what hands the script exactly one command per invocation, with the trailing CR already trimmed.

```lua
-- The data sender STATUS answers on. "" = don't reply at all.
local REPLY_TO = "plant"

local function words(s)
  local out = {}
  for w in string.gmatch(s or "", "%S+") do
    out[#out + 1] = w
  end
  return out
end

-- Pull a trailing `CH <n>` out of the word list and return the channel it named.
local function channel_of(p)
  for i = 1, #p do
    if string.upper(p[i]) == "CH" then
      local n = tonumber(p[i + 1])
      if n and n >= 1 then
        table.remove(p, i + 1)
        table.remove(p, i)
        return math.floor(n)
      end
    end
  end
  return 1
end

-- Why a call came back false. Nothing here mutates, so it is always safe to
-- ask: the reads are never refused, not even on a locked-out backup.
local function why(ch, block)
  local backup = air.locked_out()
  if backup ~= "" then
    return "this box is a backup — " .. backup
  end
  local holder = air.lock_holder(ch)
  if holder ~= "" then
    return "ch" .. ch .. " is locked to " .. holder
  end
  if block ~= "" and not air.running(ch, block) then
    return block .. " on ch" .. ch .. " is " .. air.block_state(ch, block)
  end
  return "the controller refused it — its reason is in the script log and the audit log"
end

-- One place where every command reports itself, so the page's last-run value
-- and the log line always agree.
local function done(ok, what, ch, block)
  if ok then
    air.log("info", what .. " ch" .. ch .. " ok")
    return what .. " ch" .. ch .. " ok"
  end
  air.log("warn", what .. " ch" .. ch .. " REFUSED: " .. why(ch, block))
  return what .. " ch" .. ch .. " refused"
end

function main(trigger, channel, event, args)
  -- `args` is absent when this is run by hand from the page.
  local line = args and args.data or ""
  line = string.gsub(line, "%s+$", "")
  local p = words(line)
  if #p == 0 then
    return nil -- a blank line or a keep-alive: nothing to do, and not an error
  end

  local ch = channel_of(p)
  local cmd = string.upper(p[1])
  local arg = string.upper(p[2] or "")

  if cmd == "BUILD" then
    return done(air.build(ch), "build", ch, "delay")
  elseif cmd == "DUMP" then
    if arg == "ALL" then
      return done(air.dump_all(ch), "dump all", ch, "delay")
    end
    local secs = tonumber(p[2])
    if p[2] and not secs then
      air.log("warn", "DUMP takes seconds or ALL, not '" .. p[2] .. "'")
      return "bad dump"
    end
    local what = secs and ("dump " .. secs .. " s") or "dump (configured)"
    return done(air.dump(ch, secs), what, ch, "delay")
  elseif cmd == "ROLLOUT" then
    return done(air.rollout(ch), "rollout", ch, "delay")
  elseif cmd == "DEPTH" then
    local secs = tonumber(p[2])
    if not secs then
      air.log("warn", "DEPTH needs seconds: '" .. line .. "'")
      return "bad depth"
    end
    return done(air.set_depth(ch, secs), "depth " .. secs .. " s", ch, "delay")
  elseif cmd == "COUGH" then
    if arg ~= "ON" and arg ~= "OFF" then
      air.log("warn", "COUGH takes ON or OFF: '" .. line .. "'")
      return "bad cough"
    end
    return done(air.cough(ch, arg == "ON"), "cough " .. string.lower(arg), ch, "delay")
  elseif cmd == "ENCODER" then
    if arg == "START" then
      return done(air.start(ch, "encoder"), "encoder start", ch, "")
    elseif arg == "STOP" then
      return done(air.stop(ch, "encoder"), "encoder stop", ch, "")
    end
    air.log("warn", "ENCODER takes START or STOP: '" .. line .. "'")
    return "bad encoder"
  elseif cmd == "STATUS" then
    local s = string.format("STATE ch%d %s depth %.2f encoder %s",
      ch, air.state(ch), air.depth(ch), air.block_state(ch, "encoder"))
    air.log("info", s)
    if REPLY_TO ~= "" and not air.send_data(REPLY_TO, s) then
      air.log("warn", "could not answer on sender '" .. REPLY_TO .. "' — " .. why(ch, ""))
    end
    return s
  end

  -- Not ours. Say so once, at info, and carry on.
  air.log("info", "ignored '" .. line .. "' from " .. (args and args.receiver or "?"))
  return "ignored " .. p[1]
end
```

Two habits worth copying from this file:

- **a refused command is never reported as done** — `done()` turns `false` into one line naming the cause;
- **anything unrecognised is logged at info and ignored**, never an error. A real feed carries traffic meant for other gear, and a script that threw on it would fill the error counter with somebody else's messages.
