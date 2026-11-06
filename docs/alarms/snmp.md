# SNMP

Airlock carries an SNMP v2c agent and sends v2c traps. An NMS can poll alarm
counts, per-channel delay state and per-block health, and — with a write
community — drive the transport. The MIB is the Airlock MIB: one file covers both
Airlock products.

## Enable the agent

1. Open **Server › Email & alerts**.
2. In the **SNMP** card, switch **Enabled** on and set the community.
3. Set **Port**. On Linux and macOS, 161 needs root or `CAP_NET_BIND_SERVICE`;
   **1161 does not** and is the usual choice for a service that is not running as
   root.
4. Save.

The agent re-checks its settings every 5 seconds and restarts itself when the
bind address, port or enabled flag changes — no service restart needed. The log
line at start says what it bound and whether SET is enabled:

```
snmp: agent listening on udp/0.0.0.0:1161 (community "public", SET enabled)
```

### Settings

| Setting | Console label | Config key | Default | Meaning |
|---|---|---|---|---|
| Run the agent | Enabled | `snmp.enabled` | `false` | Master switch for the agent **and** for traps. |
| Bind address | Bind | `snmp.bind` | `0.0.0.0` | Which address the UDP listener binds. |
| Port | Port | `snmp.port` | `161` | 161 needs privilege off Windows; 1161 does not. |
| Read community | Community | `snmp.community` | `public` | GET / GETNEXT / GETBULK. A wrong community is dropped silently, the v2c convention. |
| Write community | Write community | `snmp.write_community` | `""` | SET only. **Empty refuses every SET.** |
| Trap receiver | Trap receiver | `snmp.trap_receiver` | `""` | `host` or `host:port`, port 162 if omitted. Empty = no traps. |
| Trap community | Trap community | `snmp.trap_community` | `public` | The community stamped on outgoing traps. |

```json
"snmp": { "enabled": false, "bind": "0.0.0.0", "port": 161, "community": "public",
          "write_community": "", "trap_receiver": "", "trap_community": "public" }
```

!!! warning "v2c is not authentication"
    A community string is a password in clear text on the wire. Put the agent on
    a management VLAN, bind it to that interface, and keep `write_community`
    empty unless you actually drive the plant from your NMS.

!!! info "Bind and port are machine-local"
    In a primary/backup pair the agent's listener settings stay with the machine;
    what it reports and where traps go are mirrored. See
    [Configuration store](../server/config.md).

## The MIB

The file ships as `mib/airlock.mib` beside the binary. Load it into your NMS the
usual way — on net-snmp, copy it into `~/.snmp/mibs/` or `/usr/share/snmp/mibs/`
and add `-m AIRLOCK-MIB` (or `-m ALL`) to each command.

Everything lives under:

```
1.3.6.1.4.1.99999.134
```

!!! note "The enterprise arc"
    `99999` is **not** a registered IANA enterprise number. It is a documented
    project constant, kept identical to Airlock's so one MIB serves both. If your
    NMS enforces registered PENs, map this arc explicitly.

## The OID tree

### Server scalars

| OID | Object | Type | Meaning |
|---|---|---|---|
| `…134.1.0` | `airlockAlarmTotalCount` | Integer32 | Active alarms across every channel. Raw — the console's ack and dismiss never change it. |
| `…134.2.0` | `airlockAlarmCriticalCount` | Integer32 | Active alarms with severity critical. |
| `…134.3.0` | `airlockAlarmWarningCount` | Integer32 | Active alarms with severity warning. |
| `…134.4.0` | `airlockServerSeverity` | INTEGER | `0` ok, `1` warning, `2` critical. **The one object to threshold-check.** |
| `…134.5.0` | `airlockRedundancyRole` | INTEGER | `0` standalone, `1` primary, `2` backup. This build reports `0`. |
| `…134.6.0` | `airlockLicenseValid` | INTEGER | `0` invalid, `1` valid — the same verdict the console and `ALARM_LICENCE_INVALID` read. |
| `…134.7.0` | `airlockWatchdogState` | INTEGER | `0` standby, `1` pass-through. This build has no hardware watchdog and reports `0`. |

### Channel table — `…134.10.1.<column>.<channel>`

One row per configured channel, indexed by the channel id. `BUILD 2` and
`…10.1.12.2` address the same channel.

| Column | Object | Type | Meaning |
|---|---|---|---|
| 1 | `airlockChannelName` | DisplayString | The channel's display name. |
| 2 | `airlockChannelKind` | INTEGER | `0` video, `1` audio. |
| 3 | `airlockChannelState` | INTEGER | `0` live/idle, `1` building, `2` delayed, `3` rolling out. |
| 4 | `airlockChannelDepthMs` | Integer32 | Current delay depth, milliseconds. `0` when the delay is not running. |
| 5 | `airlockChannelAlarmCount` | Integer32 | Active alarms on this channel's delay. |
| 6 | `airlockChannelSeverity` | INTEGER | Worst severity on it: `0`/`1`/`2`. |
| 7 | `airlockChannelActiveAlarms` | DisplayString | Comma-separated codes, e.g. `ALARM_SOURCE_LOST,ALARM_AUDIO_SILENCE`. |
| 8 | `airlockChannelCensorActive` | INTEGER | Censor span held open or queued to air. |
| 9 | `airlockChannelCoughActive` | INTEGER | Cough held. Audio channels only; `0` on video. |
| 10 | `airlockChannelEncodeRunning` | INTEGER | The encoder is running on this channel's delayed output. |
| 11 | `airlockChannelWatermarked` | INTEGER | The **delay** output carries the unlicensed watermark. |
| 12 | `airlockChannelCommand` | INTEGER | **The only writable object.** Reads `0`. See below. |
| 13 | `ndi2srtChannelNdiName` | DisplayString | The NDI sender name this channel's delay publishes. |
| 14 | `ndi2srtChannelBufferedMb` | Integer32 | Megabytes this channel's buffer holds right now. |

### Block table — `…134.20.1.<column>.<block>.<channel>`

Two indices: the block, then the channel. Block is `1` encoder, `2` decoder,
`3` delay.

| Column | Object | Type | Meaning |
|---|---|---|---|
| 1 | `ndi2srtBlockName` | DisplayString | `encoder`, `decoder` or `delay`. |
| 2 | `ndi2srtBlockRunning` | INTEGER | The block is started. |
| 3 | `ndi2srtBlockInputUp` | INTEGER | Input present: NDI for encoder and delay, an SRT peer for the decoder. |
| 4 | `ndi2srtBlockOutputUp` | INTEGER | Output flowing: the SRT link for the encoder, frames leaving for the decoder and delay. |
| 5 | `ndi2srtBlockFpsOut` | Integer32 | Output frame rate, whole frames per second. |
| 6 | `ndi2srtBlockAlarmCount` | Integer32 | Active alarms on this block. Raw state. |
| 7 | `ndi2srtBlockSeverity` | INTEGER | Worst severity on it. |
| 8 | `ndi2srtBlockActiveAlarms` | DisplayString | Comma-separated codes. |

### System group

| OID | Object | Type | Meaning |
|---|---|---|---|
| `…134.40.1.0` | `ndi2srtVersion` | DisplayString | Version string. |
| `…134.40.2.0` | `ndi2srtUpTime` | TimeTicks | Process uptime, hundredths of a second. |
| `…134.40.3.0` | `ndi2srtChannelCount` | Integer32 | Delay channels configured. |
| `…134.40.4.0` | `ndi2srtTotalBufferedMb` | Integer32 | Megabytes held across every running delay. |
| `…134.40.5.0` | `ndi2srtTotalBufferedSeconds` | Integer32 | Seconds of programme held across every running delay. |

## Polling

```bash
# the whole tree
snmpwalk -v2c -c public host:1161 1.3.6.1.4.1.99999.134

# worst severity across the box — the single threshold check
snmpget -v2c -c public host:1161 1.3.6.1.4.1.99999.134.4.0

# active / critical / warning counts
snmpget -v2c -c public host:1161 \
  1.3.6.1.4.1.99999.134.1.0 \
  1.3.6.1.4.1.99999.134.2.0 \
  1.3.6.1.4.1.99999.134.3.0

# channel 2: state, depth and its active alarm codes
snmpget -v2c -c public host:1161 \
  1.3.6.1.4.1.99999.134.10.1.3.2 \
  1.3.6.1.4.1.99999.134.10.1.4.2 \
  1.3.6.1.4.1.99999.134.10.1.7.2

# every channel's depth in one sweep
snmpwalk -v2c -c public host:1161 1.3.6.1.4.1.99999.134.10.1.4

# the delay block (3) on every channel: is it running, is input up
snmpwalk -v2c -c public host:1161 1.3.6.1.4.1.99999.134.20.1.2.3

# with the MIB loaded
snmpwalk -v2c -c public -m AIRLOCK-MIB host:1161 airlock
```

GET, GETNEXT and GETBULK are all served. The tree is rebuilt for each request
from the same alarm list the console and the deliveries see, so a walk is always
self-consistent.

## Control by SET

`airlockChannelCommand` mirrors the GPIO and TCP verb set.

```bash
# build channel 1
snmpset -v2c -c <write> host:1161 1.3.6.1.4.1.99999.134.10.1.12.1 i 1

# dump the configured number of seconds on channel 2
snmpset -v2c -c <write> host:1161 1.3.6.1.4.1.99999.134.10.1.12.2 i 2
```

| Value | Does |
|---|---|
| `1` | Build — start building depth. |
| `2` | Dump — flush the channel's configured `dump_seconds`. |
| `3` | Dump all — flush the whole buffer. |
| `4` | Rollout — exit the delay. |

The MIB also names `coughOn(5)`, `coughOff(6)`, `censorOn(7)` and `censorOff(8)`;
this build accepts 1 to 4 and answers `wrongValue` to the rest.

Refusals follow RFC 3416:

| Answer | When |
|---|---|
| dropped silently | The community is not `write_community`, or `write_community` is empty. |
| `notWritable` | The OID is not `airlockChannelCommand`. |
| `inconsistentName` | That channel is not configured. |
| `wrongType` | The value is not an integer. |
| `wrongValue` | The integer is not 1–4. |
| `authorizationError` | The channel lock holds it for someone else. |
| `resourceUnavailable` | This instance is a locked backup, or the block could not take the command. |

Every accepted SET is written to the [audit log](../server/audit.md) with origin
`snmp` and the manager's address as the principal — the same standing as a TCP
control connection.

## Traps

Set **Trap receiver** to `host` or `host:port` (162 if you omit the port). Every
delivered transition then also goes out as an SNMPv2-Trap.

| Notification | OID | Sent when |
|---|---|---|
| `ndi2srtAlarmRaised` | `…134.0.1` | An alarm became active, after its raise hold time and subject to the notify cooldown. |
| `ndi2srtAlarmCleared` | `…134.0.2` | An alarm cleared — only for an occurrence whose raise was delivered. |

Each trap carries the standard pair plus six payload objects:

| Varbind | Object | Carries |
|---|---|---|
| `1.3.6.1.2.1.1.3.0` | `sysUpTime` | Process uptime in hundredths of a second. |
| `1.3.6.1.6.3.1.1.4.1.0` | `snmpTrapOID` | `…134.0.1` or `…134.0.2`. |
| `…134.30.1.0` | `ndi2srtTrapAlarmCode` | `ALARM_SRT_DOWN`, … |
| `…134.30.2.0` | `ndi2srtTrapAlarmSeverity` | `0` ok, `1` warning, `2` critical. |
| `…134.30.3.0` | `ndi2srtTrapAlarmBlock` | `encoder`, `decoder`, `delay`, `gpio`, `redundancy`, `watchdog`, `licence`, `system`. |
| `…134.30.4.0` | `ndi2srtTrapAlarmMessage` | The detector's own detail — the measured level and threshold, the SRT address and error. |
| `…134.30.5.0` | `ndi2srtTrapAlarmId` | Occurrence id. A re-raise after a clear is a new id. |
| `…134.30.6.0` | `ndi2srtTrapAlarmActive` | `1` raised, `0` cleared. |

Catch them with net-snmp while you test:

```bash
sudo snmptrapd -f -Lo -c /dev/null --disableAuthorization
```

A raise then arrives as:

```
DISMAN-EVENT-MIB::sysUpTimeInstance = Timeticks: (182300) 0:30:23.00
SNMPv2-MIB::snmpTrapOID.0 = OID: AIRLOCK-MIB::ndi2srtAlarmRaised
AIRLOCK-MIB::ndi2srtTrapAlarmCode.0 = STRING: ALARM_SRT_DOWN
AIRLOCK-MIB::ndi2srtTrapAlarmSeverity.0 = INTEGER: critical(2)
AIRLOCK-MIB::ndi2srtTrapAlarmBlock.0 = STRING: encoder
AIRLOCK-MIB::ndi2srtTrapAlarmMessage.0 = STRING: SRT caller 10.0.4.9:9000 not connected for 10 s
AIRLOCK-MIB::ndi2srtTrapAlarmId.0 = INTEGER: 7
AIRLOCK-MIB::ndi2srtTrapAlarmActive.0 = INTEGER: active(1)
```

Trap sending needs `snmp.enabled` **and** a non-empty `trap_receiver`. A locked
backup sends none — its primary does.

## Troubleshooting

**The agent does not bind.** The log says so once per failed address, with the
hint:

```
snmp: cannot bind udp/0.0.0.0:161: Permission denied — ports below 1024 need
root / CAP_NET_BIND_SERVICE; 1161 is the usual choice
```

Use 1161, or grant the capability:
`sudo setcap 'cap_net_bind_service=+ep' /opt/ndi2srt/ndi2srt`.

**A poll times out and nothing is logged.** A wrong community is dropped
silently. Check the string, and check you are not using `write_community` for a
read.

**A SET is dropped silently.** Same reason: SET compares against
`write_community` only. If that field is empty, every SET is refused with no
answer at all.

**A walk shows no channel rows.** No channels are configured, or the channel's
blocks have never started. The system group (`…40.*`) answers either way, so use
`…134.40.3.0` to confirm how many channels the process has.

**Counts do not match the Alarms page.** They are not meant to. SNMP reports raw
state; the page can be hiding dismissed rows. Turn **Show dismissed** on to see
the same list the MIB does.
