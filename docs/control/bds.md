# BDS protocol

Airlock answers **BDS**, the TCP control protocol of the older ProfanityDelayService
(PDS), so automation written for a PDS profanity delay drives an Airlock audio
delay without changes. It is a separate listener from [TCP control](tcp.md), on
PDS's port **5002**, and it reaches the [audio delays](../audio/delay.md) only.

Use it when a playout system, a studio controller or a script already speaks to a
PDS box. For anything new, the [TCP control](tcp.md) port and the
[REST API](rest.md) are richer.

## Turning it on

The listener is **off by default**. Its settings are on **Server › Panel**, in the
**BDS protocol** card.

![The BDS protocol card on Server › Panel](../img/control/bds-settings.png){ .shot }

| Setting | Console label | Config key | Default | Meaning |
|---|---|---|---|---|
| Listener on | Enabled | `bds.enabled` | `false` | Run the listener at all. |
| Bind address | Bind | `bds.bind` | `0.0.0.0` | Interface to listen on. `127.0.0.1` keeps it on this machine. |
| Port | Port | `bds.port` | `5002` | PDS's port. It must differ from the TCP control port. |
| Allow list | Allow list | `bds.allow_list` | *(empty)* | Comma-separated peer IP addresses allowed in. Empty = any. Loopback is **always** allowed. |

```json
"bds": { "enabled": true, "bind": "0.0.0.0", "port": 5002, "allow_list": "" }
```

The listener starts with the service: **restart** after turning it on or changing
its port. If the port is taken, the log names the process holding it. A peer not on
the allow list is disconnected at once and audited as `bds.denied`.

!!! note "Machine-local"
    The `bds` settings are this machine's own: a standby keeps its listener
    settings when it mirrors its primary.

## Give each delay its Legacy Protocol ID

PDS automation addresses a delay as `DELAY_1`, `DELAY_2` and so on. Give each
audio delay the number your automation uses: **Audio › Delay**, the delay's
**Routing** tab, **Legacy Protocol ID**.

![Legacy Protocol ID on an audio delay's Routing tab](../img/audio/delay-legacy-id.png){ .shot }

- A whole number, 1 or more. Each delay needs its own; a save that gives two delays
  the same ID is refused, naming both.
- Blank keeps the delay off the BDS port.
- The ID is part of the delay's settings, so a standby answers to the same IDs as
  its primary.
- A delay's extra track pairs are not addressable on their own: they follow their
  delay, as they do on every other surface.

## Talking to it

ASCII lines; Airlock accepts CR LF or LF and replies with CR LF. Several commands
may arrive in one packet, and a command sent with no line ending still runs.
Commands are upper case.

```text
LOGIN
USER LOGGED IN
GET DELAYUNITS
STATUS
BEGIN
ID=1 NAME=Breakfast
ID=2 NAME=Drive
END
GET DELAY_1.DELAYSTATE,DELAYTIMESECONDS,DELAYSAFE
STATUS DELAY_1.DELAYSTATE=IN DELAY,DELAYTIMESECONDS=10,DELAYSAFE=TRUE
SET DELAY_1.DELAYCONTROL=DUMP
STATUS DELAY_1.DELAYSTATE=DUMPING
STATUS DELAY_1.DELAYTIME=3012
```

- **`LOGIN`** (anything after it is ignored; there is no password) answers
  `USER LOGGED IN`. `SET`, `SUB`, `UNSUB`, `ADD` and `DEL` before it answer
  `ERROR IN COMMAND - NOT LOGGED IN`. `GET` works without it.
- **One prefix per line.** `DELAY_<id>.` goes on the first item only; the rest of a
  comma list belongs to the same delay: `SET DELAY_1.COUGH=TRUE,CENSOR=FALSE`.
- **`SET` is silent.** A `SET` that worked replies nothing — what it did arrives as
  the pushes below. One that did nothing, named nothing Airlock knows, carried a
  value it could not read, or was refused replies `ERROR IN COMMAND`.

### SET

| Property | Values | Does |
|---|---|---|
| `DELAYCONTROL` | `BUILD` · `DUMP` · `DUMPALL` · `EXIT` | The transport. |
| `COUGH` · `CENSOR` · `POSTCOUGH` · `CENSORPOST` | `TRUE` · `FALSE` | **Held** states: `TRUE` covers until `FALSE`. `CENSOR` is the pre-censor latch. |
| `DELAYSIZE` | ms | **Max delay**. |
| `DUMPSIZE` | ms | **Dump size**. `0` dumps everything. |
| `BUILDRATE` · `EXITRATE` | percent, 1–10 | **Build rate** and **Exit rate**. |
| `DELAYBUILDMODE` | `EXPAND` · `INSERT` | **Build mode**. |
| `DELAYEXITMODE` | `ROLLOUT` · `COMPRESS` | **Exit mode**. `ROLLOUT` is PDS's rollout, Airlock's **Play out**; a delay already set to **Rollout** (crossfade) keeps it. |
| `DELAYINSERTMODE` | `FILE` · `EXTERNAL` | **Fill**: an asset, or **An input** (which needs an **Insert input**). `FILE` leaves a **Silence** fill as it is. |
| `DUMPMODE` | `DUMP` | Accepted. PDS's `CENSOR` dump mode is not something Airlock does, and is refused. |

Sound-card, data-port and dump-file properties (`WAVEINDEVICE`, `OPENDEVICES`,
`DATAPORT…`, `DUMPWRITEWAITTIME`) are Airlock configuration, not BDS commands: on a
line with other properties they are passed over; alone they answer
`ERROR IN COMMAND`. `ADD` and `DEL` (PDS's run-time ports) answer the same.

**Settings take effect on air.** A setting changed over BDS — or on the console, or
by REST — reaches the running delay without restarting it, so nothing it holds is
lost. A bigger **Max delay** grows the buffer in place; a build under way aims for
the new size at once; a delay already in delay keeps its depth until it next
builds. Each change is an ordinary saved setting: validated (out-of-range values
are refused), audited as `audio_delay.settings` with origin `bds`, and mirrored to
a standby.

### GET

The reply is `STATUS DELAY_<id>.<PROPERTY>=<value>[,…]`, upper case.

| Property | Value |
|---|---|
| `DELAYSTATE` | `IDLE` · `BUILDING` · `EXITING` · `IN DELAY`. A delay that is not running is `IDLE`. |
| `DELAYSAFE` | `TRUE` when the delay holds at least one whole dump. |
| `DELAYTIME` | ms, as at the last state change, dump or once-a-second update — as PDS reports it. |
| `DELAYTIMESECONDS` | the depth now, rounded seconds. |
| `DELAYEDSAMPLES` · `AVGDELAYTIME` | the depth now, ms. |
| `TIMETOBUILD` · `TIMETOEXIT` | seconds left in a build or an exit; `0` otherwise. |
| `BUILDRATE` · `EXITRATE` · `DELAYSIZE` · `DUMPSIZE` | as set (ms for the sizes). |
| `DELAYBUILDMODE` · `DELAYEXITMODE` · `DUMPMODE` · `DELAYINSERTMODE` | as set, in PDS's words. |
| `WAVEINDEVICE` · `WAVEOUTDEVICE` | the delay's source and output, as a `BEGIN`…`END` list. |
| `PROCESSEDSAMPLES` · `UNPROCESSEDSAMPLES` · `DUMPWRITEWAITTIME` | `0` (PDS internals). |

### SUB and UNSUB

```text
SUB DELAY_1.BUILD,DELAYTIME
SUB DELAY_1.BUILD=TRUE,DELAYTIME=TRUE
STATUS DELAY_1.DELAYTIME=9980
```

| Subscribe to | Then receives |
|---|---|
| `BUILD` | `STATUS DELAY_n.STATE=BUILDING DELAYTIME=<ms>` every second while building. |
| `EXIT` | `STATUS DELAY_n.STATE=EXITING DELAYTIME=<ms>` every second while exiting. |
| `DELAYTIME` · `DELAYTIMESECONDS` · `TIMETOBUILD` · `TIMETOEXIT` | that value every second while building or exiting, when the depth moves more than 10 ms otherwise, and at the events below. The current value follows the `SUB` reply at once. |

`UNSUB` takes the same items and answers `SUB DELAY_n.<item>=FALSE,…`. Every item
can be unsubscribed, including `TIMETOBUILD` and `TIMETOEXIT`, which PDS could not.

## What is pushed

Pushes go out as they happen. "Every client" means every connection, logged in or
not; "subscribers" means connections subscribed to that item of that delay.

| Event | To every client | To subscribers |
|---|---|---|
| → idle | `DELAYSTATE=IDLE`, `ROLLOUTOVERLAP=INACTIVE` | `DELAYTIMESECONDS=0`, `TIMETOBUILD`, `TIMETOEXIT` |
| → building | `DELAYSTATE=BUILDING` | — |
| → exiting | `DELAYSTATE=EXITING` | — |
| → in delay | `DELAYSTATE=IN DELAY` | `DELAYTIME`, `DELAYTIMESECONDS`, `TIMETOBUILD`, `TIMETOEXIT` |
| a dump or dump all | `DELAYSTATE=DUMPING`, then `DELAYTIME=<ms left>` | the four values |
| becomes safe or unsafe | `DELAYSAFE=TRUE` / `FALSE` | — |
| live starts joining the tail of an exit | `ROLLOUTOVERLAP=ACTIVE` | — |
| a setting changes, from any surface | `BUILDRATE=`, `EXITRATE=`, `DELAYSIZE=`, `DUMPSIZE=`, `DELAYBUILDMODE=`, `DELAYEXITMODE=`, `DELAYINSERTMODE=` — each one that changed | — |
| every second, building or exiting | — | the four values and `STATE=…` |

Each line is `STATUS DELAY_<id>.…`. A dump that empties the delay, or rebuilds it,
is followed by its state change.

## On a standby

A locked standby answers every control and setting with `ERROR IN COMMAND`, and
audits the refusal (`control.locked`, or a refused `audio_delay.settings`). `GET`
and `SUB` keep working, so a monitoring system can watch both boxes.

## Lamps that match PDS

The audio delay's GPIO lamps include PDS's status outputs, for a studio moving its
Axia map across: `rolloutOverlap` (held from the moment live joins the tail until
the exit ends), `rolloutendtrig`, `playbackStopped` (an enabled delay that is not
playing), and the depth fill lamps — `delay10` … `delay100` lit while the depth is
within 2% of that percentage of **Max delay**, `delay10static` … `delay100static`
lit at or above it, for a bar graph. See [Audio delay](../audio/delay.md#axia-gpio).

## Differences from PDS

Airlock follows PDS's parser and replies, and leaves out PDS's faults:

- A subscription to `DELAY_1` does not receive `DELAY_12`'s pushes.
- The 10 ms dead-band works both ways (PDS's swallowed most rises).
- `EXITRATE` is pushed with the exit rate (PDS sent the build rate).
- `SET …DUMPMODE=DUMP` alone is accepted (PDS applied it and answered an error).
- An unknown first `GET` item does not leave a stray comma in the reply.
- `SUB` puts the current values after the reply line (PDS spliced them into it,
  which broke the reply when a value item was not last).
- A line with a value that cannot be read applies nothing (PDS could apply the
  items before it).
- A setting is pushed when it changes, not every time it is set.

## Testing it by hand

```text
$ nc airlock.example 5002
LOGIN
USER LOGGED IN
SUB DELAY_1.BUILD
SUB DELAY_1.BUILD=TRUE
SET DELAY_1.DELAYCONTROL=BUILD
STATUS DELAY_1.DELAYSTATE=BUILDING
STATUS DELAY_1.STATE=BUILDING DELAYTIME=412
STATUS DELAY_1.STATE=BUILDING DELAYTIME=817
```

Every control and setting is in **Server › Audit log** with origin `bds` and the
peer's address.
