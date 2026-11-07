# Troubleshooting

Symptoms, their causes, and what to do. Find the area, find the row.

!!! tip "Start here"
    Three things explain most of what looks mysterious. **The log** —
    `logs/ndi2srt.log` beside the configuration — says what was granted, what was
    refused and why. **The audit log** records every action *and every refusal*,
    with the reason. **The Alarms page** tells you what the box already knows is
    wrong.

## NDI

| Symptom | Cause | Fix |
|---|---|---|
| An NDI source does not appear in the picker | The sender is in a group other than `public` | Set `ndi_network.recv_groups` |
| | The plant runs an NDI Discovery Server | Set `ndi_network.discovery`. **This turns mDNS off, so every sender must register with the server too** |
| | The sender is on another subnet with no discovery server | Set `ndi_network.extra_ips` |
| | The box has several NICs and NDI picked the wrong one | Set `ndi_network.adapters` |
| | A firewall blocks mDNS (5353/udp) or NDI's own TCP/UDP ports (5960 and up) | Open them, and add a rule for the Airlock program |
| The box's NDI settings seem to be ignored | An empty or `null` key leaves NDI's own default, so the machine's NDI settings stay in force | Set the keys you want explicitly. The settings in effect are logged at start and shown on the encoder cards |
| Save refused: an NDI name clash | Two channels publish the same `delay.ndi_name` or `decoder.ndi_name` | Make them unique. The redundancy suffix is appended to all of them equally, so a clash stays a clash |
| The primary's NDI sender fails to create after it comes back | A backup is still holding that sender name. NDI will not have two senders of one name | Rejoin the backup first, then bring the primary back on air |
| No NDI at all, though the program runs | The NDI runtime is not installed on the box | Install it. On Windows `NDI_RUNTIME_DIR_V6` is honoured |
| The analyser reports frame loss that is not really there | Receiving two full-bandwidth NDI streams at once is enough to drop frames on a small box | Judge a stream's own health from a single-source run; use a comparison run for the delay number. The dropped-frames check is a warning when the control stream lost anything |
| The analyser's delay reads `UNKNOWN` | Without a comparison stream the delay is the sender's timecode age against this machine's clock, so the mean is only as good as the clock agreement | The *spread* is trustworthy either way. Use a comparison run for an absolute number |

## SRT

| Symptom | Cause | Fix |
|---|---|---|
| The encoder never connects | Both ends are callers, or both are listeners | Exactly one end of a link is a `listener` |
| | The listener port is blocked, or already in use | Open the port; listener ports must be unique across channels (enforced at save) |
| | The passphrase or key length differs between the ends | Match `passphrase` and `key_len` |
| An audio encoder or decoder shows `connected: false` | A listener that could not bind, or a caller nobody answers | The reason is in the row's SRT `last_error` |
| "More drops than packets sent" on a long link; retransmission seems not to work | Historic: the send buffer was fixed at about 46 ms of data, so on any link with a longer round trip the sender had already evicted what the receiver asked for | Fixed. Both buffers are now sized from the configured latency and bit rate, floored at 1 MiB and capped at 64 MiB. Upgrade |
| Heavy loss on a Wi-Fi or cellular uplink that raising `latency_ms` does not fix | Under burst loss the sender does not retransmit everything the receiver asks for, and its "dropped" figure counts NAK reports rather than packets | Treat Wi-Fi and cellular uplinks as unproven. On a wired link with sparse loss recovery works normally |
| Loss figures look suspiciously good | On a near-idle CBR stream most of the transport is null padding, so lost packets are nearly all padding | Judge loss on real content at the same rate |
| A decoder joining mid-stream logs decode errors for a moment | It joined mid-GOP and has to wait for the next IDR | Expected. Shorten `video.gop_seconds` if the join time matters |

## Transport stream and hardware decoders

| Symptom | Cause | Fix |
|---|---|---|
| A hardware decoder (IRD) rejects the stream or reports PCR jitter | VBR: with `ts.transport_bitrate_kbps` at `0` the stream is paced to content time with no null padding, and PCR accuracy suffers | Set a CBR rate. The PCR is then placed on the byte clock, and measures within ±500 µs |
| The receiver names the service "Service 1" | No SDT, or a default service name | Set `ts.service_name` and `ts.provider_name`; the SDT is reinserted at `ts.sdt_interval_ms` |
| A receiver ignores the cue PID | The PID must be stream type `0x86` **plus** a registration descriptor carrying `CUEI`. A mux that labels cues `0x06` private data is not conformant | Airlock does this correctly; check the far end's expectations and `scte.pid` |
| An analyser calls the cue PID dead | A section PID that never carries a packet reads as dead | The `splice_null` heartbeat is on by default at `scte.null_interval_ms: 1000`. Do not set it to `0` on a link that is analysed |
| Null packets flood the stream after about 38 minutes | Historic: a byte-clock counter wrapped after 2.3 GB | Fixed. Upgrade |
| The stats card counts "clock re-anchors" | The pacer found itself more than 2 s behind — the machine slept, or the link stalled — and re-anchored its byte clock rather than flooding to catch up | Expected after a stall. A steady stream of them means something is interrupting the process |

## Encoding and interlace

| Symptom | Cause | Fix |
|---|---|---|
| `scan: interlaced` is refused | The built-in software H.264 encoder cannot code fields at all | Use NVENC, or install libx264: `apt install libx264-164`, `brew install x264`, or drop the DLL beside the executable on Windows |
| Interlaced HEVC cannot be produced | NVENC has no field mode for HEVC, and no software HEVC encoder here codes fields | Not available by any route. Use H.264 for interlaced delivery |
| The GPU refuses interlaced encoding | NVIDIA dropped interlaced encoding with the Turing generation and every architecture since | Use a Pascal-era or older card, or libx264. The capability is queried at start and the refusal names x264 as the alternative |
| The affiliate says the 1080i is wrong although both ends say "interlaced" | NVENC codes **field pictures**; libx264's interlaced mode is **MBAFF**, where every picture is still a frame picture. Both are legal; they are not the same stream | A plant that specifies field-coded 1080i needs the NVENC route. Check what was actually emitted with `GET /api/encoder/bitstream` |
| An interlaced source decodes with combing | Only NVDEC decodes field-coded H.264; the software decoders do not | Set `decoder.hw` to `auto` or `nvdec` on a box with an NVIDIA card |
| Software HEVC will not load on Windows | It additionally needs the MinGW C++ runtime beside the library | Install the runtime, or use NVENC |
| An encoder library is present but refused | Airlock verifies a library's layout before using it, and refuses one it cannot positively identify rather than guessing | Use a known-good build |
| The card's encoder name says one thing, the stream says another | `encoder_name` is what was *asked for* | `GET /api/encoder/bitstream` reports what was emitted: profile, level, MBAFF, field pictures, scan and a verdict. It reads H.264 only — HEVC reports `null` rather than guess |
| NVENC or NVDEC is not used | The driver is too old | Any driver from the 520 series up is enough. No CUDA toolkit is needed. `--selftest` exercises both |

## Decoder

| Symptom | Cause | Fix |
|---|---|---|
| The stream arrives but there is no picture | The demultiplexer follows the first program's first H.264 and AAC streams. Other types are listed on the card as ignored — HEVC, MPEG audio, AC-3, LATM | Feed it H.264 + AAC, or check the card's ignored list |
| The output re-anchors or jumps | A PTS jump — a new source behind the same link — re-anchors, and so does a stall of 3 s | Expected |
| Frames go missing with every other indicator healthy | The held budget is `decoder.output_delay_ms` + `decoder.srt.latency_ms`, and the frame queue is sized from exactly that | The block logs both at start. Raise either knob — at the cost of memory: 3 MB a frame at 1080p, 12 MB at 2160p |
| A/V offset reads `n/a` | One of the two rails has been quiet for more than a second | Expected while a rail is idle |
| `late=` or `rebase=` climbing on the stats line | A unit past its moment goes out immediately and is counted (`late=`); a unit more than a second from its deadline in either direction re-bases both rails (`rebase=`) | Occasional is fine. Steady means the source or the link is not delivering on time |
| Lip sync walks apart on a decoded output | Historic: a frame lost before arrival did not advance the content clock while the audio rail kept the sender's time | Fixed — a missing frame now leaves a gap, counted on the card as "source gaps". Read **A/V offset (muxed)**, not **audio conform**: the latter can sit at a few milliseconds while the muxed rails walk minutes apart |
| "Grid trim" walks steadily in one direction | The servo is chasing something it cannot reach | Healthy sits near zero. A one-way walk hides a real rate error — investigate the source rate and the reference clock |

## Clocking and timecode

| Symptom | Cause | Fix |
|---|---|---|
| The stream bursts or stalls when NTP corrects the clock | A wall-clock *step* (not a slew) | Absorbed into an offset and counted on the card as "clock steps". Nothing to do |
| `monotonic` and `system` behave the same on Linux but not on Windows | On Linux the monotonic clock is itself rate-disciplined by NTP and PTP, so `system` adds step protection rather than a different frequency. On Windows the two genuinely differ | On Windows, `system` is the one that follows the PTP client |
| The source's rate error shows as drift rather than repeats and drops | `clock.lock_output` is off, so the stream runs at the source's own rate | Set `lock_output: true` to genlock the output. Leave it off when the source *is* the reference |
| A receiver sees a run of identical timecodes | With `passthrough`, a repeated or fill frame continues from the last emitted timecode by one nominal period rather than resending the held value | Working as designed. Resending the held value would read as "the frame I already have" |
| Timecode steps backwards at a seam | Seams are deliberately not rebased: building → delayed steps back by about the depth, and rollout or dump → live steps forward | Use `synthesize` if a downstream device insists on timecode that matches its own now |
| A decoded output's two rails cannot be aligned downstream | With `decoder.timecode: synthesize` the rails are independent counters | Use `pts`: both stamps then come from one anchor, including `output_delay_ms` |
| NDI timecode is not carried through SRT | Nothing carries NDI timecode *through* the transport stream. Only the delay preserves it | Keep the signal on NDI through a delay where the original timecode has to survive, and use `decoder.timecode: pts` at the far end so the decoded rails at least share one anchor |

## Delay

| Symptom | Cause | Fix |
|---|---|---|
| A delay fed from the decoder shows nothing | The decoder is not running | **Start the decoder first** |
| After a Dump, the delay stays shallow | `rebuild_after_dump` is off, so the delay stays at the shorter depth until the next Build. Depth maintenance holds that shorter depth rather than growing it back | Set `rebuild_after_dump: true`, or Build |
| Rollout discards the buffer | That is what a rollout is — the buffered content is discarded whether it cuts or dissolves | Use `fill.rollout_fill` to air the fill for the remaining depth instead of jump-cutting |
| A 4-second outage spent the whole 4-second protection window | `maintain.enabled` is off (or `mode: "drain"`): the buffer keeps draining while nothing arrives | Set `maintain.enabled: true` with `mode: "hold"`. The cost is timeline drift — air is now that gap later than real time |
| `protection_s` and `depth_s` disagree after an outage | `depth_s` is what the buffer holds; `protection_s` is the window in force. After a maintained gap, protection is depth plus the gap until the hole has aired | That difference is the drift, made visible. Watch `maintain_state` and the `maintained_s` / `catchup_s` / `regrown_s` counters |
| A surplus is cut rather than slewed away | A surplus bigger than `maintain.resync_s` (30 s) is absorbed in one jump even in `bounded` mode — slewing 40 s at 5 % would take 13 minutes | Set `resync_s: 0` to never jump |
| The configured depth is not reached | The buffer hit `delay.max_memory_mb`. Memory ≈ width × height × 1.5 × fps × seconds — 1080p25 at 10 s is about 780 MB | Raise the cap, or lower the depth. The card shows the maximum depth the cap allows at the current raster. Past the cap the oldest frame is dropped and counted, never the input refused |
| Save refused on memory admission | `process.max_memory_mb` is set and the channels' caps add up past it | Raise the ceiling or lower the per-channel caps. A configuration mirrored from a redundancy primary is applied anyway, with a warning — but the backup then reads **not ready** |

## Fills

| Symptom | Cause | Fix |
|---|---|---|
| A fill clip plays as a slideshow | The built-in H.264 decoder reads constrained baseline only. A High-profile file with B-frames loses two pictures in three | Re-encode (below). A clip the decoder refuses more than a tenth of is refused as a fill outright |
| A fill clip plays silently | Only AAC-LC is decoded, and ffmpeg writes MP2 into a `.ts` unless told otherwise | Re-encode with AAC. **Video › Fills & schedules** marks a clip whose audio cannot be decoded when `audio: clip` is asked for |
| Upload, Check or **Make it fit** is unavailable | ffmpeg is never shipped with Airlock | Install one and set `tools.ffmpeg`, put it beside the executable, or put it on the PATH. `GET /api/tools` says which it found. Without one **Video › Fills & schedules** shows the recipe |
| The fill clip eats gigabytes | Clips are held decoded at the output raster: 20 s of 1080p25 is about 1.5 GB | Lower `fill.clip_max_s`. A longer file is cut there and the cut is logged |
| The card says "Fill: source unavailable" and the build airs a freeze frame | The asset is missing, still loading, or stale — a deleted slate, an undecodable clip, an NDI fill source that has gone | Fix the asset. A missing asset is refused when you *save*, but it never stops the delay starting, and the first build right after start-up can show the fallback for up to a second while the asset is conformed |
| A fill daypart does not fire | `days` takes `all`, `weekdays`, `weekends` or a comma list of `mon,tue,…` — the whole-word aliases cannot appear *inside* a list. `end` is **exclusive**, and an `end` at or before `start` wraps past midnight | Check the row. The first enabled matching row wins, and a boundary swap is a cut, not a dissolve |
| An aux audio track goes silent | Its source stopped | `ALARM_AUX_SOURCE_LOST` is raised and the track airs silence until the source returns |

Re-encode a clip the built-in decoder can read, at the channel's frame rate:

```bash
ffmpeg -i IN -c:v libx264 -profile:v baseline -level 4.0 -bf 0 \
  -pix_fmt yuv420p -r 25 -g 25 -c:a aac -ar 48000 -b:a 192k -f mpegts OUT.ts
```

HEVC fill clips go through a different decoder and have no such limit.

## Censor, cough and slate

| Symptom | Cause | Fix |
|---|---|---|
| A censor is stuck on air | A release that never arrived | `censor.held_timeout_ms` (30 s by default) lets a held cough go. The field escape hatch is `POST /api/delay/censor-force-off` or TCP `FORCECENSOROFF <ch>`, which drops the latch *and* every span still queued |
| A slate never times out | Deliberate: a slate is a decision, not a reflex | Clear it explicitly |
| A censor press catches only the back half of the word | `censor.pre_ms` is too short for the operator's reaction | Raise it. Every press reaches back by `pre_ms` (500 ms by default) as well as forward |
| A mask is configured but a slate appears | A slate always wins over a mask | Expected |
| `ERR 1 BADARG cough takes DOWN\|UP, not …` | The TCP argument is wrong | `COUGH <ch> DOWN` / `COUGH <ch> UP` |

## SCTE cues

| Symptom | Cause | Fix |
|---|---|---|
| The NDI break and the transport-stream break are seconds apart | Historic concern: substituting the 4 s pre-roll floor on a pass-through cue moves the TS break up to four seconds away | A pass-through cue carries the **upstream's** pre-roll, never the floor. A short upstream pre-roll is logged and counted, not rewritten. The floor applies only to cues this program originates |
| Cues vanish after a dump or a rollout | A dump cancels the cues in the dumped span, and a rollout's jump cut is the same | Expected, and counted as `cues_cancelled` |
| Absolute-time cues disappear | A deferred-processing-mode cue names an instant the delay has invalidated, so it is dropped once the delay has actually moved it | Set `scte.absolute_action: "pass"` to keep them, or raise `scte.absolute_tolerance_frames` |
| `time_signal` never appears on the NDI rail | It is the transport-stream rail only — there is no SCTE-104 document to put on NDI | Originate an `out` or `in` cue instead if the NDI rail has to carry it |
| Nothing happens at all | `scte.enabled` is the master switch, and it is off by default | Turn it on. An unconfigured stream has exactly the PMT it always had |
| A section with a bad CRC never airs | Counted and dropped | Expected |

## Data channels

| Symptom | Cause | Fix |
|---|---|---|
| Messages silently never arrive | A message that arrives while the delay is not running, or not draining, is dropped and counted rather than sent early | Start the delay. The counter is on the card |
| Save refused: a route with no sender | A route with nowhere to send counts messages through and delivers them nowhere, which reads as working plumbing until the day somebody needs the data | Add a sender |
| A receiver will not start | A bind failure is an error state, never a silent fall back to the wildcard | Fix the address or the port |
| A `receiver`-kind sender is refused | It points at a `udp_server` receiver, which has no peer to reply to | Point it at a TCP receiver |
| Adding or enabling a receiver changes nothing | The data hub is built from the document at start and reconciled by a restart | Restart the service |
| A burst arrives as one message | `framing: raw` means one read, or one datagram, is one message. UDP is always raw | Use `framing: lines` for a line-oriented protocol. An unterminated line is flushed at 64 KiB |
| A primary and a backup both write into the plant | A locked backup keeps its receivers bound, but a message reaching air time is counted and not sent, and an operator send is refused | Expected. The card counter is `suppressed`, distinct from `cancelled` (dump) and `dropped` (nowhere to go) |

## Alarms, email, webhooks and SNMP

| Symptom | Cause | Fix |
|---|---|---|
| A flapping link never raises an alarm | Raise and restore each need their hold time | Lower the hold times if you want a twitchier detector |
| An audio-silence alarm will not clear | Restore needs the peak above `audio_silence_dbfs` **plus** `audio_hysteresis_db` | Expected hysteresis |
| An alarm cleared and re-raised but no second email arrived | A re-raise within `notify_cooldown_s` is held back and sent only if still active when the window ends; if it clears first it is dropped silently | Lower `notify_cooldown_s` |
| A dismissed alarm still emails and still shows on SNMP | Acknowledge and dismiss are a display overlay. Nothing is persisted and the list starts empty at every launch | Fix the condition, not the display |
| Email never sends | Wrong security mode for the port | `starttls` (usually 587), `tls` (implicit, usually 465) or `none`. There is no OpenSSL to install. Test with `POST /api/alarms/test-email` |
| A webhook receiver rejects the signature | The header is `X-Airlock-Signature: sha256=<lowercase hex HMAC-SHA256 of the body>` | Match the algorithm and the casing. Retried at 1 s, 3 s and 9 s until a 2xx. Test with `POST /api/alarms/test-webhook` |
| A webhook receiver treats a dump as a stuck alarm | A dump post deliberately has no `active` field | Tell the two apart by `event`: `"alarm"` or `"dump"` |
| SNMP returns nothing | A request with the wrong community is dropped silently, by v2c convention | Match `snmp.community` |
| The SNMP agent will not bind | **Port 161 needs root or `CAP_NET_BIND_SERVICE`** | Use 1161, or grant the capability |
| Every SNMP SET is refused | `snmp.write_community` is empty, which refuses every SET | Set it. An unknown channel answers `inconsistentName` |

## Dump clips

| Symptom | Cause | Fix |
|---|---|---|
| A dump happened but there is no clip | The record's `status` says which: `skipped` (clips disabled or the buffer was empty), `dropped` (the writer was still busy and the frames were discarded) or `failed` (the `note` says why) | The dump itself always happens, on time, whatever the disk is doing |
| The clip is shorter than the dump | `status: truncated` — the clip was longer than `clips.max_seconds`, and the **newest** `max_seconds` are kept | Raise `clips.max_seconds` |
| The clip has no audio | Clip audio is AAC-LC at 48 or 44.1 kHz, mono or stereo. Anything else makes a video-only clip, and the record says so | Expected |
| Clips disappear | Retention is applied after every write: `max_files`, `max_total_mb`, `keep_days`. `0` switches a cap off | Raise the caps. The `.json` record and the `.ts` are removed together — the directory *is* the index |
| The dump alert never arrives | `clips.alert_email` and `clips.alert_webhook` still need their transports switched on | Set `email.enabled` with recipients, or `webhooks.enabled` with URLs |
| The alert's link is missing or wrong | `clips.public_base_url` is unset | Set it, e.g. `https://airlock.example.com:8090` |

## Axia GPIO

| Symptom | Cause | Fix |
|---|---|---|
| Buttons do nothing | Rows are on the wrong pin family. **Controls ride GPO**: a console button reaches Airlock as a GPO pin change | Put control rows on GPO pins |
| Lamps never light | **Lamps ride GPI**, and a physical node's GPIs are read-only | Use a device with writable GPIs — an IP-Driver or a console's virtual GPIO |
| A row is one pin off | **Pins are 0-based.** `pin: 1` is the *second* of the five | Count from 0 |
| Nothing fires at all | **Edge words are uppercase on the wire.** Lowercase means "steady", not "a transition" | This is also why the initial pin dump and every reconnect are safe: they carry steady characters only, so a reconnect can never replay a Dump |
| A latching switch leaves the engine stuck on | A one-shot edge was used for a level control | Use `edge: BOTH`. It is never debounced — an "off" must never be swallowed — and it reconciles: a steady indication that contradicts the last commanded level fires the correcting half |
| A bouncing contact loses a Dump | Debounce | `gpio.debounce_ms` is 50 ms per channel, with Dump and Dump all **exempt**: the escape hatch must never lose a race |
| A saved row sits dark | `kind: "audio"` can never match a video channel's delay | Refused at save — fix the row's kind |
| A lamp pin flaps | Two enabled rows write one output pin | One enabled row per lamp pin is enforced at save. Control pins stack freely |
| A depth lamp chatters on the boundary | No hysteresis | `gpio.hysteresis_pct` defaults to 2 % of target |
| The node accepts subscriptions but silently drops writes | It was never logged in | `LOGIN` is always sent, for exactly this reason. Check the password |
| The node connection drops and comes back | A periodic liveness probe is the only way to notice a dead LWRP socket | Expected. Reconnect backs off 1, 2, 4 … 60 s with jitter so a rack of boxes does not resynchronise on a node reboot. `ALARM_GPIO_DOWN` raises after 5 s |
| The audit line's pin number looks off by one | The principal numbers the pin 1-based, as a console labels it; the configuration numbers it 0-based, as the wire does | Expected |
| A GPI press was refused and nothing retried | A refusal is logged and dropped, never retried, and never left wedging a pin | The level record has already moved on, so the release still fires |
| Lamps go stale, or a pin is rewritten by something else | Writes are diff-only against *confirmed* state, and confirmed state comes only from the node's echo | `gpio.poll_s` re-asserts drift. A pulse converges to its rest on reconnect and never re-fires |
| Changing a GPIO setting needs a restart | It does not | Any `gpio` change reconnects without restarting the program |

## Control surfaces

| Symptom | Cause | Fix |
|---|---|---|
| A Stream Deck or Companion profile will not drive port 9350 | There are two TCP listeners: the line protocol on 9350 and the JSON panel protocol on 9351. A profile written against one will not drive the other | Use the line protocol with a generic TCP module on 9350, or the panel protocol on 9351 |
| The panel shows live state but every key is refused | The `PANEL` licence feature is absent. Acting verbs answer `ERR <ch> UNLICENSED …` while reporting verbs and the subscription push keep flowing — so a wall panel looks perfectly healthy | Licence `PANEL`. Dump and Rollout are never gated, and REST is not gated |
| `/api/delay/dump` with no `seconds` dumped everything | That is Dump all | Pass `?seconds=` for a partial dump |
| TCP errors | `ERR <ch> <CODE> <reason>`, lines ending CR LF | Codes: `BADVERB`, `BADCH`, `NOCHAN`, `INVALID_STATE`, `LOCKED`, `LICENSE` / `UNLICENSED`, `AUTH` |
| A TCP peer is refused at connect | `tcp.allow_list` does not include it | Loopback is always allowed; add the peer, or clear the list |
| A TCP session is refused before any command | `auth.tcp_token` is set | Open with `AUTH <token>`. A wrong token answers `ERR 0 AUTH bad token` and the socket closes |
| `SUBSCRIBE` seems to ignore an earlier line | It **accumulates** across lines rather than replacing | Expected. It answers with its snapshot after the `OK` |

## Channel lock

| Symptom | Cause | Fix |
|---|---|---|
| The lock does not keep two operators apart | With `auth.enabled: false` there is no user to name, so a caller's principal is its address — a lock taken over TCP from loopback does not stop a REST command from loopback | Turn authentication on |
| The lock blocks less than expected | It blocks transport only: Build, Dump, Dump all, Rollout, Set depth, and starting, stopping, enabling or disabling the block. **Configuration stays open** | Expected |
| A lock is left behind by a shift that went home | Nobody released it | Force unlock as an admin: `?force=true` on REST, `UNLOCK <ch> FORCE` on TCP, or the console's button. It is audited as a forced unlock, never quietly as an unlock. An operator's force is refused |
| The lock disappeared after a restart | It is runtime state, not configuration | Expected: a restart starts unlocked |

## Enabling and disabling blocks

| Symptom | Cause | Fix |
|---|---|---|
| Disabling a block killed the NDI output entirely | Disable is a full stop of the block, not a bypass: the threads end and the NDI sender closes | Use Stop if you only want it to stop running now |
| A block was enabled and still will not run | The flag is set but the block cannot start — for example, no NDI source chosen | The reason comes back with the call. Start / Stop run the block now and leave the flag alone; Enable / Disable is the one that persists |

## Licensing

| Symptom | Cause | Fix |
|---|---|---|
| Every serial reads invalid on a bare-metal box | There are **two** hardware ids, and which one is reported depends on the VMware-distinct mode | `GET /api/licence` carries `hardware_id`, `hardware_id_mode`, `hardware_id_alternate` and `hardware_id_matches`, and the log names the mode the licence was issued in. Set `NDI2SRT_LICENCE_VMWARE_HWID=0` and restart if that is the mode it was issued in |
| A correctly licensed box reports itself invalid about a minute after boot | Historic: the online check asked the server about the wrong machine and got a "no customer record" answer, which reads as a revocation | Fixed. An activation, deactivation or revocation check now asks about the machine the licence is about. Upgrade |
| Every Linux box at a site shares one hardware id | The machine UUID in sysfs is root-readable only; unprivileged, the provider falls back to a constant shared by every host | **Do not request a licence against a degenerate identifier.** Activate as the same user the service runs as — the shipped unit runs as root. If an unprivileged service is required, grant read on the sysfs file (re-applied at boot, sysfs is volatile) or use a udev rule. `hardware_id_degenerate` on `GET /api/licence` tells you |
| "Licensing library cannot reach its store" | A root-owned store directory under an unprivileged service | A deployment fault, not an absent licence, and logged as an error at start. Make the store directory writable by the service user |
| An upgrade lost the activation | Off Windows the store defaults to a directory beside the configuration, so moving the configuration moves the store | Copy **both** `licence/` and `licence-state.json` across, or set `licence.store_dir` to a path outside the versioned tree. The installers do it with a previous-data-directory option |
| There is no grace period for a missing licence | Deliberate: no licence at all is invalid with zero grants, immediately | Activate. Nothing is refused — unseated blocks run watermarked |
| Watermarks appeared about a month after the network broke | Thirty consecutive failed daily checks | `ALARM_LICENCE_CHECK_FAILING` warns from day 23 and names the day watermarks start. An unreachable server keeps the licence running — only three exact server verdicts revoke |
| Deactivate always fails | Releasing a seat is not supported by the licensing service | Seat recovery is a manual operation with the licensing administration. `?force=true` deletes locally without asking, but the seat stays consumed |
| Re-imaging or a motherboard swap burned a seat | A new hardware id consumes a seat without releasing the old one | Plan a re-image as a call to the licensing administration, not a self-service step |
| A cloud instance drops its licence about a minute after boot | Hardware-bound re-activation re-binds to a volatile hardware id | Use container mode: `licence.container_serial` (or the environment variable). Validity then rides a 7-day grace since the last successful fetch, and an absent `VDELAY` token grants **0** delay channels rather than "uncapped" |
| An installer serial never activated | Activation is deliberately not done by the installer | The serial is stored as pending and consumed at boot and on each daily tick **only while the licensing server is unreachable**. `pending_serial_masked` on `GET /api/licence` shows it |
| A lock in the top third of the picture, and a beep every half minute | That is the unlicensed watermark on an unseated block: the mark blended at 45 %, and a one-second tone burst every thirty seconds at about −12 dBFS | Licence the block, or assign it a seat. There is deliberately no configuration key for the alpha, the cadence or the level |
| A block shows `no seat` or `unlicensed` | Seats are per **block** and handed out lowest channel id first. `no seat` = assigned but the pool is taken by lower-numbered channels; `unlicensed` = not assigned at all. An invalid licence grants zero seats in every pool | Release a seat elsewhere, or licence more |
| Save refused with a role message | The licence's role flags do not permit the role you are moving into | `PRIMARY` permits primary and standalone, `BACKUP` permits backup, `STANDALONE` permits standalone only. The check is on the transition |
| The console is locked and nothing can be changed | A backup-role activation was confirmed, which switches the box into the backup role | Stop the service, set `redundancy.role` back to `standalone` in the configuration file, and start it again. **Never confirm a backup-role activation on a box you want to keep driving** |
| A data receiver or a script switched itself off after half an hour | Those two have no output to watermark, so an unlicensed box runs each for 30 minutes and then disables it, audited and alarmed | Re-enabling grants a fresh 30 minutes; a valid licence lifts it entirely. There is deliberately no configuration key |
| Winding the clock back did not extend anything | Every comparison uses the highest clock ever seen, sealed into the licensing state | Expected |
| The masked serial looks like mojibake | PowerShell decodes the JSON as Latin-1 | The response is correct UTF-8 |

!!! note "The exits are never gated"
    Dump and Rollout work from any origin, with no licence at all, and on a
    standby whose local-control window has expired. (A channel lock and a
    *synced* backup do hold them, for their own reasons.)

## Scripting

| Symptom | Cause | Fix |
|---|---|---|
| Nothing dispatches at all | The `SCRIPTING` licence flag is absent, or `scripting.enabled` is off | Writing, saving, validating and rolling back scripts are untouched either way. The refusal is logged once per script per transition |
| A binding never fires | The trigger name a script *sees* is PascalCase, while the binding name in the configuration is camelCase | Bind with the camelCase name |
| | A filter does not match | `channel: 0` means any; an empty `event` means any |
| Invocations are dropped | The dispatcher queue is full | Raise `scripting.queue_size`. Drops are counted rather than waited on, so a trigger source is never blocked |
| A state change is missed | State changes are polled at 4 Hz, not hooked in the engine | A state that changes and changes back inside 250 ms is seen once, or not at all |
| A ported binding is refused at save | It names a block this program does not have | Use the triggers this product lists. A few recognised names exist that nothing raises |
| `dataClientEvent` never fires | It covers listening receivers only — a dialling receiver's own reconnect loop is not a client arriving | Use a `tcp_server` receiver |
| `dataDelayed` never fires on a backup | A locked standby never releases a delayed message, because it is not on air | Expected |
| A script wedges the box | It cannot: `scripting.timeout_ms` is enforced inside the interpreter, so an endless loop is **cut**, not waited out, and the script is recompiled fresh next time | Raise the budget if a script legitimately needs longer — but a long job belongs in a timer, not in a trigger |
| A script cannot read a file or fetch a URL | The sandbox removes the filesystem, process and module interfaces in both languages | Use the host API and data channels instead |
| Lua cannot parse JSON | There is no JSON library in the Lua sandbox | Pattern-match, or use JavaScript, whose sandbox keeps `JSON.parse` |
| A variable write is refused | The name is over 128 bytes, the value is over 16 KiB, or the store already holds 1000 | The script gets `false`; REST gets a 400 |
| A cron schedule fires on the wrong days | **Day-of-month and day-of-week are ANDed**, unlike Vixie cron. `0 6 13 * 5` is "6 a.m. on Friday the 13th", not "the 13th, and every Friday" | Write the expression accordingly. Cron and timers run on local time |
| A save is refused with a parser message | Every save compiles the source first, and an invalid script is refused with nothing changed | Fix the syntax. A rollback re-validates before going live, and the Check button answers 200 with `{"ok":false,…}` — it is a question, not an error |
| A hand-edited script file is not picked up | The store has an index | Use Reload from disk, or restart. An unknown `.lua` or `.js` file is adopted as a manual-trigger script under its file name, and nothing in that directory can stop the process starting |
| A command silently does nothing | A command returns **`true`** when accepted and **`false`** when refused — a script is never raised an exception for being told no. It is refused when another operator holds the channel lock, when this box is a locked backup, or when the block it drives is not running | The *reads* are never refused, not even on a locked standby |
| A backup's script version history has holes | Its history is what it has been sent, which may skip a version the primary made and replaced between two polls | Expected |
| The live script log stops in a browser | A browser's event-source cannot send an authorization header | Bearer-token clients use the cursor poll `GET /api/script-log?after=<seq>` instead. The server keeps the last 200 lines and tells a client more than 256 behind how many it missed |

## Redundancy

| Symptom | Cause | Fix |
|---|---|---|
| Every control on a box is refused with "this instance is a backup" | It is a standby, and the lockout is blanket and fail-closed | Expected. See [Operating a standby](../redundancy/standby.md) |
| You cannot change a standby's own settings from its console | The lockout refuses the configuration save itself, not just the mirrored keys | Stop the service, edit `ndi2srt.json`, start it again |
| The backup will not take over by itself | Automatic takeover needs the primary unreachable for `takeover_after_s` **and** the box ready **and** rank 1 | The reasons are on the Redundancy page and in `ALARM_REDUNDANCY_NOT_READY`. Use **Take over anyway** if you have read them |
| The primary came back and the standby kept the plant | Deliberate: nothing re-locks on its own, because an automatic name-yield mid-programme is worse than staying put | Rejoin explicitly |
| The delay lost its buffer at takeover | The NDI blocks restart to adopt the primary's names, and a restarted delay builds from empty | Accepted cost — airing under the wrong name is worse |
| The backup's decoder cannot pull its SRT stream | The far end only accepts one caller, and the primary already has it | Give the backup's decoder its own stream, or leave its decoder block disabled |
| The sync poll is refused with 401 or 403 | The token differs, or the far box's role is not `primary` | Set the same `redundancy.token` on both. A backup never serves the sync feed, so a backup of a backup cannot work |
| "sync schema N from the primary, this build speaks M" | The pair is on different versions | Upgrade both together. The backup keeps running on what it has until you do |
| `ALARM_REDUNDANCY_SYNC_REFUSED` | The primary's document reached this box and would not apply here — a path that does not exist, a port already bound, a channel list beyond this box's capacity | Fix the machine-local setting the alarm names. Contact is fine throughout; this never causes a failover |
| `ALARM_REDUNDANCY_ASSETS` | A file named by the configuration could not be mirrored — gone from the primary, or a transfer that did not verify | The per-file list is under the Redundancy page's card. The rest of the document still lands, but the backup reads **not ready** |
| Two boxes are airing under one set of names | A backup took over and the primary came back | `ALARM_REDUNDANCY_CHILD_TAKEN_OVER` on the primary is critical. Rejoin the backup, or stop the primary |
| A backup shows **stale** on the primary | It has not polled for 20 seconds | `ALARM_REDUNDANCY_CHILD_STALE`. Go and look at the backup |
| The controls re-locked on a box that had taken over | The local-control window (`redundancy.grace_days`) expired | Dump, Dump all and Rollout still answer. Reconnect the primary, rejoin, or change the role — any of the three clears the window immediately |
| The window reads expired straight away | The sealed record does not verify — edited, or copied from another box — and the window fails **closed** | Reconnect the primary, rejoin, or change the role |

## Service, installers and ports

| Symptom | Cause | Fix |
|---|---|---|
| Two instances fight over ports and NDI names | Both are running | Do not run the service and a second copy at once |
| `install.ps1` fails with "running scripts is disabled on this system" | The execution policy | Right-click **`install.cmd`** and run it as administrator — it launches the script past the policy |
| An MSI install fails with what looks like a permissions problem | An `ndi2srt` service is already registered by the zip's installer, so Windows Installer cannot create its own | `sc.exe stop ndi2srt` then `sc.exe delete ndi2srt`, then install. Configuration, licence and logs are left alone. **Do not mix the zip and the MSI on one machine** |
| The service stops untidily, or a shutdown script never ran | Historic: a termination signal killed the process outright | Fixed. Service stop, system shutdown and `SIGTERM` all stop cleanly |
| An upgrade seems to have flattened the site's settings | It cannot: the service only writes a default configuration when there is none | Check you are looking at the data directory's file, not one beside a new executable |
| Real-time priority starves the box | `process.priority: realtime` asks for the real-time process class, which can starve the network and NDI stacks | Use `high`. What was actually granted is in the log and the console header |
| Real-time thread priority is not granted on Linux | It needs root, `CAP_SYS_NICE`, or a suitable `LimitRTPRIO` | The shipped unit runs as root with the limit raised |
| A process launched over SSH on Windows dies with the session | The session owns it | Launch it detached |
| There is no desktop window to open | The shipped build is headless and carries no windowing stack at all | Use the console in a browser |

### Ports to open

| Port | Protocol | What for |
|---|---|---|
| 8090 | TCP | Console and REST — also the redundancy sync feed |
| 9350 | TCP | Line-protocol control |
| 9351 | TCP | Panel protocol |
| 161 (or 1161) | UDP | SNMP agent |
| 162 | UDP | SNMP traps, outbound to the receiver |
| 93 | TCP | Axia LWRP, outbound to the node |
| 5353 | UDP | NDI discovery (mDNS) |
| 5960 and up | TCP/UDP | NDI media |
| `9001 + 10 × (n−1)` | UDP | SRT per channel, encoder |
| `9002 + 10 × (n−1)` | UDP | SRT per channel, decoder |

## Console and users

| Symptom | Cause | Fix |
|---|---|---|
| The page and the API are wide open | `auth.enabled` is off, so everyone is an admin named after their address | Turn it on, or keep the console on the plant network. The log warns at start when open mode is paired with a non-loopback `web.bind` |
| Previews disappear when you navigate away | Only the routed view renders, and a view that leaves the screen detaches its previews | Deliberate, to keep the page cheap |
| An unknown or role-forbidden link lands on the dashboard | The console falls back rather than showing nothing | Role gating hides the nav entries and refuses the routes — **the server is still the real gate** |
| Everyone is signed out after a restart | Sessions are in memory | Expected |
| Sign-in is refused under load | Logins are rate-limited to 5 a minute per address, token requests to 10 | Expected |
| An API client secret is lost | It is returned once at creation and only its hash is stored | Create a new client |
| An admin cannot delete their own account | Nor the last admin | Expected. Deleting a user, or changing their role, ends their sessions |
| Single sign-on returns 501 | OIDC is configured but not built in this version | Use local users for now |

## Audio

| Symptom | Cause | Fix |
|---|---|---|
| A capture device will not open | On macOS the process needs Microphone permission | Grant it |
| | On Windows only one ASIO driver can be open per process | Use one ASIO device, or WASAPI |
| | The card insists on a channel count | Set `audio_inputs[].channels` rather than leaving it at `0` |
| | The device name or ALSA identifier is wrong | `GET /api/audio-devices` lists what the box has; `GET /api/audio-inputs` shows what opened |
| The device is busy | Something else has it, or two entries name the same device twice | Each device is opened **once** and shared by everything that names the input — use one named input and point several consumers at it |
| There is no ASIO output | ASIO output is not built | Playback is ALSA, CoreAudio or WASAPI |
| An audio delay drifts against the device clock | Device and source clocks differ | Depth drift is held with pitch-preserving stretch when the SoundTouch library is beside the executable, and with a linear-resample fallback otherwise |
| The encoder carries the wrong audio pair | `audio.pair` selects which pair AAC carries | `1` = channels 1–2, `2` = 3–4. A source without the pair asked for falls back to the first pair and says so in the log |
| A third-party SRT receiver connects to an audio encoder and decodes nothing | That link carries Airlock's own framing, not MPEG-TS | Use RTP or a SIP call for someone else's equipment, Icecast, RTMP or HLS for distribution, or a video channel's encoder for a transport-stream SRT feed |
| Integrated loudness readings cost a whole core | Historic, in an earlier product: the whole history was re-averaged on every read | Not the case here — the gating block is a single histogram increment. **Reset stats** restarts the measurement, including the integrated figure |
| Loudness or silence readings look skewed on a watermarked box | They are not: the watermark goes on **after** the loudness meter, **after** the peak meter the silence detector reads, and **after** the alarm-facing preview | The one preview that shows the mark is the delay's output preview, which no detector reads |

## Configuration store

| Symptom | Cause | Fix |
|---|---|---|
| A restored setting has not taken effect | Restores and resets apply to the configuration the *next* start of each block uses | Restart the block. Only the dissolve settings are pushed live |
| A restore wiped this machine's ports and paths | `keep_local` was turned off | Leave it on (the default). It keeps exactly the machine-local keys listed in the [configuration reference](config.md) |
| A backup file is refused | It is not an Airlock backup, is a version this build does not write, or its configuration does not validate | The refusal names the reason |
| History entries are missing | The history is written best-effort: a save never fails because the history directory could not be written | The live file is what runs. The log says what went wrong |

## Watchdog

| Symptom | Cause | Fix |
|---|---|---|
| The watchdog did not restart a dead block | A block is stalled only when its **input is arriving and its output is not**. A source that has gone away is not a stall, and a stopped block is never started | Expected. Use alarms for a lost source |
| It stopped restarting a block | The hourly cap | `watchdog.max_restarts_per_hour` (6 by default). At the cap it logs and audits `watchdog.capped` and leaves the block alone until the hour rolls off. `0` makes it alarm-only |
| Restarting one block restarted another | Blocks feed each other: restarting the decoder restarts a delay whose source is `decoder`, and restarting the delay restarts an encoder whose source is `delay` | Expected |
| You want to prove it without breaking anything | `POST /api/watchdog/test/{encoder\|decoder\|delay}` treats that block as stalled on the next tick | Admin only, and audited |

## When you need to raise it

Have these ready — they are what support asks for first:

1. The **version** (console header, or `GET /api/state`).
2. The **hardware id** and the licence verdict (`GET /api/licence`, or the
   Licence page's copy button).
3. The **log** around the event, with `logging.level: debug` if you can
   reproduce it — or `RUST_LOG=debug` for a single run.
4. The **audit entries** around the event.
5. The **alarms** that were active.
6. The **configuration**, with credentials removed.
