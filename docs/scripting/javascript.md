# JavaScript

QuickJS, compiled into the binary. Nothing to install on either platform. Pick JavaScript when **the payload is JSON**: `JSON.parse` and `JSON.stringify` are in the sandbox, and Lua has no JSON library at all.

## The entry function

```javascript
function main(trigger, channel, event, args) {
  air.log("info", "ran on " + trigger);
  if (trigger === "DataReceived" && args.receiver === "auto") return air.build(1);
}
```

`args` is a plain object of string keys to string values, and it is **`undefined`** when the trigger carries no arguments. Guard it: `var raw = (args && args.data) ? args.data : "";`.

Return a short string saying what happened. A returned object is rendered with `JSON.stringify`; `undefined` and `null` record nothing.

Set the function's name in the editor's **Entry function** field. Leave it empty and the script is called at `scripting.entry` (`main` by default), or at `onstart` / `onstop` for a `startup` / `shutdown` binding.

## Module shape

Keep the top level to **constants and function definitions**. Do the work inside the entry function, where the invocation budget applies.

```javascript
// Configuration at the top, where an operator can find it.
var CH = 1;
var NOTIFY = "plant";   // data sender to report on; "" = don't report

// Helpers next.
function tell(o) {
  o.at = new Date().toISOString();
  var line = JSON.stringify(o);
  air.log("warn", line);
  if (NOTIFY !== "") air.send_data(NOTIFY, line);
}

// The entry function last.
function main(trigger, channel, event, args) {
  tell({ event: "depth", channel: CH, depth: air.depth(CH) });
}
```

A script that must handle several triggers is one file installed several times, switching on `trigger`.

## Both spellings

Every host call answers to the snake_case and the PascalCase spelling, and they are the same call:

```javascript
air.build(1);     air.Build(1);
```

There is no colon form — that is a Lua construction.

## What is not there

A bare QuickJS context is the ECMAScript language and its built-ins. You have `JSON`, `Math`, `Date`, `String`, `Array`, `Object`, `Map`, `Set`, `RegExp` and `Promise` as a language feature — and that is the end of it.

- No **`require`**, no `import` resolution, no module loader is installed.
- No **`process`**, no `globalThis.global`, no `Deno`, no `importScripts`.
- No **`fetch`**, no `XMLHttpRequest`, no `WebSocket` — no network binding exists to call.
- No filesystem binding of any kind.
- No **`setTimeout`** or `setInterval`, and no event loop to run them on. A promise that is not already settled never settles: there is nothing to pump it. Use the `timer` trigger, or `air.after`.
- `console` exists and is wired to the host log. That is the whole of the host environment beside `air`.
- The instance's heap is capped at **64 MiB**, so a runaway allocation fails inside the script rather than inside the process.

## Gotchas

**`console.log`, `.info`, `.warn`, `.error` and `.debug` all log at `info`**, and take **one** argument. Use `air.log(level, message)` when the level matters, and build the string yourself.

**`async`/`await` is a trap.** `Promise` is a language feature, but there is no event loop and nothing pumps the job queue — so a continuation after an `await`, or inside a `.then()`, never runs, and the entry function returns a promise nobody waits for. Write synchronous code.

**Always `try`/`catch` a `JSON.parse` of anything from outside.** A malformed payload, or a variable somebody hand-edited, must not break the next run:

```javascript
function load() {
  try {
    return JSON.parse(air.get_var(VAR) || "{}") || {};
  } catch (e) {
    air.log("warn", VAR + " was not JSON (" + e + ") — starting it again");
    return {};
  }
}
```

**`air.get_number` and `air.get_bool` answer `undefined` when the variable is absent *or* unparseable.** Supply your own default: `(air.get_number("n") || 0)`.

**A trigger with no channel hands the script `-1`.** Clamp it: `var ch = channel < 1 ? 1 : channel;`.

**A refusal is a `false`, not a throw.** Test the return value of every mutating call and say why it was refused; see [Refusals](api.md#refusals).

**A loop at the top level is cut after 5 seconds**, and validation cannot catch it — **Check** and every save compile without executing. Keep the top level to definitions.

**You have a clock.** `Date` is part of the language, so a JavaScript script can stamp what it stores. Lua cannot.

## Example: a timer that remembers, in one JSON variable

`examples/timer-counter.js`. The same timer as the [Lua twin](lua.md#example-a-timer-that-remembers), keeping its whole state in **one JSON variable** instead of four flat ones. That is the JavaScript-shaped way to do it.

```javascript
var CH = 1;            // the delay channel to watch
var SHORT_PCT = 0.90;  // below this fraction of target counts as short
var WARN_AFTER = 3;    // ticks short of target before one warning is logged
var VAR = "depth.state";

// A variable that is absent, or that somebody hand-edited into something that
// is not JSON, must not break the next run: fall back to an empty state.
function load() {
  try {
    return JSON.parse(air.get_var(VAR) || "{}") || {};
  } catch (e) {
    air.log("warn", VAR + " was not JSON (" + e + ") — starting it again");
    return {};
  }
}

function main(trigger, channel, event, args) {
  var s = load();
  s.samples = (s.samples || 0) + 1;
  s.state = air.state(CH);
  s.depth = air.depth(CH);
  s.target = air.target_depth(CH);
  s.at = new Date().toISOString();

  if (s.depth < 0) {
    air.log("warn", "there is no channel " + CH + " on this box");
    return "no channel";
  }
  if (s.state !== "delayed") {
    // Live, building and rolling out are all legitimately shallow.
    s.short_run = 0;
  } else {
    if (s.lowest === undefined || s.depth < s.lowest) s.lowest = s.depth;
    if (s.target > 0 && s.depth < s.target * SHORT_PCT) {
      s.short_run = (s.short_run || 0) + 1;
      if (s.short_run === WARN_AFTER) {
        s.episodes = (s.episodes || 0) + 1;
        air.log("warn", "ch" + CH + " short of depth for " + s.short_run + " ticks — "
          + s.depth.toFixed(2) + " of " + s.target.toFixed(2) + " s");
      }
    } else {
      s.short_run = 0;
    }
  }

  // `set_var` answers false when the store refuses the write. It never throws,
  // so say so and carry on.
  if (!air.set_var(VAR, JSON.stringify(s))) air.log("error", "could not store " + VAR);
  return JSON.stringify(s);
}
```

The variable it keeps:

```json
{"samples":12,"state":"delayed","depth":5.96,"target":6,
 "lowest":5.88,"short_run":0,"episodes":1,"at":"2026-10-18T03:00:00.000Z"}
```

!!! warning "A variable is capped at 16 KiB"
    A JSON blob is fine for a state record and is the wrong place for a history. Keep a summary, not a log.

## Example: a watchdog that reports JSON

`examples/status-watchdog.js`. One file, up to three bindings — `encoderEvent`, `decoderEvent` and `alarm` — switching on `trigger`. A block that went `Down` is started again, at most three times per outage; a raised alarm is reported to the plant as JSON, for a monitoring system rather than a person.

```javascript
var RESTART_CAP = 3;   // restarts per outage before it gives up and says so
var NOTIFY = "plant";  // data sender to report on; "" = don't report at all

function tell(o) {
  o.at = new Date().toISOString();
  o.alarms = air.alarms();
  var line = JSON.stringify(o);
  air.log("warn", line);
  if (NOTIFY !== "") air.send_data(NOTIFY, line);
}

function onBlock(ch, block, event) {
  var key = "watchdog.ch" + ch + "." + block;
  if (event !== "Down") {
    air.delete_var(key); // it is up: the cap is per outage, not for ever
    return block + " on ch" + ch + " is " + event.toLowerCase();
  }
  // A block an operator has disabled is meant to be down.
  if (air.block_state(ch, block) === "disabled") return block + " on ch" + ch + " is disabled — left alone";

  var tries = (air.get_number(key) || 0) + 1;
  if (tries > RESTART_CAP) {
    tell({ event: "give_up", channel: ch, block: block, restarts: RESTART_CAP });
    return "cap reached";
  }
  air.set_var(key, String(tries));
  if (air.start(ch, block)) {
    tell({ event: "restarted", channel: ch, block: block, attempt: tries, cap: RESTART_CAP });
    return "restarted";
  }
  // Refused, not failed: the channel lock, a backup, or a block that cannot run.
  tell({ event: "restart_refused", channel: ch, block: block });
  return "refused";
}

function onAlarm(ch, code, args) {
  var key = "alarm." + code;
  if (!args || args.state !== "raised") {
    air.delete_var(key);
    tell({ event: "alarm_cleared", channel: ch, code: code });
    return "cleared";
  }
  air.set_var(key, String((air.get_number(key) || 0) + 1));
  tell({ event: "alarm_raised", channel: ch, code: code,
         message: args.message || "", block: args.block || "" });
  return "raised";
}

function main(trigger, channel, event, args) {
  var ch = channel < 1 ? 1 : channel; // -1 when the trigger carries no channel
  if (trigger === "EncoderEvent") return onBlock(ch, "encoder", event);
  if (trigger === "DecoderEvent") return onBlock(ch, "decoder", event);
  if (trigger === "Alarm") return onAlarm(ch, event, args);
  air.log("info", "nothing to do for " + trigger + " " + event);
  return "ignored " + trigger;
}
```

Install it three times, once per trigger:

| Name | Trigger | Channel | Name filter |
|---|---|---|---|
| `watch encoder js` | `encoderEvent` | 1 | empty |
| `watch decoder js` | `decoderEvent` | 1 | empty |
| `watch alarms js` | `alarm` | 0 (any) | empty, or one alarm code |

Three things worth noting:

- **block state is polled at 4 Hz**, so a block that goes down and comes back inside 250 ms is seen once, or not at all. This is a watchdog, not a trace;
- it **never loops waiting** for the block to come up. There is no sleep in the host API, and a run that does not return inside the budget is cut;
- a block an operator has **disabled** is meant to be down. Starting it would be overriding a decision, not repairing a fault.
