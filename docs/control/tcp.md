# TCP control

Airlock speaks a line protocol on TCP port 9350. It is the machine surface a
Stream Deck, a Companion button, a wall panel or a plant automation system
drives: one command per line, one reply per line, and pushed status for anything
that subscribes. This chapter documents every command, every reply shape and
every error code.

## Turning it on

The listener is **on by default**. Its settings live on **Server › Panel**.

| Setting | Console label | Config key | Default | Meaning |
|---|---|---|---|---|
| Listener on | Enabled | `tcp.enabled` | `true` | Run the listener at all. |
| Bind address | Bind | `tcp.bind` | `0.0.0.0` | Interface to listen on. `127.0.0.1` keeps it on this machine. |
| Port | Port | `tcp.port` | `9350` | The listener's port. |
| Allow list | Allow list | `tcp.allow_list` | *(empty)* | Comma-separated peer IP addresses allowed in. Empty = any. `*` = any. Loopback is **always** allowed. |
| Token | Tcp token | `auth.tcp_token` | *(empty)* | When set, a connection must open with `AUTH <token>`. |

```json
"tcp": { "enabled": true, "bind": "0.0.0.0", "port": 9350, "allow_list": "" },
"auth": { "tcp_token": "" }
```

A peer that is not on the allow list is told so and disconnected before it can
send anything:

```text
ERR 0 DENIED address not in allow list
```

That refusal is audited as `tcp.denied` with the peer address.

!!! note "Machine-local"
    `tcp.bind`, `tcp.port` and `tcp.allow_list` are machine-local settings: a
    standby keeps its own. The token is part of the replicated authentication
    block.

## Connecting

```bash
nc <host> 9350
```

- **Lines end CR LF.** A bare LF is accepted.
- **Verbs are case-insensitive**, and so are the keyword arguments (`DOWN`,
  `ALL`, `FORCE`, `STAGE`, block tags).
- Replies are `OK <ch> [data]` or `ERR <ch> CODE reason`, always CR LF
  terminated.
- A reply always comes back before any pushed status line for the same command.
- The connection stays open; there is no quit verb — close the socket.
- Many clients may connect at once. Each gets its own subscription state.

### Authentication

With `auth.tcp_token` empty there is no handshake. With it set, the **first**
line must be `AUTH`:

```text
> AUTH s3cret
< OK 0 AUTH
```

| Line | Reply | Then |
|---|---|---|
| `AUTH <correct>` | `OK 0 AUTH` | the connection is authenticated |
| `AUTH <wrong>` or `AUTH` with no token | `ERR 0 AUTH bad token` | the socket **closes** |
| `AUTH <anything>` when no token is configured | `OK 0 AUTH not required` | the connection continues |
| anything else before `AUTH` | `ERR 0 AUTH required` | the connection stays open; try again |

The token is one word and is compared in constant time. Companion and Stream
Deck profiles send it as the connection's first command. The handshake is
audited (`tcp.auth`, `tcp.auth_failed`).

## Channel addressing

**The channel argument is real on every verb.** `BUILD 2` builds channel 2 and
nothing else.

```text
BUILD 2 · DUMP 2 · ROLLOUT 2 · STATE 2 · COUGH 2 DOWN · LOCK 2 studio-b
```

| Situation | Reply |
|---|---|
| A channel that is not configured | `ERR 9 NOCHAN unknown channel` |
| Missing or non-numeric channel | `ERR 0 BADCH missing or non-numeric channel` |
| An unknown verb | `ERR 0 BADVERB unknown verb WAT` — answered on channel 0, **before** the channel is parsed, so it is never `NOCHAN` or `BADCH` |

Three verbs carry no channel at all: `PING`, `CHANNELS` and `DATA`. Two take
`ALL` instead of a channel: `SUBSCRIBE ALL` and `ALARMS ALL`.

Discover the channels before you address one:

```text
> CHANNELS
< OK 0 CHANNELS 1=Studio A,2=Studio B
```

(A comma in a channel name is replaced by a space, so the list is always safe to
split on commas.)

### Typed block targets

`STATE`, `ENABLE`, `DISABLE` and `SUBSCRIBE` also accept a block word before the
channel. The channel is then **optional** and defaults to 1.

| Word | Block |
|---|---|
| `ENC`, `VENC`, `ENCODER` | the channel's video encoder |
| `DEC`, `VDEC`, `DECODER` | the channel's video decoder |
| `DELAY`, `CH` | the channel's delay (the same as the bare form) |

```text
> STATE VENC 2
< OK 2 Running
> DISABLE ENC
< OK 1 Disabled
```

### Stage targets

An audio (profanity) delay or a processing stage is addressed as
`<VERB> STAGE <id>` instead of with a channel number — see *Audio stages* below.

## The command table

| Command | Arguments | Reply | Notes |
|---|---|---|---|
| `PING` | — | `OK 0 PONG` | Liveness. Never gated. |
| `CHANNELS` | — | `OK 0 CHANNELS 1=A,2=B` | Every configured channel. |
| `AUTH` | `<token>` | `OK 0 AUTH` | Handshake; see above. |
| `BUILD` | `<ch>` | `OK <ch>` | Start filling the buffer. |
| `DUMP` | `<ch>` | `OK <ch>` | Dump the channel's configured `delay.dump_seconds`. |
| `DUMPALL` | `<ch>` | `OK <ch>` | Empty the buffer; the output goes live. |
| `ROLLOUT` | `<ch>` | `OK <ch>` | Return to live and discard the buffer. |
| `EXIT` | `<ch>` | `OK <ch>` | Synonym for `ROLLOUT`. |
| `STATE` | `<ch>` | see below | The delay's full state line. |
| `STATE` | `<BLOCK> [ch]` | `OK <ch> Running\|Stopped\|Disabled` | A typed block's run state. |
| `ENABLE` | `[BLOCK] <ch>` | `OK <ch> Enabled` | Sets the persisted run flag **and** starts the block. |
| `DISABLE` | `[BLOCK] <ch>` | `OK <ch> Disabled` | Sets the flag **and** fully stops the block. |
| `COUGH` | `<ch> [DOWN\|UP]` | `OK <ch>` | Momentary. A bare `COUGH <ch>` is a press and release in one line. |
| `CENSOR` | `<ch> [seconds]` | `OK <ch>` | One-shot censor. Seconds must be `0 < s ≤ 600`; without it, the configured length. |
| `CENSORON` | `<ch>` | `OK <ch>` | Latch the censor on. |
| `CENSOROFF` | `<ch>` | `OK <ch>` | Release the latch. |
| `FORCECENSOROFF` | `<ch>` | `OK <ch>` | Drop the latch **and** every span still queued — the field escape hatch. |
| `SLATEON` | `<ch>` | `OK <ch>` | Cover the picture (and mute, if configured). |
| `SLATEOFF` | `<ch>` | `OK <ch>` | Uncover. |
| `CUE` | `<ch> [OUT\|IN\|CANCEL\|OUTNOW\|INNOW] [seconds] [event id]` | `OK <ch> <cue>` | Originate an ad cue. Defaults: `OUT`, 30 s, event id 1. |
| `TRIGGER` | `<ch> <template> [key=value …]` | `OK <ch> <cue>` | Template-style cue origination; see below. |
| `SCTEBLOCK` | `<ch> [ON\|OFF]` | `OK <ch>` | The operator kill switch for cues. Default `ON`. |
| `LOCK` | `<ch> <holder> [note…]` | `OK <ch> LOCKED <holder>` | Claim the channel. |
| `UNLOCK` | `<ch> [FORCE]` | `OK <ch> UNLOCKED <holder>` | Release it; `FORCE` takes it from someone else. |
| `LOCKSTATE` | `<ch>` | see below | Who holds the channel. |
| `ALARMS` | `<ch>` or `ALL` | see below | One line of raw alarm truth. |
| `ROLE` | `<ch>` | see below | Which half of a redundant pair you are talking to. |
| `SUBSCRIBE` | `<ch>`, `ALL`, or `<BLOCK> <ch>` | `OK … SUBSCRIBED` + a snapshot | Follow state changes. |
| `DATA` | `<sender> <text…>` | `OK 0` | Write a message into a named data sender. No channel. |
| `BYPASS` | `STAGE <id>` | `OK 0 STAGE <id> BYPASS` | **Stage only.** |
| `COUGHPOST` | `STAGE <id> [DOWN\|UP]` | `OK 0 STAGE <id> COUGHPOST` | **Stage only.** |
| `CENSORPOSTON` | `STAGE <id>` | `OK 0 STAGE <id> CENSORPOSTON` | **Stage only.** |
| `CENSORPOSTOFF` | `STAGE <id>` | `OK 0 STAGE <id> CENSORPOSTOFF` | **Stage only.** |

!!! warning "Four verbs are stage-only"
    `BYPASS`, `COUGHPOST`, `CENSORPOSTON` and `CENSORPOSTOFF` exist only in the
    `STAGE` form. Sent against a channel they answer
    `ERR <ch> BADVERB unhandled verb BYPASS`.

## Transport

```text
> BUILD 1
< OK 1
> DUMP 1
< OK 1
> DUMPALL 1
< OK 1
> ROLLOUT 1
< OK 1
```

`DUMP` always uses the channel's own configured dump length — there is no
seconds argument on this port. Use `DUMPALL` for everything, or the REST route
if you need an arbitrary length.

A command that the block cannot carry out comes back as `INVALID_STATE` with the
engine's own words:

```text
> BUILD 1
< ERR 1 INVALID_STATE delay block is not running
```

## State

### `STATE <ch>` — the delay

```text
> STATE 1
< OK 1 Delayed depth=9.98 protection=9.98
```

The line is `OK <ch> <Word> depth=<s> protection=<s>` plus whatever applies:

| Field | When it appears | Example |
|---|---|---|
| `depth=` | always | `depth=9.98` — what the buffer holds |
| `protection=` | always | `protection=12.4` — the window actually in force |
| `censor=` | while a censor is active | `censor=audio` |
| `slate=1` | while the slate is up | `slate=1` |
| `maintain=` | when depth maintenance is doing something | `maintain=holding`, `catching_up`, `regrowing` |
| `lock=` | while the channel lock is held | `lock=studio-a` |

A full line:

```text
< OK 1 Delayed depth=3.96 protection=3.98 censor=audio slate=1 maintain=holding lock=studio-a
```

Fields are appended in that order, so a client that reads positionally up to
`depth=` is never broken by a new one.

### State words

The state words are **CamelCase**, and a client that compares them must use
these exact spellings:

| Word | Meaning |
|---|---|
| `Live` | running, nothing held |
| `Building` | filling the buffer; the fill is airing |
| `Delayed` | at depth, airing delayed content |
| `RollingOut` | returning to live |
| `Stopped` | the block is not running |
| `Disabled` | the block is disabled in the configuration |
| `Running` | a typed block (encoder, decoder) is up |
| `NOCHAN` | the channel does not exist |

A dissolve reports the state it is leading to, not a fourth word.

### `STATE <BLOCK> [ch]` — a block

```text
> STATE ENC 2
< OK 2 Running
> STATE VDEC
< OK 1 Disabled
```

### `LOCKSTATE <ch>`

```text
> LOCKSTATE 1
< OK 1 UNLOCKED
> LOCK 1 studio-a ad break
< OK 1 LOCKED studio-a
> LOCKSTATE 1
< OK 1 LOCKED holder=studio-a origin=tcp principal=10.0.0.5 since=2026-11-06T09:12:44
```

### `ALARMS <ch>` and `ALARMS ALL`

```text
> ALARMS 1
< OK 1 ACTIVE=0
> ALARMS 2
< OK 2 ACTIVE=1 CRITICAL=1 WARNING=0 delay:source_lost
> ALARMS ALL
< OK 0 ACTIVE=1 CRITICAL=1 WARNING=0 delay@2:source_lost
```

`ALARMS <ch>` is that channel's; `ALARMS ALL` is the whole process's, and its
block names carry the channel (`delay@2`). This is the raw alarm state — the
console's acknowledge and dismiss overlay is the page's business and never hides
anything here.

### `ROLE <ch>`

```text
> ROLE 1
< OK 1 ROLE=standalone STATE=standalone LOCKED=0 PRIMARY=-
< OK 1 ROLE=backup STATE=backup_synced LOCKED=1 PRIMARY=http://primary:8090
```

| Field | Values |
|---|---|
| `ROLE=` | `standalone`, `primary`, `backup` |
| `STATE=` | `standalone`, `primary`, `backup_syncing`, `backup_synced`, `backup_primary_lost`, `backup_taken_over`, `backup_grace_expired` |
| `LOCKED=` | `1` while this instance refuses control actions |
| `PRIMARY=` | the primary's URL, or `-` |

Use it on connect: a panel that knows it is talking to a standby can say so
instead of showing an operator six dead buttons.

## Subscriptions

`SUBSCRIBE` makes the connection a listener. Status is then pushed as it
changes, which is far cheaper than polling.

```text
> SUBSCRIBE 1
< OK 1 SUBSCRIBED
< STATUS CH 1 Delayed
> SUBSCRIBE VENC 1
< OK 1 SUBSCRIBED
< STATUS VENC 1 Running
> SUBSCRIBE ALL
< OK 0 SUBSCRIBED
```

- `SUBSCRIBE <ch>` follows one channel's delay.
- `SUBSCRIBE ALL` follows **every** channel's delay; each pushed line names its
  own channel.
- `SUBSCRIBE <BLOCK> <ch>` follows that block and reports it under its own tag.
- **Subscriptions accumulate.** A second `SUBSCRIBE` adds to the set, it does not
  replace it.
- The snapshot follows the `OK`, never precedes it, so a client that reads its
  reply first is never handed an unexpected line.
- `SUBSCRIBE 9` on a channel that does not exist is `ERR 9 NOCHAN unknown
  channel` — you are told at once rather than waiting silently.

### Pushed messages

| Line | When |
|---|---|
| `STATUS CH <ch> <Word>` | the channel's delay state changed |
| `STATUS CH <ch> CENSOR 0\|1` | the censor lamp moved (sent with the SLATE line) |
| `STATUS CH <ch> SLATE 0\|1` | the slate lamp moved |
| `STATUS VENC <ch> <Word>` | a subscribed encoder's state changed |
| `STATUS VDEC <ch> <Word>` | a subscribed decoder's state changed |
| `ALARM CH <ch> <code>` | a **new** alarm code became active on a subscribed channel |

A standing alarm is pushed once. When it clears it can be pushed again the next
time it raises. Process-wide alarms (channel 0) are not pushed to a channel
subscriber. A channel that is removed stops being pushed.

A transcript, with a dump and a cough on channel 1:

```text
> SUBSCRIBE 1
< OK 1 SUBSCRIBED
< STATUS CH 1 Delayed
> COUGH 1 DOWN
< OK 1
< STATUS CH 1 CENSOR 1
< STATUS CH 1 SLATE 0
> COUGH 1 UP
< OK 1
< STATUS CH 1 CENSOR 0
< STATUS CH 1 SLATE 0
> DUMP 1
< OK 1
< STATUS CH 1 Building
< STATUS CH 1 Delayed
```

## On-air controls

```text
> COUGH 1 DOWN
< OK 1
> COUGH 1 UP
< OK 1
> COUGH 1
< OK 1
```

`COUGH` accepts `DOWN`, `ON` or `1` for the press and `UP`, `OFF` or `0` for the
release. A **bare** `COUGH <ch>` sends both in one line, for a panel that can
only send one command per key. Anything else is refused:

```text
> COUGH 1 BANANA
< ERR 1 BADARG cough takes DOWN|UP, not BANANA
```

```text
> CENSOR 1            # the configured length
< OK 1
> CENSOR 1 2.5        # 2.5 seconds
< OK 1
> CENSOR 1 900
< ERR 1 BADARG censor seconds must be 0..600, not 900
> CENSORON 1
< OK 1
> CENSOROFF 1
< OK 1
> FORCECENSOROFF 1
< OK 1
> SLATEON 1
< OK 1
> SLATEOFF 1
< OK 1
```

## Ad cues

```text
> CUE 1 OUT 30 4242
< OK 1 operator splice out id 4242 pre-roll 4000 ms break 30.0 s
> CUE 1 IN
< OK 1 operator splice in id 1 pre-roll 4000 ms
> CUE 1 OUTNOW
< OK 1 operator splice out (immediate) id 1 pre-roll 0 ms break 30.0 s
> CUE 1 CANCEL 0 4242
< OK 1 operator splice cancel id 4242 pre-roll 4000 ms
```

Arguments are positional: type, then seconds, then the event id. Defaults are
`OUT`, 30 seconds and event id 1. The cue rides the delay, so it airs one depth
later — and a dump cancels it.

| Type | Means |
|---|---|
| `OUT` | splice out at the normal pre-roll |
| `OUTNOW` | splice out immediately |
| `IN` | splice back in |
| `INNOW` | splice back in immediately |
| `CANCEL` | cancel an announced splice |

Errors:

```text
> CUE 1 SIDEWAYS
< ERR 1 BADARG cue takes OUT|IN|CANCEL|OUTNOW|INNOW, not SIDEWAYS
> CUE 1 OUT 99999
< ERR 1 BADARG cue seconds must be 0..6553, not 99999
```

`SCTEBLOCK` is the operator kill switch: while it is on, cues neither pass
through nor originate.

```text
> SCTEBLOCK 1 ON
< OK 1
> SCTEBLOCK 1 OFF
< OK 1
> SCTEBLOCK 1 MAYBE
< ERR 1 BADARG scteblock takes ON|OFF, not MAYBE
```

### `TRIGGER` — template-style origination

Automation written against a template store sends `TRIGGER <ch> <template>
[key=value …]`. There is no template store here, so the template **name is
recorded in the audit** and the break it asks for is originated as a cue.

```text
> TRIGGER 1 adbreak
< OK 1 operator splice out id 1 pre-roll 4000 ms break 30.0 s
> TRIGGER 1 adbreak duration=60
< OK 1 operator splice out id 1 pre-roll 4000 ms break 60.0 s
```

`duration=`, `break=`, `break_duration=` and `seconds=` all set the length
(0–6553). Other keys are accepted and ignored.

```text
> TRIGGER 1
< ERR 1 BADARGS TRIGGER requires template
> TRIGGER 1 adbreak oops
< ERR 1 BADARGS malformed override oops
> TRIGGER 1 adbreak duration=99999
< ERR 1 BADARGS duration must be 0..6553, not 99999
```

## Enable and disable

```text
> DISABLE 1               # the delay
< OK 1 Disabled
> ENABLE DELAY 1
< OK 1 Enabled
> DISABLE ENC 2
< OK 2 Disabled
> STATE ENC 2
< OK 2 Disabled
```

Disable is a **full stop** of the block, not a bypass: the threads end and the
NDI sender closes. The configuration is untouched and the block still reports
itself. Enabling a block that cannot start yet still sets the flag and tells you
why.

## The channel lock

```text
> LOCK 1 studio-a ad break in 2
< OK 1 LOCKED studio-a
```

The holder is the name everyone sees. What is actually compared is the
**principal** — over TCP that is the peer address. So another panel on another
address is refused:

```text
> BUILD 1
< ERR 1 LOCKED the delay is locked to studio-a (tcp 10.0.0.5) since … — ad break in 2
```

A lock on one channel never refuses another. Release it, or take it:

```text
> UNLOCK 1
< OK 1 UNLOCKED studio-a
> UNLOCK 1 FORCE
< OK 1 UNLOCKED studio-a
```

Reads stay open to everyone while a lock is held: `STATE`, `LOCKSTATE`,
`ALARMS`, `ROLE`, `CHANNELS`, `SUBSCRIBE` and `PING` all keep working. See
[Channel lock](lock.md).

## Audio stages

An audio (profanity) delay or a Stereo Tool stage is driven over the same port
with `STAGE` in place of a channel number. The id is the delay's or the stage's
name.

```text
> STATE STAGE studio-dump
< OK 0 STAGE studio-dump full delay=7.00 max=10.00 safe=1 idle=0 cough=0 censor=0 postcough=0 postcensor=0 dumps=1
> DUMP STAGE studio-dump
< OK 0 STAGE studio-dump DUMP
> COUGH STAGE studio-dump DOWN
< OK 0 STAGE studio-dump COUGH
> COUGH STAGE studio-dump UP
< OK 0 STAGE studio-dump COUGH
```

| Verb | Stage form |
|---|---|
| `STATE` | `STATE STAGE <id>` |
| `BUILD`, `DUMP`, `DUMPALL`, `ROLLOUT` / `EXIT`, `BYPASS` | `<VERB> STAGE <id>` |
| `COUGH`, `COUGHPOST` | `<VERB> STAGE <id> [DOWN\|UP]` |
| `CENSOR` | `CENSOR STAGE <id> [seconds]` |
| `CENSORON`, `CENSOROFF`, `CENSORPOSTON`, `CENSORPOSTOFF`, `FORCECENSOROFF` | `<VERB> STAGE <id>` |

!!! warning "A bare `COUGH STAGE` does not release"
    On a stage, `COUGH STAGE <id>` with no argument presses the cough **down**
    and leaves it there. Always send the `UP` edge.

Replies that are particular to stages:

```text
< OK 0 STAGE <id> NOTDELAY            a processing stage with no delay state
< ERR 0 NOSTAGE unknown stage <id>
< ERR 0 BADARG stage id required (VERB STAGE <id>)
< ERR 0 BADVERB SLATEON not valid for a stage
```

See [Audio delay](../audio/delay.md).

## Data senders

`DATA` writes a message straight into a named data sender. It carries no channel
— a sender is not a delay channel.

```text
> DATA plant NOW PLAYING: Thunderstruck
< OK 0
> DATA nosuch hello
< ERR 0 INVALID_STATE no sender named "nosuch"
```

Everything after the sender name is the message, to the end of the line (leading
and trailing whitespace trimmed).

### Escapes

**The commands themselves are not escaped.** A line is split on whitespace, there
is no quoting, and there is no line continuation. One command, one line.

Escapes apply to **message text**: the body of a `DATA` command, and the strings
a data sender is configured with — its on-connect line, its keep-alive and its
init string. A protocol that needs a carriage return has to be typeable on one
line and in a text box, so these sequences are translated:

| Escape | Produces |
|---|---|
| `\n` | line feed |
| `\r` | carriage return |
| `\t` | tab |
| `\0` | NUL |
| `\\` | a single backslash |

Anything else after a backslash is left alone, so `\q` stays `\q`. That is how
you send a multi-line message in one command:

```text
> DATA plant TITLE: Thunderstruck\r\nARTIST: AC/DC
< OK 0
```

See [Receivers and routes](../data/receivers.md).

## Error codes

A panel should branch on the **code**, not on the prose.

| Code | Channel | Meaning |
|---|---|---|
| `DENIED` | 0 | The peer address is not on the allow list. The socket closes. |
| `AUTH` | 0 | `required` (no handshake yet) or `bad token` (socket closes). |
| `EMPTY` | 0 | An empty line. |
| `BADVERB` | 0 | Unknown verb — answered before the channel is parsed. |
| `BADVERB` | `<ch>` | A known verb that is not valid in this form (a stage-only verb on a channel). |
| `BADCH` | 0 | The channel argument is missing or not a number. |
| `NOCHAN` | `<ch>` | That channel is not configured. |
| `BADARG` / `BADARGS` | `<ch>` | An argument is out of range or not one of the accepted words. |
| `NOSTAGE` | 0 | No audio delay or stage by that name. |
| `LOCKED` | `<ch>` | The channel lock is held by someone else, **or** this instance is a standby. |
| `LICENSE` | `<ch>` | The licence does not carry `PANEL`. |
| `INVALID_STATE` | `<ch>` | The block refused it — not running, nothing to dump, and so on. |

## Licensing: `PANEL`

Port 9350 is the **licensed panel surface**. Without the `PANEL` feature on the
licence, the acting verbs are refused:

```text
> BUILD 1
< ERR 1 LICENSE panel control is not licensed (PANEL) — no licence registered
```

Everything that only **reports** keeps working: `STATE`, `ALARMS`, `ROLE`,
`CHANNELS`, `LOCKSTATE`, `PING` and the pushed `STATUS` of a subscription. A dark
panel is a worse failure than a refused button — an operator can see live state
and dim keys and know what to do about it.

**`DUMP`, `DUMPALL`, `ROLLOUT` and `EXIT` are never gated**, by the licence or by
anything else.

REST is **not** gated by `PANEL`: an integration that drives the box from
software uses `/api/…` with an API client and needs no panel feature. See
[Licensing](../start/licensing.md).

## On a standby

While an instance is a backup, every verb that **does** something answers
`LOCKED`:

```text
> BUILD 1
< ERR 1 LOCKED this instance is a backup — controls are managed by the primary at http://primary:8090
```

`STATE`, `ALARMS`, `ROLE`, `CHANNELS`, `SUBSCRIBE` and `PING` keep working, so a
panel pointed at the standby still shows the plant. Once the standby's local
control window has expired, `DUMP` and `ROLLOUT` come back — a locked-out box
never traps an operator. Every refusal is audited as `control.locked`. See
[Operating a standby](../redundancy/standby.md).

## Stream Deck and Companion

Point a **generic TCP** module at the box on 9350.

```text
AUTH s3cret        (only if a token is configured — send it first)
SUBSCRIBE 1        (pushes STATUS CH 1 <state> on every change)
BUILD 1
DUMP 1
DUMPALL 1
ROLLOUT 1
COUGH 1 DOWN   /   COUGH 1 UP      (two actions on one key: press and release)
CENSORON 1     /   CENSOROFF 1
LOCK 1 studio-a    /   UNLOCK 1
```

- **For feedbacks, subscribe — do not poll.** One `SUBSCRIBE 1` gives you every
  state change, the censor lamp and the slate lamp.
- **Map the error code, not the message.** `LOCKED` and `LICENSE` both mean
  "dim this key"; `INVALID_STATE` means "the block is not ready".
- **A held key is two commands.** Bind the press to `COUGH 1 DOWN` and the
  release to `COUGH 1 UP`. If your surface can only send one, a bare `COUGH 1` is
  a press and release together.
- **Discover channels with `CHANNELS`** so one profile serves boxes with
  different channel counts.

!!! note "This is the line protocol"
    Port 9350 speaks the line protocol documented here — `BUILD 1` → `OK 1`.
    A profile written against a newline-delimited-JSON panel listener will not
    drive this port; a generic TCP module will.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The connection is accepted then immediately dropped with `ERR 0 DENIED` | the peer is not on `tcp.allow_list` |
| Every command answers `ERR 0 AUTH required` | `auth.tcp_token` is set and the first line was not `AUTH <token>` |
| The socket closes right after `AUTH` | wrong token |
| `ERR 0 BADVERB` on a verb you are sure exists | a typo, or a stage-only verb sent against a channel |
| `ERR 0 BADCH` on a verb that should not need a channel | only `PING`, `CHANNELS` and `DATA` omit it; `SUBSCRIBE ALL` and `ALARMS ALL` take `ALL` |
| Everything answers `ERR <ch> LICENSE …` except dump and rollout | the licence has no `PANEL` |
| Everything answers `ERR <ch> LOCKED …` | someone holds the channel lock, or this box is a standby — `LOCKSTATE <ch>` and `ROLE <ch>` tell you which |
| A subscriber gets a reply but no `STATUS` lines | nothing has changed yet; the snapshot comes once, after the `OK` |
| The state word does not match what you parsed | the words are CamelCase: `Live`, `Building`, `Delayed`, `RollingOut` |
| Nothing connects at all | `tcp.enabled` is false, or the bind address is `127.0.0.1` |
