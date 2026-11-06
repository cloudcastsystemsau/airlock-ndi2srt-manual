# Takeover and rejoin

A takeover hands the plant from the primary to a standby. A rejoin hands it back.
This page covers both: when a backup acts on its own, how an operator forces it,
exactly what changes at the moment of the hand-over, and what happens when the
primary comes back.

## Automatic takeover

A backup takes the plant by itself when **all three** of these hold.

| Condition | Checked against |
|---|---|
| The primary has been unreachable for `redundancy.takeover_after_s` | Default 30 s. `0` disables automatic takeover entirely |
| This backup is **ready** | Assets mirrored, channels within this box's capacity ceiling, pair on one version |
| This backup is **rank 1** | First registered with the primary. A box with no rank — a lone backup, or an older primary — counts as rank 1 |

If the threshold passes but the box is not ready, or is not rank 1, it does
**not** take over. It raises `ALARM_REDUNDANCY_NOT_READY` saying why, writes the
refusal to the audit log, and waits for an operator.

The console says the same thing while the primary is gone. A red banner on
**Server › Redundancy** reads *Primary unreachable for 42 s*, and underneath it
one of:

- *Takes over by itself in 18 s.*
- *Rank #2 waits for an operator; rank #1 takes over by itself.*
- *Would take over by itself but is not ready: version mismatch: the primary runs
  … , this box ….*
- *Automatic takeover is off: an operator takes over here.*

!!! note "Several backups, one takeover"
    Rank exists so that a partition does not have three boxes adopt the
    primary's NDI names at once. Only rank #1 acts alone. If rank #1 is the box
    that is down, the hand-over is a human decision on rank #2.

!!! note "A refused configuration never triggers a failover"
    A poll that reaches the primary counts as contact even if this box cannot
    apply what came back. A bad field raises `ALARM_REDUNDANCY_SYNC_REFUSED` on
    its own; it does not advance the unreachable timer.

## Manual takeover

On the standby, open **Server › Redundancy** and press **Take over…**. The
button asks once more:

- Ready: *Take the plant from the primary?* with a **Confirm take over** button.
- Not ready: *Not ready: &lt;the reasons&gt;.* with a **Take over anyway** button.

**Take over anyway** overrides the readiness check only. It does not override
everything.

A takeover is refused when:

| Refusal | Meaning |
|---|---|
| `not configured as a backup` | The role is `standalone` or `primary` |
| `already taken over` | This box is holding the plant already |
| `the primary is answering — takeover is for a primary that is gone` | Stop the primary first, or change its role. **Take over anyway** does not bypass this |
| `not ready to take over: …` | Use **Take over anyway** if you have read the reasons and want the plant regardless |

The refusal appears in a **Refused** banner on the page, and the attempt is
written to the audit log either way.

!!! warning "Stop the primary before taking over by hand"
    If the primary is up and airing, a takeover would put two boxes on air under
    one set of NDI names — and NDI will refuse the second sender. That is why
    the check exists. Take over when the primary is genuinely gone.

## What happens at takeover

In this order:

1. **The instance unlocks.** REST, TCP, SNMP SET and the console controls all
   start answering. The lock mode goes to unlocked.
2. **External outputs resume.** Alarm email, webhooks, SNMP traps, dump-clip
   alerts and telemetry start firing from this box. The Stereo Tool web UI is
   offered again.
3. **The NDI name suffix is dropped.** The box will publish under the primary's
   names.
4. **`ALARM_REDUNDANCY_TAKEOVER` is raised**, and `ALARM_REDUNDANCY_PRIMARY_LOST`
   and `ALARM_REDUNDANCY_NOT_READY` are cleared.
5. **The audit log records `redundancy.takeover`**, with the detail *automatic —
   &lt;primary&gt; unreachable for 42 s (takeover_after_s 30)* or *operator —
   primary &lt;url&gt;*.
6. **The `status` script trigger fires** with the event name `takeover` and the
   parameters `automatic`, `by` and `primary`. It fires **before** the NDI blocks
   restart, so a script that has something to say about going on air says it
   first.
7. **The NDI blocks restart** to take the primary's names — every channel's delay
   and decoder that is running.
8. **The encoders start** on every channel that has an NDI source configured and
   an enabled encoder.

### Timing

The REST call and the console button **answer as soon as the box has changed
sides**. The state flip, the audit entry and the alarm are synchronous; the block
restarts that follow run on their own thread. On a pair with several delays the
restarts take seconds per block, and holding the HTTP response for them used to
outlast most clients.

So expect:

| | |
|---|---|
| Unlock, alarm, audit entry | immediate |
| Encoders and NDI senders back under the primary's names | seconds per block |
| Delay buffers back at depth | `depth_s` seconds after the restart |

!!! warning "The delay rebuilds its buffer at takeover"
    An NDI sender name is fixed when a block starts, so adopting the primary's
    name means restarting the block — and a restarted delay starts from an empty
    buffer and builds again. The cost is accepted deliberately: airing under the
    wrong name is worse than rebuilding.

### Takeover survives a restart

The takeover flag is persisted. A box that took the plant and was then restarted
comes back **still in takeover** — it does not quietly re-suffix a live output —
and the log says so. The local-control window keeps counting from where it was,
not from the restart.

![A standby holding the plant](../img/redundancy/taken-over.png){ .shot }

## When the primary comes back

**Nothing re-locks on its own.** The backup keeps the plant, its applies stay
paused, and the log says *the primary is answering again — applies stay paused
until an operator rejoins*.

That is deliberate. An automatic name-yield in the middle of a programme is worse
than staying where you are, so the hand-back is always an explicit, audited
human action.

While the primary is back and the standby still holds the plant:

- Changes made on the primary are **not** applied to the backup.
- The standby's console carries the banner *The primary is back.* with a
  **Rejoin…** button right in it.
- The primary raises `ALARM_REDUNDANCY_CHILD_TAKEN_OVER` — critical — naming the
  backup and saying *rejoin it, or stop this primary*.
- The local-control window is **cleared**: contact restored means an operator
  with a reachable primary can rejoin at will, so there is nothing left for the
  window to defend.

![The primary is back](../img/redundancy/primary-back.png){ .shot }

## Rejoin

Press **Rejoin…** — on the standby banner or on **Server › Redundancy** — and
confirm.

The console warns you if the primary is not answering: *The primary is not
answering: rejoining now locks this box with nothing to mirror.* That is a valid
thing to do (it puts the box back in standby), but it takes it off air without
putting anything else on.

At rejoin, in this order:

1. The takeover flag clears and the local-control window is cleared.
2. The instance **locks** again, in full.
3. The audit log records `redundancy.rejoin` — *controls locked, NDI names
   re-suffixed, full resync*.
4. `ALARM_REDUNDANCY_TAKEOVER` and `ALARM_REDUNDANCY_LOCAL_WINDOW` clear.
5. The `status` script trigger fires with the event name `rejoin` and a `by`
   parameter.
6. The NDI blocks restart to take their suffixed names again.
7. The held digest is discarded, so **the next poll is a full resync**.

!!! note "The primary wins any divergence"
    A rejoin resyncs from scratch. Anything changed on the standby while it held
    the plant is replaced by the primary's document. If you made a change during
    the outage that must survive, make it on the primary before you rejoin.

The encoders are stopped again by the output suppression as soon as the box is
locked, and the NDI outputs go back to the suffixed names — which is what frees
the primary's names for the primary to create its senders. Rejoin before you
expect the primary back on air.

## The local-control window

`redundancy.grace_days` is how long a standby may run the plant on its own
authority. It defaults to **14 days**. When it runs out, the controls re-lock —
**except the exits**.

| State | Controls |
|---|---|
| `backup_taken_over` | Everything unlocked |
| `backup_grace_expired` | Everything locked **except Dump, Dump all and Rollout** |

Dump, Dump all and Rollout stay available for ever, in every state, on every
box, licensed or not. An instance that may be on air must never trap its
operator.

The console says so too: the standby banner adds *The local-control window has
expired: only Dump and Rollout still answer*, and only the exit buttons stay
live.

### When it starts and when it ends

The countdown **starts** when this backup finds itself holding the plant with its
primary unreachable. It **ends** the moment any of these happen:

- the primary answers again — even while the box keeps the plant;
- an operator rejoins;
- the role changes, or the box is pointed at a different primary.

`0` means never re-lock.

### Staged warnings

Warnings go out at **four days left**, **two days left** and **at expiry** — to
the log, the audit trail (`redundancy.window_warning`, then
`redundancy.window_expired`) and `ALARM_REDUNDANCY_LOCAL_WINDOW`, and from there
by email, webhook and trap like any other alarm. The alarm is re-raised at each
stage so the message you see is the current one.

### It cannot be reset by the simple tricks

The countdown is sealed into the licensing state record beside the configuration,
with the machine's hardware id folded into the seal.

| | |
|---|---|
| A restart | The window keeps its original end |
| The clock wound **back** | Every comparison is against the highest clock ever seen, so it buys nothing |
| The clock held **still** | A minute tick advances that high-water mark by *real* elapsed time, so the countdown cannot be frozen |
| The record copied from another box | The hardware id is in the seal, so it does not verify |
| The record edited | The seal fails and the window **fails closed** — it reads as expired |

Failing closed is affordable because recovery is immediate and available to
anyone legitimate: reconnect the primary, rejoin, or change the role. Failing
open would hand out a permanent unlock for the price of editing a file.

!!! note "Why the window exists at all"
    A backup that has taken over and never reconnects is a fully controllable
    instance authorising itself. The window makes that a decision somebody
    renews rather than a state that persists silently. Set `grace_days` to `0`
    if your site would rather it never re-locked.

## The REST calls

| Call | Who | Notes |
|---|---|---|
| `GET /api/redundancy` | Any signed-in user | Role, peer, last sync, lock state, takeover state, rank, `ready` and `not_ready`, the window, assets, and — on a primary — the ranked children |
| `POST /api/redundancy/takeover` | Admin | Audited. Refused while the primary is answering, or while not ready |
| `POST /api/redundancy/takeover?force=true` | Admin | Audited. Skips the readiness check only |
| `POST /api/redundancy/rejoin` | Admin | Audited |

All three stay available on a locked standby — the redundancy panel is the
emergency path and is on the lockout allow-list.

```bash
# Where does this box stand?
curl -s http://standby:8090/api/redundancy | jq '{role,state,controls_locked,ready,not_ready,rank}'

# Take the plant (the primary is confirmed gone)
curl -X POST http://standby:8090/api/redundancy/takeover

# Take it although this box reports itself not ready
curl -X POST 'http://standby:8090/api/redundancy/takeover?force=true'

# Hand it back
curl -X POST http://standby:8090/api/redundancy/rejoin
```

Useful fields on `GET /api/redundancy`:

| Field | Meaning |
|---|---|
| `state` | One of `standalone`, `primary`, `backup_syncing`, `backup_synced`, `backup_primary_lost`, `backup_taken_over`, `backup_grace_expired` |
| `lock_mode` | `unlocked`, `locked_full` or `locked_except_exits` |
| `controls_locked`, `reason` | Whether this box refuses control, and the sentence it refuses with |
| `outputs_suppressed`, `ndi_suffix` | What the standby is holding back and what it is publishing under |
| `connected`, `synced`, `polls`, `applies`, `digest` | The sync client's own bookkeeping |
| `last_sync_utc`, `last_sync_ago_s`, `last_contact_ago_s`, `primary_lost_for_s` | Timings |
| `takeover_after_s` | The automatic threshold, so a client can count down |
| `taken_over`, `taken_over_utc`, `taken_over_by`, `primary_back` | Takeover state |
| `grace_days`, `grace_left_s`, `grace_ends_utc`, `grace_expired` | The local-control window |
| `rank`, `ready`, `not_ready`, `primary_version` | The automatic-takeover inputs |
| `assets` | The manifest (on a primary) or the mirror and its per-file state (on a backup) |
| `children` | On a primary: every backup, ranked, with its state, version, digest, address and last poll |

## Drill it

Prove the failover on a quiet day, not at 18:00 on a Friday.

1. Confirm the standby reads **backup · in sync**, **Ready: yes**, assets in
   sync, and its NDI outputs are on air at full depth under the suffixed names.
2. Stop the primary's service.
3. Watch `ALARM_REDUNDANCY_PRIMARY_LOST` raise on the standby, and the countdown
   on the red banner.
4. At `takeover_after_s`, confirm the standby unlocks, the alarm changes to
   `ALARM_REDUNDANCY_TAKEOVER`, the NDI names lose the suffix and the encoders
   start.
5. Drive a control — a Dump on the TCP port, or a Build from the console — and
   confirm it is accepted.
6. Start the primary again. Confirm it says *the primary is answering again* and
   that nothing re-locks.
7. Press **Rejoin…**, confirm, and check the names re-suffix, the controls lock
   and the next poll resyncs.
8. Check the audit log on both boxes for `redundancy.takeover`,
   `redundancy.rejoin` and any `control.locked` entries.

!!! warning "Expect the primary's senders to fail while a backup holds its names"
    NDI will not have two senders of one name on one host or network. If the
    primary comes back before you rejoin, its own sender creation is refused.
    Rejoin first, then bring the primary back on air.
