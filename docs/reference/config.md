# Configuration file

Airlock keeps everything in one JSON file, `ndi2srt.json`. This page documents
every section and every key in it — type, default and what it does. The console
edits the same file, so these keys are what every settings page is writing.

## Where the file lives

Airlock reads, in order: the path given with `--config`, the path in the
`NDI2SRT_CONFIG` environment variable, `ndi2srt.json` beside the executable, and
finally the installed service's copy.

| Platform | Service data directory |
|---|---|
| Windows | `%ProgramData%\ndi2srt` |
| Linux | `/var/lib/ndi2srt` |
| macOS | `/var/lib/ndi2srt` |

The directory holds the configuration file and, beside it, `ndi/`, `logs/`,
`audit/`, `assets/`, `clips/`, `config-history/`, `scripts/`, `licence/` and
`licence-state.json`.

!!! note "Every key has a default"
    A key you leave out takes its default, and a whole section you leave out
    takes its defaults. You only need to write what differs.

## Reading these tables

- **Key** — the JSON path. `channels[]` means "inside each entry of the
  `channels` array".
- **(local)** after a key means it is **machine-local**: in a primary/backup pair
  it stays with the machine and is never overwritten by the primary. Everything
  not marked is mirrored primary → backup. See
  [Redundancy](../redundancy/overview.md#what-mirrors-and-what-stays-local).
- **Default** — what you get if you omit the key.

## Shape

```json
{
  "channels": [ { "id": 1, "name": "Channel 1", "ndi": {}, "encoder": {}, "video": {},
                  "audio": {}, "ts": {}, "srt": {}, "decoder": {}, "delay": {}, "scte": {} } ],
  "clock": {}, "web": {}, "tcp": {}, "process": {}, "ndi_network": {},
  "logging": {}, "audit": {}, "auth": {}, "alarms": {}, "email": {}, "webhooks": {},
  "snmp": {}, "store": {}, "clips": {}, "redundancy": {}, "watchdog": {},
  "gpio": {}, "data": {}, "scripting": {}, "licence": {}, "telemetry": {}, "tools": {},
  "audio_inputs": [], "audio_outputs": [], "audio_stages": [],
  "audio_delays": [], "audio_encoders": [], "audio_decoders": []
}
```

---

## channels

An array of channel objects. At least one; up to **32**. A channel is one delay,
one encoder and one decoder that belong together, addressed by its `id` on every
surface.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].id` | integer | `1` | 1-based, unique and **stable** — it is the address everywhere. Do not renumber a channel |
| `channels[].name` | string | `"Channel 1"` | What the console, the audit log and the SNMP channel table call it. 1–24 characters: letters, digits, space and `- _ .` |

A new channel created from the console gets distinct NDI output names, SRT ports
(`9001 + 10 × (id − 1)` for the encoder, `9002 + 10 × (id − 1)` for the decoder)
and a distinct transport-stream service id, so it validates on its first save.

!!! warning "Blocks feed each other within a channel only"
    `delay.source: "decoder"` and `ndi.source: "delay"` refer to *this*
    channel's blocks. To cross channels, go out and back over NDI.

### channels[].ndi

The encoder's input.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].ndi.source` | string | `""` | Full NDI source name, e.g. `"DC2-SVC05N (vMix - Output 3)"`. The word `delay` takes this channel's delayed output directly |
| `channels[].ndi.extra_ips` | string | `""` | Comma-separated extra IPs to probe when mDNS discovery cannot see the sender |
| `channels[].ndi.receiver_name` **(local)** | string | `"ndi2srt"` | The receiver name this box advertises to senders |

### channels[].encoder

The encoder block's own flags. The encoder has no settings section of its own —
it spans `ndi`, `video`, `audio`, `ts` and `srt`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].encoder.enabled` | bool | `true` | The *intent*: the process starts the block with it, and `ENABLE` / `DISABLE` set it. The Start / Stop buttons run the block now and leave the flag alone |
| `channels[].encoder.name` | string | `""` | What the console calls this encoder. Empty inherits the channel's name |
| `channels[].encoder.licence_assigned` | bool | `true` | Compete for a `VENCODE` seat. An unseated encoder runs watermarked rather than being refused |

### channels[].video

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].video.codec` | string | `"h264"` | `h264` or `h265` |
| `channels[].video.encoder` **(local)** | string | `"auto"` | `auto` (NVENC when present, else software), `software`, `nvenc`, or `x264` |
| `channels[].video.scan` | string | `"auto"` | `auto` (follow the source), `progressive`, or `interlaced`. Interlaced H.264 needs NVENC or libx264; interlaced HEVC is not available by any route |
| `channels[].video.bitrate_kbps` | integer | `6000` | Video bit rate |
| `channels[].video.gop_seconds` | float | `2.0` | IDR interval in seconds, converted to frames at the source rate |
| `channels[].video.profile` | string | `"high"` | `baseline`, `main` or `high`. Baseline forbids the interlaced tools |
| `channels[].video.threads` **(local)** | integer | `0` | Software-encoder threads. `0` picks a sensible number for this box |

### channels[].audio

The **encoder's** audio rail: what goes into AAC and onto the transport stream.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].audio.enabled` | bool | `true` | Carry audio at all |
| `channels[].audio.bitrate_kbps` | integer | `128` | AAC-LC bit rate |
| `channels[].audio.pair` | integer | `1` | Which pair of the source's channels AAC carries: `1` = channels 1–2, `2` = 3–4, and so on. A source with fewer channels falls back to the first pair, and says so in the log |
| `channels[].audio.processing` | object | *(off)* | Trim, EQ and compressor applied to the PCM going into AAC. See [Audio processing](#audio-processing) |

### channels[].ts

The transport stream the encoder muxes.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].ts.transport_bitrate_kbps` | integer | `8000` | `0` = VBR, paced to content time with no null padding. Otherwise the stream leaves at exactly this rate, null-padded, with the PCR on the byte clock — which is what a hardware decoder wants |
| `channels[].ts.pcr_interval_ms` | integer | `30` | PCR interval. The DVB limit is 40 ms |
| `channels[].ts.pat_pmt_interval_ms` | integer | `100` | PAT / PMT reinsertion interval |
| `channels[].ts.sdt_interval_ms` | integer | `500` | SDT reinsertion interval |
| `channels[].ts.decoder_delay_ms` | integer | `400` | How far PTS sits ahead of PCR — the receiver's buffering allowance |
| `channels[].ts.service_id` | integer | `1` | Service id in the PAT and SDT |
| `channels[].ts.service_name` | string | `"ndi2srt"` | Service name in the SDT |
| `channels[].ts.provider_name` | string | `"Cloudcast"` | Provider name in the SDT |
| `channels[].ts.video_pid` | integer | `256` | Video PID (32–8186) |
| `channels[].ts.audio_pid` | integer | `257` | Audio PID (32–8186) |
| `channels[].ts.pmt_pid` | integer | `4096` | PMT PID (32–8186) |

### channels[].srt

The encoder's SRT output.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].srt.mode` | string | `"caller"` | `caller` dials out; `listener` waits to be dialled. Exactly one end of a link is a listener |
| `channels[].srt.host` | string | `"127.0.0.1"` | Peer host (caller mode) |
| `channels[].srt.port` | integer | `9001` | Port. Listener ports must be unique across channels — that is enforced at save |
| `channels[].srt.latency_ms` | integer | `200` | The retransmission budget. Both socket buffers are sized from this and the bit rate |
| `channels[].srt.passphrase` | string | `""` | Empty = no encryption |
| `channels[].srt.key_len` | integer | `16` | `16`, `24` or `32` — AES-128, 192 or 256 |
| `channels[].srt.stream_id` | string | `""` | The SRT stream id, when the far end routes on it |

### channels[].decoder

SRT in → NDI out, the reverse path.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].decoder.enabled` | bool | `false` | Start the decoder with the process |
| `channels[].decoder.name` | string | `""` | What the console calls this decoder. Empty inherits the channel's name |
| `channels[].decoder.srt.*` | object | mode `listener`, port `9002` | The receiving SRT endpoint. Same keys as `channels[].srt` |
| `channels[].decoder.ndi_name` | string | `"ndi2srt decoder"` | The NDI source name this decoder publishes. Must be unique across the process |
| `channels[].decoder.output_delay_ms` | integer | `300` | How far behind the first picture the output timeline sits — covers demux and decode timing. The held budget is this *plus* `decoder.srt.latency_ms`, and the frame queue is sized from both |
| `channels[].decoder.audio` | bool | `true` | Decode and publish audio |
| `channels[].decoder.hw` **(local)** | string | `"auto"` | `auto` (NVDEC when present, else software), `software` or `nvdec`. Only NVDEC decodes field-coded H.264 |
| `channels[].decoder.timecode` | string | `"synthesize"` | `synthesize` lets the NDI runtime stamp the send time; `pts` derives it from the stream's PTS, anchored to the wall clock at the first picture. Prefer `pts` when anything downstream must align |
| `channels[].decoder.licence_assigned` | bool | `true` | Compete for a `VDECODE` seat |

### channels[].delay

NDI in → a FIFO of raw frames → NDI out.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].delay.enabled` | bool | `false` | Start the delay with the process |
| `channels[].delay.name` | string | `""` | What the console calls this delay. Empty inherits the channel's name |
| `channels[].delay.source` | string | `""` | NDI source name, the word `decoder` to take this channel's decoded output, or a `test:` signal |
| `channels[].delay.audio_only` | bool | `false` | Delay sound only, with no video. The source is an audio input or an NDI source's audio |
| `channels[].delay.output` | string | `""` | For an audio-only delay: the named audio output to play to. Empty = NDI send only. The **name** mirrors; the device behind it is machine-local |
| `channels[].delay.depth_s` | float | `10.0` | Target depth in seconds |
| `channels[].delay.ndi_name` | string | `"ndi2srt delay"` | The NDI source name this delay publishes. Must be unique across the process |
| `channels[].delay.max_memory_mb` **(local)** | integer | `4096` | Caps the raw-frame buffer, and so the achievable depth. Memory ≈ width × height × 1.5 × fps × seconds. Past the cap the oldest frame is dropped and counted |
| `channels[].delay.dump_seconds` | float | `5.0` | How many seconds the Dump button removes |
| `channels[].delay.rebuild_after_dump` | bool | `true` | Regain the depth after a dump, airing the fill while it does. Off leaves the delay at the shorter depth until the next Build |
| `channels[].delay.fade_ms` | integer | `500` | Dissolve length for the transitions below — video crossfade plus audio ramp |
| `channels[].delay.fade_rollout` | bool | `true` | Rollout dissolves to live instead of cutting |
| `channels[].delay.fade_build` | bool | `true` | Build dissolves into the hold frame and out of it at depth |
| `channels[].delay.fade_dump` | bool | `true` | Dump dissolves across the splice where the removed seconds were |
| `channels[].delay.timecode` | string | `"passthrough"` | `passthrough` sends each content frame with the timecode it arrived with, and continues from the last emitted one for fill and hold frames; `synthesize` lets the NDI runtime stamp the send time |
| `channels[].delay.licence_assigned` | bool | `true` | Compete for a `VDELAY` seat |

### channels[].delay.fill

What the output airs when there is no delayed programme to air.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…delay.fill.video` | string | `"freeze"` | `freeze` (hold the last frame), `black`, `image`, `clip`, or `ndi` (a live source, scaled to the raster) |
| `…delay.fill.image_path` | string | `""` | PNG or JPEG slate, letterboxed to the output raster. Must be in the asset library (`<config dir>/assets`) — a save naming a file elsewhere is refused |
| `…delay.fill.clip_path` | string | `""` | A looped `.ts` file — H.264 or HEVC with AAC, read by the built-in decoders. Asset library only, as above |
| `…delay.fill.ndi_source` | string | `""` | The live NDI source for `video: ndi` |
| `…delay.fill.audio` | string | `"silence"` | `silence`, `tone`, `clip` (the clip's own audio), `ndi` (the live source's audio), or `mute` (no audio frames at all) |
| `…delay.fill.tone_hz` | float | `1000.0` | Tone frequency |
| `…delay.fill.tone_dbfs` | float | `-18.0` | Tone level |
| `…delay.fill.rollout_fill` | bool | `false` | Rollout airs the fill for the remaining depth instead of jump-cutting. The buffered content is discarded either way |
| `…delay.fill.clip_max_s` | float | `20.0` | Seconds of clip held decoded at the output raster (0–600). Memory ≈ width × height × 1.5 × fps × seconds — 20 s of 1080p25 is about 1.5 GB. A longer file is cut here, and the cut is logged |
| `…delay.fill.schedule` | array | `[]` | Dayparted fill rows. See below |

Each schedule row:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…fill.schedule[].enabled` | bool | `true` | |
| `…fill.schedule[].days` | string | `"all"` | `all`, `weekdays`, `weekends`, or a comma list of `mon,tue,wed,thu,fri,sat,sun`. The whole-word aliases cannot appear *inside* a list |
| `…fill.schedule[].start` | string | `"00:00"` | Local `HH:MM` |
| `…fill.schedule[].end` | string | `"24:00"` | Local `HH:MM`, **exclusive**. An `end` at or before `start` wraps past midnight |
| *(the fill-set keys)* | | | A row carries `video`, `image_path`, `clip_path`, `ndi_source`, `audio`, `tone_hz` and `tone_dbfs` inline, replacing the top-level set while it matches |

The first enabled matching row wins. A boundary swap is a cut, not a dissolve.

### channels[].delay.aux

Extra audio tracks, delayed in lockstep with the picture and appended after the
source's own channels on the delayed NDI output.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…delay.aux[].name` | string | `""` | What the track is called |
| `…delay.aux[].kind` | string | `"ndi"` | `ndi` (an NDI source's audio) or `input` (one of this box's named audio inputs) |
| `…delay.aux[].ndi_source` | string | `""` | The NDI source, for `kind: ndi`. Its video is not received |
| `…delay.aux[].input` | string | `""` | The named audio input, for `kind: input` |
| `…delay.aux[].first_channel` | integer | `0` | The first of the input's channels the track takes, 0-based |
| `…delay.aux[].channels` | integer | `2` | How many channels the track carries. Missing ones are silent |
| `…delay.aux[].fill` | string | `"parent"` | What the track airs while the delay airs a fill: `parent` (the fill's own audio) or `silence` |
| `…delay.aux[].offset_ms` | integer | `0` | How much later than its picture the track's audio arrives, in ms. The track is read that much later so it lands with the picture. Negative for audio that arrives early |

A track whose source stops raises `ALARM_AUX_SOURCE_LOST` and airs silence until
it returns.

### channels[].delay.audio_processing

Trim, EQ and compressor applied to the audio the delay emits. See [Audio
processing](#audio-processing) for the shared key list.

### channels[].delay.censor

Cough, censor and slate.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…delay.censor.audio` | string | `"tone"` | What a censor airs: `tone`, `silence`, `fill` (the fill set's audio), or `none` (mask the picture only, let the audio pass) |
| `…delay.censor.tone_hz` | float | `1000.0` | Cover-tone frequency |
| `…delay.censor.tone_dbfs` | float | `-18.0` | Cover-tone level |
| `…delay.censor.pre_ms` | integer | `500` | Lead-in: how much of what was *just* said the press also covers — the operator's reaction time |
| `…delay.censor.cough_tail_ms` | integer | `300` | Lead-out after a cough is released |
| `…delay.censor.censor_seconds` | float | `3.0` | Length of a one-shot censor press |
| `…delay.censor.held_timeout_ms` | integer | `30000` | A latched censor whose release never arrives is let go after this long. `0` disables the ceiling. A slate has no timeout — a slate is deliberate |
| `…delay.censor.video_mode` | string | `"none"` | `none` (audio-only censor), `mask`, or `slate` |
| `…delay.censor.mask` | string | `"mosaic"` | `blur` (box blur), `mosaic` (block pixelate) or `solid` (video black) |
| `…delay.censor.mask_strength` | integer | `24` | Blur radius or mosaic block in pixels at 1080-line height, scaled with the raster |
| `…delay.censor.slate_from_fill` | bool | `true` | A slate covers the output with the fill set's picture. `false` = video black |
| `…delay.censor.slate_mute` | bool | `true` | A slate mutes the output audio |
| `…delay.censor.schedule` | array | `[]` | Dayparts that censor by themselves |

Each censor schedule row:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…censor.schedule[].enabled` | bool | `true` | |
| `…censor.schedule[].days` | string | `"all"` | As for the fill schedule |
| `…censor.schedule[].start` | string | `"00:00"` | Local `HH:MM` |
| `…censor.schedule[].end` | string | `"24:00"` | Local `HH:MM` |
| `…censor.schedule[].kind` | string | `"both"` | `audio` bleeps without touching the picture, `video` masks or slates without touching the audio, `both` does whatever `delay.censor` is configured for |

### channels[].delay.maintain

Depth maintenance under a poor or lost source.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…delay.maintain.enabled` | bool | `false` | Run depth maintenance at all |
| `…delay.maintain.mode` | string | `"hold"` | `hold` airs the fill instead of consuming, so the protection window survives the outage (at the cost of timeline drift). `drain` is the old behaviour: the buffer drains and the window goes with it |
| `…delay.maintain.fill_after_ms` | integer | `500` | How long the input must be silent before the output stops consuming |
| `…delay.maintain.catchup` | string | `"bounded"` | `none` (live with the new depth), `bounded` (slew the output clock), or `free` (absorb a surplus in one jump, refill a deficit from the fill) |
| `…delay.maintain.catchup_max_ppm` | integer | `50000` | The slew bound in parts per million of output rate. 50000 = 5 % fast or slow |
| `…delay.maintain.resync_s` | float | `30.0` | A buffer surplus bigger than this is absorbed in one jump even in `bounded` mode — slewing it away would take too long. `0` = never jump |

Maintenance runs in the Delayed state only, and a ±2 frame deadband keeps normal
jitter off the clock.

### channels[].scte

SCTE-104 in, SCTE-35 out. Every default is inert.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `channels[].scte.enabled` | bool | `false` | Master switch. Off means a cue on the input is ignored and nothing is added to the transport stream |
| `channels[].scte.block` | bool | `false` | Operator kill switch: cues are decoded, counted and logged, then dropped. Also a runtime control |
| `channels[].scte.block_kinds` | string | `""` | Comma list of kinds to drop: `out` (break start), `in` (return), `cancel`, `other` (anything with no splice request). Empty blocks nothing beyond `block` |
| `channels[].scte.accept_from_ndi` | bool | `true` | Take SCTE-104 off the NDI input's metadata |
| `channels[].scte.accept_from_srt` | bool | `true` | Take SCTE-35 sections off a received transport stream |
| `channels[].scte.emit_to_ndi` | bool | `true` | Re-emit the delayed cue as NDI metadata on the delayed output |
| `channels[].scte.emit_to_srt` | bool | `true` | Re-insert the delayed cue on the encoder's transport stream |
| `channels[].scte.pid` | integer | `500` | The SCTE-35 PID (32–8186), carried as stream type `0x86` with a `CUEI` registration in the PMT |
| `channels[].scte.pre_roll_ms` | integer | `4000` | Pre-roll for cues **this program originates**. The standards put the floor at 4000 ms and it is enforced. A pass-through cue always keeps the upstream's own pre-roll |
| `channels[].scte.null_interval_ms` | integer | `1000` | Heartbeat interval for `splice_null` sections, so an idle PID does not read as dead to an analyser. `0` turns it off |
| `channels[].scte.absolute_action` | string | `"drop"` | `drop` or `pass`: an absolute-time cue names an instant the delay has invalidated. It is only dropped once the delay has actually moved it |
| `channels[].scte.absolute_tolerance_frames` | integer | `2` | How many frames of real delay count as "moved it" |
| `channels[].scte.pass_other_metadata` | bool | `false` | Relay foreign (non-SCTE) NDI metadata through the delay as well |
| `channels[].scte.tier` | integer | `4095` | The `tier` written into the section. 12 bits; `0xFFF` = unused |

---

## clock

Reference clock and output genlock.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `clock.reference` **(local)** | string | `"monotonic"` | `monotonic` (the host's free-running timer) or `system` (the OS wall clock — the plant reference when it is PTP-disciplined). Paces the byte clock and the PCR. A wall-clock *step* is absorbed into an offset and counted |
| `clock.lock_output` | bool | `false` | Hold the output cadence to the reference: one frame slot per period, source frames repeated or dropped to fit, audio conformed to the same grid. Off = the stream runs at the source's own rate |

---

## web

The console and REST listener.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `web.enabled` **(local)** | bool | `true` | Serve the console and the REST API |
| `web.bind` **(local)** | string | `"0.0.0.0"` | Local address to bind |
| `web.port` **(local)** | integer | `8090` | Port. This is also where a backup polls its primary |

---

## tcp

The Airlock-compatible line-protocol control port.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `tcp.enabled` **(local)** | bool | `true` | Run the TCP control listener |
| `tcp.bind` **(local)** | string | `"0.0.0.0"` | Local address to bind |
| `tcp.port` **(local)** | integer | `9350` | Port |
| `tcp.allow_list` **(local)** | string | `""` | Comma-separated peer IPs allowed in. Empty = any. Loopback is always allowed |

---

## process

| Key | Type | Default | Meaning |
|---|---|---|---|
| `process.priority` **(local)** | string | `"high"` | `high` raises the process class and gives the pacing threads real-time thread priority; `realtime` asks for the real-time process class (needs administrator or root, and can starve the system); `normal` leaves it alone. What was actually granted is in the log and in the console header |
| `process.max_memory_mb` **(local)** | integer | `0` | Process-wide admission ceiling on delay buffering, in MB. A configuration whose channels add up past it is refused at save. `0` leaves it off — the per-channel `delay.max_memory_mb` cap still applies to each channel on its own. It is an *admission* ceiling: it never shrinks a running buffer |

!!! note "A mirrored configuration is applied anyway"
    A configuration that arrives from a redundancy primary and exceeds this
    ceiling is applied with a warning rather than refused — but the backup then
    reports itself **not ready** to take over.

---

## ndi_network

Rendered into a private NDI configuration file beside the configuration, and
pointed at before the NDI runtime loads. An empty or `null` value leaves NDI's
own default, in which case the machine's NDI settings stay in force.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `ndi_network.discovery` | string | `""` | Discovery server address(es), comma-separated `ip[:port]`. Setting it **turns mDNS off**, so every sender must register with the server too |
| `ndi_network.recv_groups` | string | `""` | Comma-separated groups to receive from. Empty = public |
| `ndi_network.send_groups` | string | `""` | Comma-separated groups the delay and decoder outputs are sent into |
| `ndi_network.extra_ips` | string | `""` | Sender IPs to consider besides discovery |
| `ndi_network.adapters` **(local)** | string | `""` | Comma-separated adapter IPs NDI may use |
| `ndi_network.rudp_send` | bool or null | `null` | Reliable UDP send |
| `ndi_network.rudp_recv` | bool or null | `null` | Reliable UDP receive |
| `ndi_network.tcp_send` | bool or null | `null` | TCP send |
| `ndi_network.tcp_recv` | bool or null | `null` | TCP receive |
| `ndi_network.unicast_send` | bool or null | `null` | Unicast UDP send |
| `ndi_network.unicast_recv` | bool or null | `null` | Unicast UDP receive |
| `ndi_network.multicast_send` | bool or null | `null` | Multicast send |
| `ndi_network.multicast_recv` | bool or null | `null` | Multicast receive |
| `ndi_network.multicast_ttl` | integer or null | `null` | Multicast TTL |
| `ndi_network.multicast_netmask` | string | `""` | Multicast netmask |
| `ndi_network.multicast_netprefix` | string | `""` | Multicast network prefix |
| `ndi_network.multicast_recv_subnets` | string | `""` | Comma-separated CIDR subnets multicast receive may be negotiated from |
| `ndi_network.advanced` | string | `""` | A whole NDI configuration document (or its `ndi` object) merged over the fields above |

---

## logging

| Key | Type | Default | Meaning |
|---|---|---|---|
| `logging.file` **(local)** | bool | `true` | Write the log file at all |
| `logging.dir` **(local)** | string | `""` | Directory for the log files. Empty = `logs` beside the configuration |
| `logging.level` | string | `"info"` | `error`, `warn`, `info` or `debug`. `RUST_LOG` overrides it for one run |
| `logging.max_mb` | integer | `10` | Rotate when the live file passes this size |
| `logging.keep` | integer | `10` | Files kept, the live one included |
| `logging.stats_interval_s` | float | `10.0` | Seconds between the per-block statistics lines when running as a service |

---

## audit

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audit.keep_months` | integer | `12` | Month files kept, the current one included. `1` = this month only. Older files are deleted when a new month opens and at start |

The log lives at `audit/audit-YYYY-MM.jsonl` beside the configuration.

---

## auth

Users, roles and API access.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `auth.enabled` | bool | `false` | Require a sign-in. **Off means no authentication at all** — everyone is an admin named after their address |
| `auth.session_hours` | float | `8.0` | Browser session lifetime, and the lifetime of a bearer token from `/oauth/token`. Sessions are in memory, so a restart signs everyone out |
| `auth.users` | array | `[]` | Local users. See below |
| `auth.api_clients` | array | `[]` | API clients for the client-credentials flow. See below |
| `auth.tcp_token` | string | `""` | When set, a TCP control connection must open with `AUTH <token>` |
| `auth.oidc` | object | *(off)* | Single sign-on. See below |

!!! warning "Open mode is for a trusted network only"
    With `auth.enabled: false` the console and the API are wide open, and the
    log warns at start when that is paired with a non-loopback `web.bind`.
    Channel locking is also weaker in open mode, because there is no user to
    name.

### auth.users[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `auth.users[].name` | string | `""` | Login name |
| `auth.users[].password_hash` | string | `""` | Stored only as `pbkdf2-sha256$iters$salt$hash`. Manage passwords through the console or `/api/users`, never by hand |
| `auth.users[].role` | string | `""` | `admin`, `operator` or `viewer` |
| `auth.users[].must_change_password` | bool | `false` | Set on the bootstrap admin and after an admin reset: the next login may do nothing but change the password |

On the first start with `auth.enabled: true` and no users, an `admin` account is
created with a random password, printed once and written to
`admin-initial-password.txt` with mode 600. Change it and delete the file.

### auth.api_clients[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `auth.api_clients[].id` | string | `""` | `ak_` plus 16 hex, generated |
| `auth.api_clients[].label` | string | `""` | What the client is for |
| `auth.api_clients[].secret_hash` | string | `""` | The secret is shown once at creation and stored hashed |
| `auth.api_clients[].role` | string | `""` | `admin`, `operator` or `viewer` |
| `auth.api_clients[].created` | string | `""` | Creation timestamp |

### auth.oidc

| Key | Type | Default | Meaning |
|---|---|---|---|
| `auth.oidc.enabled` | bool | `false` | Offer single sign-on |
| `auth.oidc.issuer` | string | `""` | Issuer URL; discovery at `<issuer>/.well-known/openid-configuration` |
| `auth.oidc.client_id` | string | `""` | Client id at the identity provider |
| `auth.oidc.client_secret` | string | `""` | Client secret |
| `auth.oidc.role_claim` | string | `"groups"` | The claim carrying the group or role values |
| `auth.oidc.display_name` | string | `"single sign-on"` | The button reads "Sign in with *this*" |
| `auth.oidc.scopes` | string | `"openid profile email"` | Space-separated scopes. Some providers need an extra one (for example `groups`) before they put `role_claim` in the ID token |
| `auth.oidc.redirect_url` **(local)** | string | `""` | The public callback URL registered at the provider. Empty derives it from the request |
| `auth.oidc.admin_groups` | array | `[]` | Claim values mapping to `admin` |
| `auth.oidc.operator_groups` | array | `[]` | Claim values mapping to `operator` |
| `auth.oidc.viewer_groups` | array | `[]` | Claim values mapping to `viewer` |
| `auth.oidc.default_role` | string | `""` | Role for a user whose groups match none of the lists. Empty means deny |

Admin wins, then operator, then viewer.

---

## alarms

Detection thresholds. Every detector needs its condition to hold for the raise
time before an alarm is raised, and to be clear for the restore time before it
clears, so a flapping link never spams the deliveries. Changes apply live.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `alarms.enabled` | bool | `true` | Run the detectors at all |
| `alarms.audio_silence_dbfs` | float | `-50.0` | Audio silence: peak below this… |
| `alarms.audio_silence_s` | float | `30.0` | …continuously for this long raises. A source that stops sending audio blocks while its video keeps coming counts as silent |
| `alarms.audio_hysteresis_db` | float | `6.0` | Restore needs the peak above threshold *plus* this many dB… |
| `alarms.audio_restore_s` | float | `5.0` | …for this long |
| `alarms.video_black_luma` | float | `20.0` | Video black: mean 8-bit luma below this (16 is black level) |
| `alarms.video_frozen_motion` | float | `0.25` | Video frozen: mean absolute luma change per sample below this. `0` is identical pictures; camera noise is usually above 1 |
| `alarms.video_silence_s` | float | `30.0` | How long black or frozen must hold before it raises |
| `alarms.video_restore_s` | float | `5.0` | Restore time for black and frozen |
| `alarms.source_lost_s` | float | `5.0` | The block reports no video for this long. The block itself waits 3 s before it says so |
| `alarms.srt_down_s` | float | `10.0` | SRT link down for this long |
| `alarms.decoder_stall_s` | float | `5.0` | SRT connected but no decoded picture leaves for this long |
| `alarms.av_offset_ms` | float | `100.0` | Decoder lip sync: the picture's output clock this far from the sound's, either way… |
| `alarms.av_offset_s` | float | `5.0` | …for this long |
| `alarms.depth_low_margin_s` | float | `1.0` | A delayed channel more than this far below its target… |
| `alarms.depth_low_s` | float | `30.0` | …for this long |
| `alarms.restore_s` | float | `5.0` | Restore time for the link, source, stall and depth detectors |
| `alarms.notify_cooldown_s` | float | `300.0` | A re-raise of the same alarm within this many seconds of the last delivered raise is deferred — sent only if still active when the window ends. The alarm list itself is unaffected |
| `alarms.history` | integer | `500` | Cleared alarms kept in the history ring |

!!! note "Acknowledge and dismiss are display only"
    They change what the console shows. The counts, the SNMP objects, email and
    webhooks keep reporting a dismissed alarm exactly as before, and the overlay
    starts empty at every launch.

---

## email

SMTP delivery of alarm active and restored emails, and of dump-clip alerts.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `email.enabled` | bool | `false` | Send email at all |
| `email.host` | string | `""` | SMTP host |
| `email.port` | integer | `587` | SMTP port. Implicit TLS is usually 465 |
| `email.security` | string | `"starttls"` | `starttls`, `tls` (implicit) or `none` |
| `email.user` | string | `""` | SMTP user |
| `email.password` | string | `""` | SMTP password |
| `email.from` | string | `""` | Envelope and header sender |
| `email.to` | string | `""` | Comma-separated recipients |
| `email.subject_prefix` | string | `"[ndi2srt]"` | Prefixed to every subject |
| `email.notify_restored` | bool | `true` | Also email when an alarm restores, with its duration |

---

## webhooks

One signed JSON POST per alarm transition to every URL.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `webhooks.enabled` | bool | `false` | Post webhooks at all |
| `webhooks.urls` | string | `""` | Comma-separated `http(s)` URLs |
| `webhooks.secret` | string | `""` | When set, the body is signed: `X-Airlock-Signature: sha256=<lowercase hex HMAC-SHA256>` |
| `webhooks.timeout_s` | integer | `10` | Per-attempt timeout |
| `webhooks.retries` | integer | `3` | Attempts per URL, with 1 s, 3 s, 9 s backoff between them |
| `webhooks.notify_restored` | bool | `true` | Also post when an alarm restores |

Tell an alarm post and a dump post apart by the `event` field: `"alarm"` or
`"dump"`.

---

## snmp

SNMP v2c agent and traps. The MIB ships with the product.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `snmp.enabled` **(local)** | bool | `false` | Run the agent |
| `snmp.bind` **(local)** | string | `"0.0.0.0"` | Local address to bind |
| `snmp.port` **(local)** | integer | `161` | Port. **161 needs root or `CAP_NET_BIND_SERVICE`; 1161 does not** |
| `snmp.community` | string | `"public"` | Read community. A request with the wrong community is dropped silently |
| `snmp.write_community` | string | `""` | Community for SET on the channel command object. **Empty refuses every SET** |
| `snmp.trap_receiver` | string | `""` | `host:port` of a trap receiver. Empty = no traps. Port 162 if omitted |
| `snmp.trap_community` | string | `"public"` | Community sent with traps |

---

## store

The configuration history.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `store.history_keep` | integer | `50` | History entries kept under `config-history/`, 1–10000. The oldest are removed beyond this |

The history is written best-effort: a save never fails because the history
directory could not be written.

---

## clips

Dump clips — what a Dump leaves behind.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `clips.enabled` | bool | `true` | Write a clip for every dump |
| `clips.dir` **(local)** | string | `""` | Where clips are written. Empty = `clips` beside the configuration |
| `clips.max_files` | integer | `200` | Retention cap on file count. `0` disables this cap |
| `clips.max_total_mb` | integer | `2048` | Retention cap on total size. `0` disables |
| `clips.keep_days` | integer | `30` | Retention cap on age. `0` disables |
| `clips.max_seconds` | float | `120.0` | A single clip is capped here. A dump-all of a deep buffer keeps the **last** `max_seconds` and the record says `truncated` |
| `clips.codec` | string | `"h264"` | `h264` or `h265` |
| `clips.encoder` **(local)** | string | `"software"` | `software`, `auto` or `nvenc`. Software by default so a clip never competes with the live encoder for the GPU |
| `clips.profile` | string | `"baseline"` | Baseline by default so this program's own decoder reads the clip back — a dump clip can be used as a fill with nothing in between |
| `clips.bitrate_kbps` | integer | `6000` | Clip video bit rate |
| `clips.gop_seconds` | float | `1.0` | Clip IDR interval |
| `clips.audio_bitrate_kbps` | integer | `128` | Clip AAC bit rate |
| `clips.alert_email` | bool | `true` | Email the dump alert. Still needs `email.enabled` and recipients |
| `clips.alert_webhook` | bool | `true` | POST the dump event. Still needs `webhooks.enabled` and URLs |
| `clips.public_base_url` **(local)** | string | `""` | Base URL of this console, e.g. `https://airlock.example.com:8090`. When set, the alert carries a sign-in-protected link to the clip |

Retention is applied after every write, and the `.json` record and the `.ts` file
are removed together — the directory *is* the index.

---

## redundancy

Primary and backup. **The whole section is machine-local**, so a primary can
never tell a backup that it is a primary.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `redundancy.role` **(local)** | string | `"standalone"` | `standalone`, `primary` or `backup`. Licensed: see [Setting up a pair](../redundancy/setup.md#step-1-licence-both-roles) |
| `redundancy.primary_url` **(local)** | string | `""` | Backup only: the primary's web base URL, e.g. `http://10.0.0.5:8090` |
| `redundancy.token` **(local)** | string | `""` | The shared secret, required on both. As sensitive as the password file — the mirrored configuration carries the user records |
| `redundancy.poll_s` **(local)** | float | `5.0` | Backup only: how long one long poll waits before it comes back empty, and how long to wait before re-dialling after an error. Clamped to 0.5–300 |
| `redundancy.takeover_after_s` **(local)** | float | `30.0` | Backup only: the primary must be unreachable this long before the backup takes over by itself. `0` disables automatic takeover |
| `redundancy.grace_days` **(local)** | float | `14.0` | The local-control window: how long a backup holding the plant may run before the controls re-lock *except* the exits. `0` = never re-lock |
| `redundancy.suppress_external_outputs` **(local)** | bool | `true` | While locked, hold the encoders and keep alarm email, webhooks, traps, clip alerts and telemetry with the primary |
| `redundancy.ndi_name_suffix` **(local)** | string | `" (Backup)"` | Appended to this box's NDI output names while it is a locked backup. Dropped at takeover |
| `redundancy.instance_name` **(local)** | string | `""` | The label shown in the primary's Backups table. Empty uses the hostname |

---

## watchdog

Restarts a running block whose input is alive but whose output has stopped.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `watchdog.enabled` | bool | `false` | Off by default: it *acts*, and a plant should opt in |
| `watchdog.check_s` | float | `1.0` | Seconds between checks |
| `watchdog.stall_s` | float | `10.0` | Output stopped for this long, with the input still arriving, counts as stalled |
| `watchdog.backoff_s` | float | `5.0` | Wait before the first restart of a block, doubled for each consecutive restart of that block, capped at 60 s |
| `watchdog.max_restarts_per_hour` | integer | `6` | Restarts of one block in a rolling hour. At the cap the watchdog stops restarting it and says so. `0` makes the watchdog alarm-only |

A source that has gone away is not a stall, and a stopped block is never started.

---

## gpio

Axia Livewire contact closures.

!!! warning "Three things to get right"
    **Controls ride GPO, lamps ride GPI** — a console button reaches Airlock as a
    GPO pin change, and the tallies Airlock writes go to GPIs. **Pins are
    0-based** — `pin: 1` is the second of the five. **Edge words are uppercase**
    on the wire.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gpio.enabled` **(local)** | bool | `false` | Connect to the node(s) |
| `gpio.host` **(local)** | string | `""` | Single-node address. LWRP listens on port 93 |
| `gpio.port` **(local)** | integer | `93` | Single-node port |
| `gpio.password` **(local)** | string | `""` | `LOGIN` password. Empty sends a bare `LOGIN`, which is still required before a node accepts pin writes |
| `gpio.device` **(local)** | string | `"lwrp"` | A short name for this node in the log, the audit principal and the lamps page |
| `gpio.nodes` **(local)** | array | `[]` | Several Axia nodes, each its own LWRP connection. When empty the single `host`/`port`/`password`/`device` above is used |
| `gpio.poll_s` | float | `1.0` | Lamp convergence tick: how often held lamps are re-evaluated and any drift re-asserted. Also the pulse resolution |
| `gpio.debounce_ms` | integer | `50` | Per-channel debounce for control pins. Dump and Dump all are exempt — the escape hatch must never lose a race with a bouncing contact — and so are level-following rows |
| `gpio.hysteresis_pct` | float | `2.0` | Depth-threshold lamps stay lit until the depth falls this far below the threshold, as a percent of target, so a lamp does not chatter on the boundary |
| `gpio.dump_lamp_s` | float | `2.0` | How long a `dumping` lamp stays lit after a dump |
| `gpio.keepalive_s` | float | `30.0` | Liveness probe interval. LWRP has no keepalive of its own; an unanswered interval drops the socket |
| `gpio.inputs` | array | `[]` | Control rows |
| `gpio.outputs` | array | `[]` | Lamp rows |
| `gpio.relays` | array | `[]` | Relay rows |

### gpio.nodes[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gpio.nodes[].enabled` | bool | `true` | |
| `gpio.nodes[].device` | string | `""` | Short name. Rows bind to a node by this label, and the audit principal is prefixed with it |
| `gpio.nodes[].host` | string | `""` | Node address |
| `gpio.nodes[].port` | integer | `93` | LWRP port |
| `gpio.nodes[].password` | string | `""` | `LOGIN` password |

### gpio.inputs[]

A GPO pin that commands a delay.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gpio.inputs[].enabled` | bool | `true` | |
| `gpio.inputs[].node` | string | `""` | Which node, by its `device`. Empty = the first node |
| `gpio.inputs[].port` | integer | `1` | GPIO port on the node, 1-based as the node numbers them |
| `gpio.inputs[].pin` | integer | `0` | Pin within the port, **0-based** |
| `gpio.inputs[].edge` | string | `"LOW"` | `LOW` fires on the press (Axia GPIO is active-low), `HIGH` on the release, `BOTH` follows the level — for a paired action, low sends the on half and high the off half |
| `gpio.inputs[].kind` | string | `"any"` | Restrict the row to a channel kind, or `any` |
| `gpio.inputs[].action` | string | `"dump"` | `build`, `dump`, `dumpall`, `rollout`, `cough`, `enable`, `disable`, `lock`, `unlock` |
| `gpio.inputs[].channel` | integer | `1` | The delay channel this pin drives. Must name a configured channel |
| `gpio.inputs[].stage` | string | `""` | Drive this audio sources-graph stage instead of a channel: `build`, `dump`, `dumpall`, `rollout`, `cough`, `censor`, `bypass` |
| `gpio.inputs[].targets` | array | `[]` | Fan-out: one pin drives many blocks. Entries are `delay:N`, `stage:id`, `encoder:N`, `decoder:N`, `aenc:name` or `adec:name`. Overrides `channel` and `stage` |
| `gpio.inputs[].seconds` | float | `0.0` | Seconds for a `dump` row. `0` uses `delay.dump_seconds` |
| `gpio.inputs[].holder` | string | `""` | The leader name a `lock` row claims the delay for. Empty uses the pin |
| `gpio.inputs[].cue` | string | `""` | For a cue row: `out`, `in`, `out_now`, `in_now`, `cancel` or `time_signal`. Empty means `out_now`; the break length is `seconds` |

### gpio.outputs[]

A GPI pin that carries a delay's state out.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gpio.outputs[].enabled` | bool | `true` | |
| `gpio.outputs[].node` | string | `""` | Which node, by its `device` |
| `gpio.outputs[].port` | integer | `1` | 1-based |
| `gpio.outputs[].pin` | integer | `0` | **0-based** |
| `gpio.outputs[].kind` | string | `"any"` | Restrict the row to a channel kind |
| `gpio.outputs[].lamp` | string | `"inDelay"` | The status source |
| `gpio.outputs[].channel` | integer | `1` | The channel the lamp follows |
| `gpio.outputs[].stage` | string | `""` | Follow this stage's tally instead of a channel |
| `gpio.outputs[].sources` | array | `[]` | Aggregate: one lamp reflects many blocks. Same entry forms as `inputs[].targets` |
| `gpio.outputs[].aggregate` | string | `"any"` | `any` (lit if any source is lit) or `all` |
| `gpio.outputs[].mode` | string | `"held"` | `held` holds the pin while the source is true; `pulse` fires once as it becomes true and never replays on reconnect |
| `gpio.outputs[].pulse_ms` | integer | `100` | Pulse width |
| `gpio.outputs[].active_level` | string | `"low"` | Axia GPIO logic is active-low, so a lamp asserts low |
| `gpio.outputs[].resting_level` | string | `"high"` | …and rests high |
| `gpio.outputs[].threshold_s` | float | `0.0` | For a depth-reached lamp: the depth that lights it. `0` uses the configured delay depth |

!!! note "One enabled row per lamp pin"
    Enforced at save — two writers on one output flap the hardware. Control pins
    stack freely.

### gpio.relays[]

A contact seen on a control pin, re-driven on a status pin after an audio delay's
current depth, so a closure made live reaches the output on air in sync.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gpio.relays[].enabled` | bool | `true` | |
| `gpio.relays[].name` | string | `""` | A short name, in the log and the audit principal |
| `gpio.relays[].node` | string | `""` | The node both pins live on. Same-node only |
| `gpio.relays[].in_port` | integer | `1` | The control (GPO) port, 1-based |
| `gpio.relays[].in_pin` | integer | `0` | **0-based** pin within the input port |
| `gpio.relays[].out_port` | integer | `1` | The status (GPI) port, 1-based |
| `gpio.relays[].out_pin` | integer | `1` | **0-based** pin within the output port |
| `gpio.relays[].kind` | string | `"static"` | `static` follows the input level through the delay; `pulse` emits one momentary assertion when the input is pressed, and does not relay the release |
| `gpio.relays[].pulse_ms` | integer | `300` | Pulse width for `kind: pulse` |
| `gpio.relays[].delay` | string | `""` | The audio delay, by `name`, whose live depth this relay rides |

---

## data

TCP and UDP data in, through the delay, out again.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `data.enabled` | bool | `false` | Run the data hub |
| `data.receivers` | array | `[]` | Where data arrives |
| `data.senders` | array | `[]` | Where data goes |
| `data.routes` | array | `[]` | Receiver → delay → senders |

The hub is built from the document at start and reconciled by a restart.

### data.receivers[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `data.receivers[].name` | string | `""` | What routes refer to. Must be unique |
| `data.receivers[].kind` | string | `"tcp_server"` | `tcp_server` (others connect here), `tcp_client` (Airlock dials out) or `udp_server` |
| `data.receivers[].host` | string | `""` | `tcp_client` only: the host to dial |
| `data.receivers[].port` | integer | `0` | Port |
| `data.receivers[].bind` | string | `""` | Local address for the server kinds. Empty = every adapter. A bind failure is an error state, never a silent fall back to the wildcard |
| `data.receivers[].framing` | string | `"raw"` | `raw` (one read or one datagram is one message) or `lines` (split on LF, a trailing CR trimmed). UDP always behaves as `raw` |
| `data.receivers[].on_connect` | string | `""` | `tcp_client`: sent once when the session opens. `\n \r \t \0 \\` escapes |
| `data.receivers[].keep_alive` | string | `""` | `tcp_client`: sent every `keep_alive_s` while the session lives |
| `data.receivers[].keep_alive_s` | integer | `60` | Keep-alive interval |
| `data.receivers[].enabled` | bool | `true` | |

### data.senders[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `data.senders[].name` | string | `""` | What routes refer to |
| `data.senders[].kind` | string | `"tcp_client"` | `tcp_client`, `tcp_server`, `udp`, or `receiver` (write back out through a receiver's own connections) |
| `data.senders[].host` | string | `""` | Peer host |
| `data.senders[].port` | integer | `0` | Port |
| `data.senders[].bind` | string | `""` | Local address |
| `data.senders[].receiver` | string | `""` | For `kind: receiver`: the receiver to write back through. A `udp_server` receiver cannot — there is no peer to reply to |
| `data.senders[].init` | string | `""` | Sent once on a new connection. Same escapes |
| `data.senders[].append_newline` | bool | `true` | Append a newline to every message that has none |
| `data.senders[].enabled` | bool | `true` | |

### data.routes[]

| Key | Type | Default | Meaning |
|---|---|---|---|
| `data.routes[].name` | string | `""` | |
| `data.routes[].receiver` | string | `""` | The receiver this route reads |
| `data.routes[].channel` | integer | `1` | Which delay channel this route rides. One receiver may feed several routes on several channels |
| `data.routes[].delayed` | bool | `true` | Ride the delay. `false` relays immediately |
| `data.routes[].sends` | array | `[]` | Sender names. A route with nowhere to send is refused at save |
| `data.routes[].enabled` | bool | `true` | |

---

## scripting

Operator automation in Lua or JavaScript. The scripts themselves live in their
own store beside the configuration, with a version history and a rollback.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `scripting.enabled` | bool | `false` | Run the dispatcher at all |
| `scripting.entry` | string | `"main"` | The entry function a script is called at when it does not name its own |
| `scripting.timeout_ms` | integer | `1000` | Per-invocation budget, enforced **inside** the interpreter — an endless loop is cut, not waited out |
| `scripting.queue_size` | integer | `64` | Pending invocations the dispatcher holds before it starts dropping them. Drops are counted and logged; a trigger source is never blocked |
| `scripting.history_keep` | integer | `50` | Versions kept per script in the store's history |
| `scripting.scripts` | array | `[]` | **Legacy.** A one-way import inbox for scripts written inline before the store existed. Imported once at start and then cleared from the file |

A legacy inbox entry carries `name`, `language` (`lua` or `javascript`),
`enabled`, `entry`, `trigger`, `channel`, `event`, `interval_s`, `cron` and
`source`.

---

## licence

Where the product licence is kept and read from. Every key is machine-local — a
licence is bound to the machine it was activated on.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `licence.store_dir` **(local)** | string | `""` | Where the licence store lives, off Windows. Empty = `licence` beside the configuration. On Windows the licence lives in the registry and this is unused |
| `licence.file` **(local)** | string | `""` | An explicit licence file, tried *before* the store and verified in place, never copied in. A `licence.lic` beside the executable is picked up without naming it |
| `licence.container_serial` **(local)** | string | `""` | Container mode: the serial a short-lived, hardware-unbound licence is fetched against. Empty = off. `NDI2SRT_LICENCE_CONTAINER_SERIAL` sets it without a configuration file |
| `licence.container_base_url` **(local)** | string | `"https://ccsystems.io"` | Where the container endpoint lives |
| `licence.container_renew_hours` **(local)** | integer | `12` | How often the unbound licence is renewed. The licence itself is stamped 24 h, so the default renews twice inside its own life |

!!! warning "Keep the store outside a versioned directory"
    Off Windows the default store is beside the configuration, so moving the
    configuration moves the store. Either copy `licence/` and
    `licence-state.json` across on an upgrade, or set `licence.store_dir` to a
    path that does not change.

---

## telemetry

Where this instance reports its health. Off by default and silent when off.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `telemetry.enabled` | bool | `false` | Send samples |
| `telemetry.url` | string | `""` | The collector, e.g. `https://telemetry.example.com`. The agent posts to `<url>/v1/ingest` |
| `telemetry.api_key` | string | `""` | Issued by the collector, sent as a bearer token. Treated as a credential: masked in the console, never in the audit detail |
| `telemetry.interval_s` | float | `60.0` | Seconds between samples. A sample is about 20 kB |
| `telemetry.site` **(local)** | string | `""` | What this instance is called in the collector. Empty = the machine name. **Machine-local on purpose** — two instances reporting as one site would interleave their numbers into nonsense |
| `telemetry.include_alarms` | bool | `true` | Send the active alarms with each sample |

---

## tools

| Key | Type | Default | Meaning |
|---|---|---|---|
| `tools.ffmpeg` **(local)** | string | `""` | Path to an ffmpeg the operator installed. Empty looks beside the executable and on the PATH. Used by **Video › Fills & schedules** for Upload, Check and **Make it fit**; without one that page shows the recipe instead |

ffmpeg is never shipped with Airlock.

---

## audio_inputs

This box's audio capture devices, as named inputs. **Machine-local** — but the
*names* are what everything else refers to, and those mirror. A backup needs the
same names bound to its own devices.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_inputs[].name` **(local)** | string | `""` | What consumers name: "Desk", "Axia return", "Studio mic" |
| `audio_inputs[].device` **(local)** | string | `""` | `hw:1,0` or `default` on Linux, the device's name on macOS and Windows, `asio:<driver name>` for ASIO, empty for the box's default input |
| `audio_inputs[].channels` **(local)** | integer | `0` | Channels the input carries. `0` = all the device has |
| `audio_inputs[].channel_map` **(local)** | integer[] | `[]` | Which device channel (from 0) each of the input's channels is; empty = the first `channels`. Several inputs can name one device and each take their own channels — it is opened once. Max 16 entries, each < 64 |

Each device is opened once and shared by everything that names it. On macOS the
process needs Microphone permission; on Windows only one ASIO driver can be open
per process.

---

## audio_outputs

This box's audio playback devices, as named outputs. Same shape and same rules as
`audio_inputs`, and also **machine-local**.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_outputs[].name` **(local)** | string | `""` | What consumers name |
| `audio_outputs[].device` **(local)** | string | `""` | The device on this box |
| `audio_outputs[].channels` **(local)** | integer | `0` | Channels to open. `0` = all the device has |

ASIO output is not built yet; playback is ALSA, CoreAudio or WASAPI.

---

## audio_stages

The sources graph. A stage takes one source in and produces a new source out,
keyed by `id`. Define it once; any number of encoders can pick its output and it
runs once.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_stages[].id` | string | `""` | The stage's key — what a consumer names |
| `audio_stages[].name` | string | `""` | What the console calls it |
| `audio_stages[].source` | string | `""` | An input name, or another stage id |
| `audio_stages[].kind` | string | `"stereotool"` | `stereotool` or `passthrough` |
| `audio_stages[].enabled` | bool | `true` | Disabled behaves as passthrough, so the source stays available and encoders never drop |
| `audio_stages[].stereotool` | object | *(off)* | See [Stereo Tool](#stereo-tool) |

---

## audio_delays

Broadcast (profanity) audio delays — their own blocks, separate from the video
delay. Source → delay → output, and the delayed output is itself a pickable
source.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_delays[].name` | string | `""` | The delay's identity everywhere |
| `audio_delays[].enabled` | bool | `true` | |
| `audio_delays[].source` | string | `""` | An input name or a stage id to delay |
| `audio_delays[].output` | string | `""` | The audio output to play the delayed programme to. Empty publishes it as a source only |
| `audio_delays[].max_delay_s` | float | `10.0` | Target and maximum depth |
| `audio_delays[].dump_size_s` | float | `7.0` | Seconds one dump removes. `0` dumps everything to live |
| `audio_delays[].build_rate_pct` | float | `4.0` | How fast the delay grows, as a percent of real time (1–10). Time-stretched with pitch kept |
| `audio_delays[].exit_rate_pct` | float | `4.0` | How fast it drains on exit (1–10) |
| `audio_delays[].start_mode` | string | `"build"` | `bypass`, `build` or `full` — the state on start |
| `audio_delays[].crossfade_ms` | float | `20.0` | Crossfade at a dump or jump join (10–30) |
| `audio_delays[].exit_mode` | string | `"compress"` | `compress` (drain by speeding up), `rollout` (crossfade to live) or `playout` (the tail airs at normal speed, live joins for `rollout_overlap_ms`) |
| `audio_delays[].rollout_overlap_ms` | float | `250.0` | Equal-power crossfade window for a rollout exit |
| `audio_delays[].rollout_return_output` | string | `""` | With `exit_mode: "playout"`: a named output carrying the tail alone (no live, no censor) while it plays out, silent otherwise |
| `audio_delays[].build_after_dump` | string | `"both"` | Rebuild after a dump: `both` (any dump), `dump`, `dumpall` or `disabled` (stay at what is left). A document carrying the old `auto_rebuild: false` loads as `disabled` |
| `audio_delays[].build_mode` | string | `"expand"` | `expand` stretches the live programme slower; `insert` airs a fill asset while the ring fills, then crossfades to live |
| `audio_delays[].fill_strategy` | string | `"squeeze"` | For an insert build: `squeeze` (play the asset stretched to span the build), `silent`, or `input` (air `fill_input` live) |
| `audio_delays[].fill_input` | string | `""` | With `fill_strategy: "input"`: the audio input or processed stage aired during an insert build — not the delay's own source |
| `audio_delays[].fill_asset` | string | `""` | The fill asset aired during an insert build. Any file ffmpeg can decode |
| `audio_delays[].dump_strategy` | string | `"dump"` | `dump` (discard) or `censor` (dump-fill) |
| `audio_delays[].censor_seconds` | float | `7.0` | Default one-shot censor length |
| `audio_delays[].censor_tone_hz` | float | `1000.0` | Cover-tone frequency |
| `audio_delays[].censor_level_dbfs` | float | `-12.0` | Cover-tone level |
| `audio_delays[].pre_censor_offset_ms` | float | `700.0` | A censor pressed while monitoring live is armed to land `delay − this` later, so the tone covers the word as it emerges |
| `audio_delays[].censor_underfill_ms` | float | `100.0` | Start the covered window this much earlier |
| `audio_delays[].censor_overfill_ms` | float | `100.0` | End it this much later |
| `audio_delays[].censor_strategy` | string | `"tone"` | What a censor airs over the covered span: `tone`, `silence` or `file` |
| `audio_delays[].censor_asset` | string | `""` | The asset aired when `censor_strategy` is `file` |
| `audio_delays[].fill_schedule` | array | `[]` | Dayparted fill assets. A matching row overrides `fill_asset` |
| `audio_delays[].censor_schedule` | array | `[]` | Dayparted censor assets. A matching row overrides `censor_asset` |
| `audio_delays[].post_censor_offset_ms` | float | `0.0` | Extra delay to air beyond the confidence read. When above 0 the post-censor monitor runs this far **ahead** of air |
| `audio_delays[].post_output` | string | `""` | The confidence-monitor output: the pre-censored programme, `post_censor_offset_ms` ahead of air. Empty = none |
| `audio_delays[].channels` | integer | `2` | `1` or `2` |
| `audio_delays[].licence_assigned` | bool | `true` | Compete for an `ADELAY` seat |

A daypart row in either schedule:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…schedule[].days` | string | `""` | Comma list of `mon,tue,wed,thu,fri,sat,sun`. Empty = every day |
| `…schedule[].start` | string | `""` | Local `HH:MM` |
| `…schedule[].end` | string | `""` | Local `HH:MM`. Equal to `start`, or both empty, means all day |
| `…schedule[].asset` | string | `""` | The asset this row airs. Required |

---

## audio_encoders

Standalone audio encoders — not tied to a channel's delay or decoder.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_encoders[].name` | string | `""` | The encoder's identity everywhere |
| `audio_encoders[].enabled` | bool | `false` | |
| `audio_encoders[].source_kind` | string | `"input"` | `input` (a named audio input or a stage) or `ndi` (an NDI source's audio) |
| `audio_encoders[].source` | string | `""` | The chosen source: an input name or a stage id. Empty falls back to `input` |
| `audio_encoders[].input` | string | `""` | The named audio input |
| `audio_encoders[].ndi_source` | string | `""` | The NDI source, for `source_kind: ndi` |
| `audio_encoders[].channels` | integer | `2` | Channels to encode |
| `audio_encoders[].codec` | string | `"opus"` | `aac`, `aac-he-v1`, `aac-he-v2`, `opus`, `mp3`, `flac`, `aptx` or `aptx-hd` |
| `audio_encoders[].bitrate_kbps` | integer | `128` | |
| `audio_encoders[].transport` | string | `"srt"` | `srt`, `rtp`, `sip`, `rtmp`, `icecast` or `hls` |
| `audio_encoders[].srt` | object | *(see SRT)* | Where the coded stream is sent, for `transport: srt` |
| `audio_encoders[].rtp` | object | | RTP destination, for `transport: rtp`. See [RTP and SIP calls](../audio/rtp-sip.md#reference) |
| `audio_encoders[].sip` | object | | SIP agent, for `transport: sip`. See [RTP and SIP calls](../audio/rtp-sip.md#reference) |
| `audio_encoders[].rtmp` | object | | RTMP publish target. See below |
| `audio_encoders[].icecast` | object | | Icecast source target. See below |
| `audio_encoders[].hls` | object | | HLS publish target. See below |
| `audio_encoders[].stereotool` | object | *(off)* | A Stereo Tool stage between the source and the encoder |
| `audio_encoders[].delay_ms` | integer | `0` | Alignment delay in ms (0–10000) applied after the Stereo Tool stage, so a late now-playing event can be lined up |
| `audio_encoders[].licence_assigned` | bool | `false` | Compete for an `AENCODE` seat |

!!! warning "An audio encoder's SRT link is not MPEG-TS"
    The SRT link between an audio encoder and an audio decoder carries Airlock's
    own framing. A third-party SRT receiver will accept the connection and make
    nothing of the payload, and an Airlock audio decoder cannot take an MPEG-TS
    source. For someone else's equipment use `rtp` or `sip`; for distribution
    use Icecast, RTMP or HLS; for a transport-stream SRT feed use a video
    channel's encoder.

### audio_encoders[].rtmp

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…rtmp.host` | string | `""` | RTMP server |
| `…rtmp.port` | integer | `1935` | |
| `…rtmp.app` | string | `"live"` | The RTMP application |
| `…rtmp.stream_key` | string | `""` | The stream key or name |
| `…rtmp.username` | string | `""` | |
| `…rtmp.password` | string | `""` | |
| `…rtmp.metadata` | object | `{}` | `onMetaData` key/values written to the stream, e.g. title and artist. The codec fields are added automatically |

### audio_encoders[].icecast

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…icecast.host` | string | `""` | Icecast server |
| `…icecast.port` | integer | `8000` | |
| `…icecast.mount` | string | `"/stream"` | Mount point |
| `…icecast.username` | string | `"source"` | |
| `…icecast.password` | string | `""` | |
| `…icecast.format` | string | `"opus"` | `opus` (Ogg), `mp3` or `aac` (ADTS). Derived from the encoder's codec at start |
| `…icecast.public` | bool | `false` | List the mount in the directory |
| `…icecast.metadata` | object | `{}` | `name`, `description`, `genre` and `title`/`song` — in-band for Ogg, through the admin endpoint for MP3 and AAC |

### audio_encoders[].hls

Packed-audio HLS: ADTS-AAC segments plus a sliding playlist, playable natively by
Apple devices and hls.js. The playlist is also served from this box's web
listener at `/hls/<encoder-name>/index.m3u8`, whatever the target.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…hls.segment_seconds` | integer | `6` | Seconds of audio per segment |
| `…hls.window` | integer | `6` | Segments kept in the sliding window and on the target |
| `…hls.kind` | string | `"disk"` | `disk`, `ftp`, `sftp` or `s3` |
| `…hls.dir` | string | `""` | `disk`: the output directory. Empty uses a temp directory namespaced by the encoder's name |
| `…hls.host` | string | `""` | `ftp` / `sftp` host |
| `…hls.port` | integer | `21` | `ftp` / `sftp` port |
| `…hls.username` | string | `""` | |
| `…hls.password` | string | `""` | |
| `…hls.path` | string | `""` | Remote directory |
| `…hls.bucket` | string | `""` | `s3` bucket |
| `…hls.region` | string | `""` | `s3` region |
| `…hls.endpoint` | string | `""` | An S3-compatible endpoint. Empty = real AWS |
| `…hls.prefix` | string | `""` | Key prefix |
| `…hls.access_key` | string | `""` | |
| `…hls.secret_key` | string | `""` | |
| `…hls.timezone_offset_minutes` | integer | `0` | Publish the same encode again, delayed by this many minutes, for other time zones. The delayed copy is served under a `-tzNN` suffix. `0` = none |
| `…hls.renditions` | array | `[]` | The ladder. Empty = a single rendition from the encoder's own codec and bit rate |

Each rendition:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `…hls.renditions[].id` | string | `"a"` | Names its playlist and segments |
| `…hls.renditions[].codec` | string | `"aac-lc"` | `aac-lc`, `aac-he-v1` or `aac-he-v2` |
| `…hls.renditions[].bitrate_kbps` | integer | `128` | |

---

## audio_decoders

Standalone audio decoders: receive a coded audio stream and put it out as NDI
audio and/or to a named audio output.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `audio_decoders[].name` | string | `""` | The decoder's identity everywhere |
| `audio_decoders[].enabled` | bool | `false` | |
| `audio_decoders[].transport` | string | `"srt"` | `srt`, `rtp` or `sip` |
| `audio_decoders[].srt` | object | *(see SRT)* | Where the coded stream is received, for `transport: srt` |
| `audio_decoders[].rtp` | object | | Where to listen, for `transport: rtp`. See [RTP and SIP calls](../audio/rtp-sip.md#reference) |
| `audio_decoders[].sip` | object | | SIP agent, for `transport: sip`. See [RTP and SIP calls](../audio/rtp-sip.md#reference) |
| `audio_decoders[].codec` | string | `"opus"` | RTP only: `opus` or `aac` (AAC-LC). SRT reads it from the stream, a call agrees it |
| `audio_decoders[].channels` | integer | `2` | RTP and SIP only: channels the stream carries |
| `audio_decoders[].ndi_name` | string | `""` | NDI audio send name. Empty = no NDI out |
| `audio_decoders[].output` | string | `""` | The named audio output to play to. Empty = no device out |
| `audio_decoders[].licence_assigned` | bool | `false` | Compete for an `ADECODE` seat |

---

## Shared objects

### Audio processing

Used by `channels[].audio.processing` (the encoder's rail) and
`channels[].delay.audio_processing` (what the delay emits). Everything is off and
unity by default — until `enabled` is set, the audio path is not touched at all.
The chain is input trim → parametric EQ → stereo-linked compressor.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `….enabled` | bool | `false` | Master switch for the whole chain |
| `….gain_db` | float | `0.0` | Input trim, ahead of the EQ and the compressor. Range −24 to +24 |
| `….eq_enabled` | bool | `false` | Run the EQ |
| `….bands` | array | four flat bands | Up to six parametric bands |
| `….compressor.enabled` | bool | `false` | |
| `….compressor.threshold_db` | float | `-18.0` | |
| `….compressor.ratio` | float | `3.0` | *n*:1. `1` is no compression |
| `….compressor.attack_ms` | float | `10.0` | |
| `….compressor.release_ms` | float | `200.0` | |
| `….compressor.makeup_db` | float | `0.0` | |

Each EQ band:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `….bands[].enabled` | bool | `false` | |
| `….bands[].kind` | string | `"peaking"` | `low_shelf`, `peaking` or `high_shelf` |
| `….bands[].hz` | float | `1000.0` | 20–20000 |
| `….bands[].gain_db` | float | `0.0` | −18 to +18 |
| `….bands[].q` | float | `0.9` | |

The default band set is a console strip: a low shelf at 100 Hz, peaking bands at
400 Hz and 2.5 kHz, and a high shelf at 8 kHz — all flat and all off.

Changes are saved **and** pushed to the running block, so a parameter ride is on
air at once.

### Stereo Tool

Used by `audio_stages[].stereotool` and `audio_encoders[].stereotool`. The native
Stereo Tool library is loaded at run time and licensed separately. Bypassed or
unlicensed, the stage passes audio through.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `….stereotool.enabled` | bool | `false` | Run the processor |
| `….stereotool.bypass` | bool | `false` | Pass audio through without processing |
| `….stereotool.licence` | string | `""` | The Stereo Tool licence, applied to the engine at create |
| `….stereotool.preset` | string | `""` | Path to a `.sts` preset |
| `….stereotool.web_enable` | bool | `false` | Expose Stereo Tool's own browser tuning GUI |
| `….stereotool.web_port` | integer | `0` | `0` picks a free port, reported back in the status |
| `….stereotool.web_whitelist` | string | `"127.0.0.1/32"` | Who may reach that GUI |

!!! danger "The Stereo Tool GUI is an unauthenticated on-air control surface"
    It is off by default, restricted by the whitelist, and withdrawn entirely
    while an instance is a locked standby.

### SRT endpoints

`channels[].srt`, `channels[].decoder.srt`, `audio_encoders[].srt` and
`audio_decoders[].srt` all take the same keys.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `….mode` | string | `"caller"` | `caller` or `listener` |
| `….host` | string | `"127.0.0.1"` | Peer host, in caller mode |
| `….port` | integer | `9001` | Port |
| `….latency_ms` | integer | `200` | The retransmission budget |
| `….passphrase` | string | `""` | Empty = no encryption |
| `….key_len` | integer | `16` | `16`, `24` or `32` |
| `….stream_id` | string | `""` | The SRT stream id |

---

## What is validated at save

A configuration that would not run is refused, with the reason:

- `channels` must not be empty, ids must be unique and 1-based, and there may be
  at most 32.
- A channel name is 1–24 characters of letters, digits, space and `- _ .`.
- NDI output names (`delay.ndi_name`, `decoder.ndi_name`) must be unique across
  the process.
- SRT **listener** ports must be unique across channels. Caller ports need not
  be.
- PIDs must be 32–8186.
- A GPIO row or a data route must name a configured channel.
- A data route must have at least one sender.
- Only one enabled GPIO lamp row per output pin.
- With `process.max_memory_mb` set, the channels' buffer caps must add up within
  it.
- A move into a redundancy role the licence does not permit is refused.

!!! note "A restore or a reset keeps this machine's own settings"
    Both take a `keep_local` option, on by default, which keeps exactly the keys
    marked **(local)** on this page.
