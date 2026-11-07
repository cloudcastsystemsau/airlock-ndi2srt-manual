# Overview

This page explains what Airlock is made of: the blocks that do the work, the
channel that groups them, where the software runs, and what the console is. Read
it once before you configure anything — every other chapter assumes these words.

## What Airlock is

Airlock is a single program. You install one binary, it reads one JSON
configuration file, and it runs everything that file describes: delays,
encoders, decoders, audio processing, data sockets, GPIO, alarms, scripting and
a web console.

It is built for plants that already speak NDI. Pictures and sound come in on
NDI, are held or coded or processed, and go back out on NDI, over SRT, or to the
box's own audio hardware. Nothing needs a capture card, and nothing needs a
third-party media framework installed — the NDI runtime is the one external
library Airlock loads.

!!! note "Two names, one product"
    The console brands itself **Airlock · NDI2SRT**, and the binary, the service
    and the configuration file are all called `ndi2srt`. They are the same
    thing; this manual says "Airlock" for the product and `ndi2srt` where you
    would type it.

## The blocks

A **block** is one running thing with its own state, its own statistics card and
its own licence seat. These are the blocks.

### Video delay

NDI in, a FIFO of raw frames, NDI out. The buffer holds `depth_s` seconds of
uncompressed pictures, each slot carrying the audio captured with it, and the
output runs on a deadline pacer at the source's nominal rate — so a shortfall
repeats a frame and a surplus drops one, and the depth holds to within a frame.

Its controls are the broadcast set: **Build** (fill the buffer while a fill
airs), **Dump** *n* seconds (remove what was just said), **Dump all**,
**Rollout** (jump cut to live) and **Set depth**. On top of those sit **Cough**,
**Censor** and **Slate**, which bleep or mask the output without dumping
anything.

A delay can take its pictures from an NDI source, from a `test:` signal, or from
this channel's own decoder. Its output is published as NDI, and this channel's
encoder can tap it directly.

A delay can also be set **audio only** (`delay.audio_only`): no video at all, an
audio input or an NDI source's audio delayed and played to a named audio output.

See [Video › Delay](../video/delay.md).

### Video encoder

NDI in, H.264 (OpenH264 or NVENC) or HEVC (NVENC or x265) plus AAC-LC, muxed
into an MPEG-2 transport stream by Airlock's own multiplexer and byte-clock
pacer, out over SRT as caller or listener, optionally AES-128/192/256 encrypted.

Its source is whatever you point it at: an NDI name on the network, or the word
`delay`, which takes this channel's delayed output without an NDI hop.

Because the mux and the pacer are Airlock's own, the things a hardware decoder
judges — PCR placement and accuracy, PSI repetition, a complete first PMT, CBR
null padding, an SDT with a service name — are set by Airlock rather than left
to a library default.

See [Video › Encoders](../video/encoders.md).

### Video decoder

SRT in, transport stream demultiplexed, H.264/HEVC and AAC decoded, out as NDI.
Caller or listener, encrypted or not, with the same SRT options as the encoder.
Output is paced from the stream's own timestamps: the first picture anchors a
timeline `output_delay_ms` ahead of now, and every later picture and audio block
is released when it falls due.

Point a channel's delay at `decoder` and an SRT contribution feed is delayed and
republished as NDI with no NDI hop in between.

See [Video › Decoders](../video/decoders.md).

### Audio inputs and outputs

The box's own audio hardware, as **named objects**. You define an input once —
a name, a device, a channel count — and everything that wants that audio names
it. The device is opened once and the audio is fanned out, because ALSA `hw`
devices are exclusive, ASIO drivers are single-client, and two capture clocks on
one device are two sources of drift.

| Platform | Backend |
|---|---|
| Linux | ALSA (`libasound` loaded at run time; `hw:C,D` devices plus `default`) |
| macOS | CoreAudio |
| Windows | WASAPI, and ASIO drivers as `asio:<driver name>` |

Outputs mirror inputs: a name, a device, a channel count. An audio-only delay
plays to the output you name.

See [Audio › Inputs and outputs](../audio/io.md).

### Audio sources and Stereo Tool

A **source** is anything an audio consumer can pick: a named input, or a
**stage** built on one. A stage takes one source in and produces a new,
processed source out — a Thimeo **Stereo Tool** instance, loaded at run time and
licensed separately from Airlock.

The point of a stage is that it runs **once**. Define "Online processed" on your
desk input and every encoder that picks it shares the one processor, rather than
each running its own. A stage that is disabled or bypassed passes audio through,
so a consumer never drops.

See [Audio › Sources and Stereo Tool](../audio/sources.md).

### Audio delay

A broadcast profanity delay as its own block, not a mode of the video delay.
Audio is held in a ring up to its maximum depth; the output trails the input by
the current delay.

- **Build** grows the delay by time-stretching (pitch preserved), or by airing a
  fill asset while the ring fills.
- **Dump** jumps the read head forward by the configured dump size, crossfaded,
  dropping what was just said.
- **Exit** rolls the delay back to zero, either by draining faster than real
  time or by crossfading to live.
- **Censor** and **cough** cover a span with tone, silence or a file.

Its source is an input or a stage; its delayed output is published as a pickable
source, and plays to a named audio output when you set one.

!!! note "Two ways to delay audio"
    An **audio delay** (`audio_delays[]`, Audio › Delay) is a free-standing
    profanity delay on the box's audio hardware. An **audio-only delay**
    (`channels[].delay.audio_only`) is a channel's video delay with the video
    switched off, so it keeps the channel's number, its GPIO rows, its data
    routes and its TCP verbs. Use the channel form when the delay has to be
    addressed as a channel; use the audio delay when it does not.

See [Audio › Delay](../audio/delay.md).

### Audio encoders

A source, an optional Stereo Tool stage, an alignment delay, then a codec and a
transport.

| | Choices |
|---|---|
| Codec | Opus, AAC-LC / HE-AAC v1 / v2, MP3, FLAC, aptX, aptX HD |
| Transport | SRT, RTP, SIP call, RTMP, Icecast, HLS |

Each is a standalone block — it is not tied to a channel. The alignment delay is
a simple FIFO ring of up to 10 seconds after the processing stage, so a
late-arriving now-playing line lines up with the audio it describes.

See [Audio › Encoders](../audio/encoders.md).

### Audio decoders

A coded audio stream in over SRT, RTP or a SIP call, decoded natively, out as NDI
audio and/or to a named audio output. On SRT the codec is read from the stream; a
call agrees it; on plain RTP you set it. See [RTP and SIP calls](../audio/rtp-sip.md).

!!! warning "Audio SRT pairs Airlock with Airlock"
    The SRT link between an audio encoder and an audio decoder carries Airlock's
    own framing, not MPEG-TS. Each SRT message is one group — codec, channels,
    rate, a sequence number and the codec frames — so a decoder learns the
    stream from the stream and a lost group is a clean gap. A third-party SRT
    receiver will accept the connection and make nothing of the payload, and an
    Airlock audio decoder cannot take an MPEG-TS source. To reach someone
    else's equipment use RTP or a SIP call; for distribution use Icecast, RTMP or
    HLS; for a transport-stream SRT feed use a video channel's encoder, which
    carries its audio as AAC in TS.

See [Audio › Decoders](../audio/decoders.md).

## Channels

A **channel** is one delay, one encoder and one decoder that belong together,
with the ad-cue rails that ride them. One process runs up to **32** channels.

```json
"channels": [
  { "id": 1, "name": "Studio A",
    "delay":   { "enabled": true, "source": "DESKTOP (vMix - Output 1)", "depth_s": 10.0 },
    "ndi":     { "source": "delay", "receiver_name": "ndi2srt" },
    "encoder": { "enabled": true },
    "decoder": { "enabled": false },
    "scte":    { "enabled": false } },
  { "id": 2, "name": "Studio B" }
]
```

### The id is the address

`id` is a small integer, 1-based and unique. It is how every surface addresses
the channel:

| Surface | Channel 2 |
|---|---|
| TCP control | `BUILD 2` |
| REST | `POST /api/channels/2/delay/build` |
| SNMP | `…10.1.<column>.2` |
| GPIO mapping row | `"channel": 2` |
| Console hash address | `#/delay/2/delay-depth` |

Because it is the address, an id is allocated as the highest in use plus one and
**never reused**. A number that once meant a channel must not come back meaning
a different one.

`name` is 1–24 characters of letters, digits, space and `- _ .` Each block can
also carry a name of its own (`delay.name`, `encoder.name`, `decoder.name`); a
block with none shows the channel's name.

### Blocks feed each other within a channel only

A channel's `delay.source: "decoder"` takes **that channel's** decoder, and
`ndi.source: "delay"` takes **that channel's** delayed output. Blocks never feed
across channels. To cross channels, go out and back over NDI.

### What a channel costs

Each channel buffers raw frames: roughly `width × height × 1.5 × fps × depth_s`
bytes. 1080p25 at 10 seconds is about 780 MB, and four of those is 3 GB. Two
limits keep that honest:

- `channels[].delay.max_memory_mb` caps one channel's buffer, and so its usable
  depth. The card shows the depth the cap allows.
- `process.max_memory_mb` is a process-wide **admission** ceiling: a
  configuration whose channels' caps add up past it is refused at save. `0` (the
  default) leaves it off.

### Rules a configuration must satisfy

- Ids unique and ≥ 1; at least one channel; at most 32.
- A usable name (1–24 characters, letters, digits, space, `- _ .`).
- **NDI output names unique across channels** — every `delay.ndi_name` and
  `decoder.ndi_name` in the process. Two channels publishing one name is an
  unresolvable clash on the network.
- **SRT listener ports unique across channels.** Caller ports are not checked:
  two channels may legitimately dial one ingest with different stream ids.
- A GPIO row's `channel` and a delayed data route's `channel` must name a
  channel that exists.
- The per-channel memory caps must fit inside `process.max_memory_mb` when it is
  set.

See [Video › Channels](../video/channels.md) for adding, naming and removing
them.

## What is shared by the whole process

Everything that is not a channel's block is one per process and shared:

- the web console and its REST API;
- the TCP control port (the Airlock line protocol);
- the SNMP agent;
- the Axia GPIO client;
- the alarm centre, with email, webhooks and traps;
- the dump-clip writer;
- the audit log;
- the automation-data receivers, senders and routes;
- scripting;
- authentication, users and API clients;
- redundancy;
- the audio inputs, outputs, sources, delays, encoders and decoders.

In the console these sit under **Server**, **Data**, **Scripting**, **Alarms**
and **Audio**, away from the per-channel pages.

## Where it runs

| Platform | How it runs |
|---|---|
| Windows | A service named `ndi2srt` (automatic start, LocalSystem, restarts after a failure). Installed by the MSI or by `install.ps1`. |
| Linux | A systemd unit at `/etc/systemd/system/ndi2srt.service` (`Restart=always`, enabled at boot). Installed by `install.sh`. |
| macOS | The same binary, run headless (wrap it in a `launchd` job to keep it up). |

The shipped build is **headless**: it has no desktop window and no console
application, and you drive it entirely from the web console, the panel page, the
REST API, the TCP port, GPIO or scripts. (A developer build can put an on-box
window up, but that is not part of a release.)

At start the process raises its own scheduling priority and raises the threads
that pace output further still — the SRT byte-clock pacer, the delay output and
the decoder output. What the operating system actually granted is reported in the
log and on the console.

The NDI runtime must be installed on the machine that runs Airlock. See
[Install and first run](install.md).

## The console

The console is a web page served by the process itself, at
`http://<host>:8090/` by default. It is the same page whether the process runs as
a service or in the foreground.

```json
"web": { "enabled": true, "bind": "0.0.0.0", "port": 8090 }
```

It carries:

- **Operations** — a view-only dashboard with a tile per block for every
  channel, each tile a button into the page that owns its controls.
- **Video**, **Audio**, **Data**, **Scripting**, **Alarms**, **Server** and
  **Account** — the working pages.
- Live **MJPEG previews** and **stereo peak/RMS meters** on every card, with the
  delay showing pre (live input) and post (delayed output) side by side.
- A hash address for every view (`#/delay`, `#/server/ndi`,
  `#/channel/2/censor`), so a link is shareable and the back button works.

Out of the box there is no authentication: put the console behind the plant's
network, not the internet, or turn `auth.enabled` on and give people accounts.

Take the [console tour](console.md) next, or go straight to
[installing](install.md).
