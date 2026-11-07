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
| `air.restart(ch, block)` | bool | Stop and start it in one call — the watchdog's restart, audited as the script. For a stuck SRT session or a decoder that should re-dial. |
| `air.enable(ch, block)` | bool | Set the persisted intent to enabled, and make the block match it. This survives a restart where `start` does not. |
| `air.disable(ch, block)` | bool | The same, disabled. |

## Audio blocks

The audio side — audio delays, processing stages, audio encoders and decoders —
is called by **name**, the one on its page, not by channel number. `kind` is
`encoder`, `decoder`, `delay` or `stage` (`audio_encoder`, `enc`, `source`,
`stereotool` and the like are read the same). Every control goes through the
same door as a video one: audited as the script, refused (with `false`) on a
backup whose controls are locked, and a name that does not exist is a refusal,
not an error.

| call | returns | what it does |
|---|---|---|
| `air.audio_build(name)` | bool | build an audio delay (or a profanity stage) up to its depth |
| `air.audio_dump(name)` · `air.audio_dump_all(name)` | bool | dump one chunk, or everything it holds |
| `air.audio_rollout(name)` | bool | roll out to live |
| `air.audio_bypass(name)` | bool | straight to bypass (live), no rollout |
| `air.audio_cough(name, on)` | bool | hold (`true`, the default) or release a cough |
| `air.audio_censor(name[, seconds])` | bool | a censor that lands on the delayed audio; the configured length when `seconds` is left out |
| `air.audio_censor_on(name)` · `air.audio_censor_off(name)` | bool | hold a censor on, and release it |
| `air.audio_censor_force_off(name)` | bool | clear the pre and the post censor at once — the escape hatch |
| `air.audio_cough_post(name, on)` · `air.audio_censor_post(name, on)` | bool | dead air or tone **at the air point, now** — the post-delay covers |
| `air.audio_enable(kind, name)` · `air.audio_disable(kind, name)` | bool | the stored on/off of any audio block, and the block made to match it |
| `air.stereotool_bypass(stage, on)` | bool | Stereo Tool's bypass on a stage (by id or name): switched on the running engine — its consumers hear no gap — and stored |
| `air.dial(kind, name[, uri])` | bool | place a SIP call from an audio encoder or decoder; to its configured address when `uri` is left out |
| `air.hangup(kind, name)` | bool | end that block's call. **Never refused**, on a backup or anywhere: an operator must always be able to end a call |
| `air.answer(kind, name)` | bool | answer a call ringing on it |

The reads, which like every read are never refused:

| call | returns | what it is |
|---|---|---|
| `air.audio_state(name)` | `building` \| `full` \| `exiting` \| `bypass` \| `stopped`; `""` for no such delay | an audio delay's state word |
| `air.audio_depth(name)` · `air.audio_target_depth(name)` | seconds, `0` for no such delay | its depth now, and what it builds to |
| `air.audio_running(kind, name)` | bool | is that block running (an encoder held on a standby is not) |
| `air.audio_connected(kind, name)` | bool | is it fed (a delay or stage) or connected to its far end (an encoder or decoder) |
| `air.call_state(kind, name)` | `idle` \| `calling` \| `ringing` \| `incoming` \| `in_call` \| `failed` \| `held`; `""` when not on SIP | its SIP call |
| `air.audio_names(kind)` | array of strings | every configured block of that kind (stages by id) — loop over them as over `air.channels()` |

```lua
-- Dump every audio delay that is on air when the studio's red button goes.
function main(trigger, channel, event, args)
  for _, name in ipairs(air.audio_names("delay")) do
    if air.audio_state(name) == "full" then air.audio_dump(name) end
  end
end
```

## Email and webhooks

Through the SMTP server and webhook URLs on **Server › Email & alerts** — the
alarms' own — and the alarms' own queues: the call returns as soon as the
message is queued, so a slow mail server or a dead endpoint never holds the
script, and what became of the message is in the log (`alarm email sent …`,
`alarm webhook … failed: …`).

| call | returns | what it does |
|---|---|---|
| `air.email(subject, body[, to])` | bool | a plain-text email (the same text as HTML), the subject after the configured prefix; `to` — a comma list — replaces the configured recipients. Refused (`false`) when email is not enabled and set up |
| `air.webhook(payload[, url])` | bool | POST `{"event": "script", "script", "instance", "host", "time", "whenUtc", "payload"}` to every configured URL, or to the one named — it must be one of them. A table (Lua) or object (JS) payload is sent as JSON — a Lua sequence as an array — and anything else as itself. Signed with `X-Airlock-Signature` like an alarm, retried the same way, 64 KB at most |

Both are **refused on a backup** that is not speaking for the plant (the primary
is sending the same thing), audited as the script (`script.email`,
`script.webhook`), and rate-limited: **10 emails and 60 webhooks a minute per
script**. A receiver tells a script's message from an alarm's by `event`.

```lua
-- Tell the newsroom when the breakfast delay goes to air.
function main(trigger, channel, event, args)
  if args.event == "EnteredDelayed" then
    air.email("Breakfast is delayed", "On air at " .. air.audio_depth(event) .. " s")
    air.webhook({ show = event, state = "delayed", depth = air.audio_depth(event) })
  end
end
```

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
