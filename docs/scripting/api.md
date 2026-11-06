# Host API

Everything a script can reach is on one global: the table `air` in Lua, the object `air` in JavaScript. This page is the complete reference — every function, its arguments, what it answers, and when it says no.

## How a call is spelled

Every call answers to **two spellings**: the snake_case one used throughout this manual, and the PascalCase one a ported script uses. In Lua it also answers to the colon form. These three are the same call:

```lua
air.build(1)      air.Build(1)      air:Build(1)
```

`ch` is a channel number. **Leave it out, pass `0`, or pass something that is not a number, and channel 1 is used** — what a one-channel box means by `air.build()`. Optional arguments are marked.

`block` is `delay` (the default, and what an empty string means), `encoder` (`enc`) or `decoder` (`dec`). Any other word is a refusal.

## Diagnostics

| Call | Returns | What it does |
|---|---|---|
| `air.log(level, message)` | `true` | One line in the process log and in the Live log the console shows. `level` is `debug` \| `info` \| `warn` \| `error`; anything else is treated as `info`. |
| `air.log(message)` | `true` | The same, at `info`. |
| `air.name` | string | This script's own name — the name in the audit log, the store and the REST path. A property, not a function. |

`print` in Lua, and `console.log` / `.info` / `.warn` / `.error` / `.debug` in JavaScript, are wired to `air.log` at **info**, so the first thing you type goes somewhere you can read.

## Transport

Each of these answers **`true` when it was accepted** and **`false` when it was refused**. See [Refusals](#refusals).

| Call | What it does |
|---|---|
| `air.build(ch)` | Build to the target depth. |
| `air.rollout(ch)` | Roll out of delay, back to live. |
| `air.dump(ch[, seconds])` | Dump `seconds` from the buffer. With no `seconds`, the channel's configured `delay.dump_seconds` — and if that is `0`, the whole buffer. |
| `air.dump_all(ch)` | Dump the whole buffer, straight back to live. |
| `air.set_depth(ch, seconds)` | Set the target depth. A channel sitting live has to be told to `build` afterwards; one already delayed converges on the new target. |
| `air.cough(ch[, on])` | The momentary cough: while it is on the delay stops recording. `on` defaults to `true`. |
| `air.censor(ch[, seconds])` | Censor the newest `seconds` — the channel's configured window when omitted. |
| `air.censor_on(ch)` | The censor latch: hold it open. |
| `air.censor_off(ch)` | Release the latch after its tail. |
| `air.censor_force_off(ch)` | The panic exit: drop the latch and every pending span immediately. |
| `air.slate(ch[, on])` | Put the slate to air, or take it off. `on` defaults to `true`. |
| `air.scte_block(ch[, on])` | Block cues on this channel's SCTE rails, or let them pass. `on` defaults to `true`. |

!!! tip "Setting a depth is not building to it"
    `air.set_depth` moves the target. Read `air.state(ch)` first: if it is `live`, follow with `air.build(ch)`. A channel already `delayed` converges on the new target by itself.

## Cues

| Call | Returns | What it does |
|---|---|---|
| `air.cue(ch, options)` | bool | **Originate a SCTE cue** on this channel. `options` is a table or object, or a bare string naming the type. |

`air.cue` takes the same fields the REST surface does and goes through the same parser and the same controller call, so a cue from a script is audited, locked and licensed exactly as one from the console.

| Field | Default | Meaning |
|---|---|---|
| `type` (or `kind`) | `out` | `out` · `out_now` · `in` · `in_now` · `cancel` · `time_signal`. `_now` is the immediate form, which carries no pre-roll (`out_immediate` and `in_immediate` are accepted spellings). |
| `duration_s` | `30` | Break length, in seconds. |
| `pre_roll_ms` | `0` | Notice before the splice point. Immediate cues carry none; a non-immediate cue originated here is held to the 4 s floor. |
| `event_id` | `1` | `splice_event_id`. |
| `program_id` | `0` | `unique_program_id`. |
| `avail` · `avails` | `0` · `0` | `avail_num` and `avails_expected`. |
| `auto_return` | `true` | Whether the splice tells the downstream to return by itself at the end of the break. `0`, `false`, `no` and `off` turn it off. |
| `seg_type` | `provider_ad_start` | `time_signal` only: the segmentation type, as a word or a number. |
| `upid` · `segment` · `segments` | `""` · `1` · `1` | `time_signal` only. |

A bad field is a refusal with a message, not a malformed cue: `type` must be one of the words above, and every numeric field must parse.

```lua
air.cue(4, "out_now")                               -- a bare string is the type
air.cue(4, { type = "out_now", duration_s = 30, program_id = 1 })
```

To control the return precisely rather than leaving it to `auto_return`, originate the break with `auto_return = false` and schedule the `in_now` yourself with [`air.after`](#one-shot-timers).

## One-shot timers

| Call | Returns | What it does |
|---|---|---|
| `air.after(ms, id)` | bool | Fire the `scriptDelayed` trigger with this identifier once, `ms` from now. Setting an identifier that is already waiting **replaces** it, so calling this on every pass of a repeating event cannot build a queue. Resolution is 250 ms. `false` when no identifier was given. |
| `air.cancel_after(id)` | bool | Cancel a pending one. `true` when something was waiting. |

## Blocks

| Call | Returns | What it does |
|---|---|---|
| `air.start(ch, block)` | bool | Start it now. |
| `air.stop(ch, block)` | bool | Stop it now. Stopping something that is not running is **not** an error on any surface, so this answers `true`. |
| `air.enable(ch, block)` | bool | Set the persisted intent to enabled, and make the block match it. This survives a restart where `start` does not. |
| `air.disable(ch, block)` | bool | The same, disabled. |

## Data

| Call | Returns | What it does |
|---|---|---|
| `air.send_data(sender, text)` | bool | Write a message into a named data sender. The same path the TCP `DATA` verb uses: audited, `\n` `\r` `\t` escapes processed, and suppressed on a backup like every other outward send. |

## Reads

A read is **never refused**. It answers on a locked backup and on a channel somebody else holds, which is what lets a refused script say *why* it was refused rather than only that it was.

| Call | Returns | What it is |
|---|---|---|
| `air.state(ch)` | `live` \| `building` \| `delayed` \| `rolling out` \| `stopped`; `""` for no such channel | The delay's state word, with any dissolve or maintenance qualifier stripped, so a script matches one word. |
| `air.depth(ch)` | seconds, `-1` for no such channel | The depth in the buffer now. |
| `air.depth_frames(ch)` | frames, `-1` for no such channel | The same, in frames. |
| `air.target_depth(ch)` | seconds, `-1` for no such channel | What it is building towards. |
| `air.block_state(ch, block)` | `running` \| `stopped` \| `disabled`; `""` for no such channel | One block's state, the same word every other surface reports. |
| `air.running(ch, block)` | bool | Is that block running. |
| `air.encoder_state(ch)` | as `block_state` | Shorthand for `air.block_state(ch, "encoder")`. |
| `air.decoder_state(ch)` | as `block_state` | Shorthand for `air.block_state(ch, "decoder")`. |
| `air.encoder_running(ch)` | bool | Shorthand for `air.running(ch, "encoder")`. |
| `air.decoder_running(ch)` | bool | Shorthand for `air.running(ch, "decoder")`. |
| `air.locked(ch)` | bool | Is the channel claimed by a leader. |
| `air.lock_holder(ch)` | string, `""` when unlocked | Who holds it. |
| `air.locked_out()` | string, `""` when not locked out | Is **this box** a backup with its controls locked, and why. Use it to stay quiet rather than be refused call by call. |
| `air.channels()` | array of numbers | Every channel id this process runs. |
| `air.alarms([ch])` | array of code strings | The active alarm codes: one channel's, or the whole box's when `ch` is omitted. Process-wide alarms live on channel 0 and are always in that answer. |

!!! note "`air.locked_out()` answers a string, not a boolean"
    It is the **reason**, and an empty string means "not locked out". Test it with `air.locked_out() ~= ""` in Lua, `air.locked_out() !== ""` in JavaScript — and log the reason you were given.

## Persistent variables

| Call | Returns | What it does |
|---|---|---|
| `air.get_var(name)` | string, or `nil` / `undefined` when absent | The raw value. |
| `air.set_var(name, value)` | bool | Store it. `false` when the store refuses it — a cap, or a full store. |
| `air.delete_var(name)` | bool | Remove it. `true` when something was removed. |
| `air.get_number(name)` | number, or `nil` / `undefined` | Parsed. Nothing when absent **or** unparseable, so the script supplies its own default: `air.get_number("n") or 0`. |
| `air.get_bool(name)` | bool, or `nil` / `undefined` | `true`/`false` first, then `1`/`yes`/`on` and `0`/`no`/`off`. Anything else is nothing. |

Everything is a string on the wire. See [Variables and examples](examples.md) for the caps and the rules.

## Refusals

**A refusal is a `false`, never an exception.** Automation written against a plant that sometimes says no should be able to carry on, and an operator reading the page should see a refusal rather than a stack trace.

A command is refused when:

- **another operator holds the channel lock** — `air.lock_holder(ch)` names them;
- **this box is a backup with its controls locked** — `air.locked_out()` says so. In the expired-grace state `air.dump`, `air.dump_all` and `air.rollout` are still allowed: those two exits are never taken away from an operator;
- **the block it drives is not running or is disabled** — `air.block_state(ch, block)` says which;
- **the arguments name nothing** — an unknown block, a channel that does not exist, a sender that does not exist;
- **the licence does not carry the feature** the command needs. Dump and rollout are never refused by the licence.

By the time the script sees `false`, the host has already written the reason to the audit log **and** to the script log:

```text
audit:     ch1 script automation lua delay.dump — 5 s at 9.96 s — refused: LOCKED: the delay is locked to studio-a …
scripting: automation lua → dump 5 s ch1 refused: LOCKED: the delay is locked to studio-a …
```

### The house idiom

Never report a refused command as done, and say why in one line.

=== "Lua"

    ```lua
    if not air.dump(ch, 5) then
      local locked = air.locked_out()
      if locked ~= "" then
        air.log("warn", "this box is a backup: " .. locked)
      elseif air.locked(ch) then
        air.log("warn", "ch" .. ch .. " is locked to " .. air.lock_holder(ch))
      else
        air.log("warn", "delay on ch" .. ch .. " is " .. air.block_state(ch, "delay"))
      end
    end
    ```

=== "JavaScript"

    ```javascript
    if (!air.dump(ch, 5)) {
      var locked = air.locked_out();
      if (locked !== "") air.log("warn", "this box is a backup: " + locked);
      else if (air.locked(ch)) air.log("warn", "ch" + ch + " is locked to " + air.lock_holder(ch));
      else air.log("warn", "delay on ch" + ch + " is " + air.block_state(ch, "delay"));
    }
    ```

!!! warning "Do not write `cond and f() or g()`"
    These calls return `false` on a refusal, so in Lua `asserted and air.censor_on(ch) or air.censor_off(ch)` calls `censor_off` whenever `censor_on` is refused. Spell it out with an `if`.

## What is not here

There is **no sleep and no blocking call anywhere in the host API**, by design. A script that wants to act later binds to a `timer` or a `schedule`, or sets a one-shot with `air.after`. A script that stops returning is cut by the invocation budget.

Nothing in the host API can change the configuration, write a script, add a user, mint a token or read the audit log. The authority is an operator's, not an administrator's.
