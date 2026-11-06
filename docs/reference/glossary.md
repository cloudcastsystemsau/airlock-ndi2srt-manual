# Glossary

The words this manual uses, in one place. Broadcast terms are defined as Airlock
uses them, not in the abstract — where a term has a general meaning and a
specific one here, both are given.

## Signals and transport

**NDI**
: Network Device Interface. The IP video protocol Airlock receives and publishes
on. A sender is identified by a **source name** of the form
`MACHINE (Sender Name)`, found by mDNS discovery or by a discovery server. NDI
carries video, audio and metadata together, and Airlock uses that metadata rail
for cues and for its own data channels. See [Server › NDI](../server/ndi.md).

**SRT**
: Secure Reliable Transport. The contribution protocol Airlock's encoders send
on and its decoders receive on. It retransmits lost packets inside a latency
budget, so a lossy link delivers cleanly at the cost of `latency_ms` of delay. An
endpoint is either a **caller** (dials out) or a **listener** (waits to be
dialled); exactly one end of a link is a listener. Optionally encrypted with
AES-128, 192 or 256 under a passphrase.

**TS**
: Transport stream — MPEG-2 Part 1, the 188-byte-packet container Airlock's video
encoders mux into and send over SRT. Carries the video, the audio, the program
tables and the cue rail on separate PIDs.

**PID**
: Packet identifier. The 13-bit number that says which stream a transport-stream
packet belongs to. Airlock lets you set the video, audio, PMT and SCTE PIDs per
channel, because some receivers are particular about them.

**PCR**
: Program Clock Reference. The encoder's own clock, stamped into the transport
stream so the receiver can lock to it. Accuracy matters: a hardware decoder
judges the stream by how steady the PCR is, which is why a constant bit rate is
usually the right answer for one. Set by `ts.pcr_interval_ms`.

**PSI**
: Program Specific Information — the tables that describe a transport stream. The
**PAT** lists the programs, the **PMT** lists each program's streams and their
types. Airlock reinserts them at `ts.pat_pmt_interval_ms`.

**SDT**
: Service Description Table. Names the service and its provider to a receiver, so
a set-top box or a professional decoder shows something meaningful rather than
"Service 1". Set with `ts.service_name`, `ts.provider_name` and
`ts.sdt_interval_ms`.

**CBR / VBR**
: Constant and variable bit rate. With `ts.transport_bitrate_kbps` set, the
transport stream leaves at exactly that rate, null-padded, with the PCR placed on
the byte clock — that is CBR, and it is what hardware decoders and satellite
paths expect. Set it to `0` for VBR: no null padding, less bandwidth, but PCR
accuracy that some receivers will not tolerate.

## Coding

**GOP**
: Group of pictures. How often the encoder emits a fresh, self-contained picture.
`video.gop_seconds` sets the interval in seconds; it is converted to frames at
the source rate. Shorter GOPs recover faster from loss and let a receiver join
sooner; longer GOPs cost fewer bits.

**IDR**
: Instantaneous Decoder Refresh — the H.264/HEVC keyframe that starts a GOP. A
decoder can begin at an IDR and nowhere else, so the IDR interval is the join
latency of the stream.

**NVENC / NVDEC**
: NVIDIA's hardware video encoder and decoder. Airlock uses NVENC for H.264 and
HEVC encoding and NVDEC for decoding when the GPU is present; `video.encoder` and
`decoder.hw` select `auto`, `software` or the hardware path. Hardware encoding is
how a box runs several HD channels without burning its CPU — and it is a
**machine-local** setting, because the backup may not have the same card.

**Profile**
: The feature subset a stream is coded within — `baseline`, `main` or `high` for
H.264. A lower profile is more compatible and less efficient. Airlock's dump
clips default to baseline so that its own decoders can read them back as fills.

**Interlaced / progressive**
: Whether each coded picture is a full frame or two fields. `video.scan` follows
the source by default; set it to `interlaced` for a feed that must stay 1080i
through the chain.

## Operating the delay

**Depth**
: How far behind live the delay is running, in seconds. `delay.depth_s` is the
target; the live value is on the delay's card. Depth is the protection window —
how much of what was just said you can still remove.

**Build**
: Grow the buffer to the target depth. The output airs the **fill** while the
buffer fills; at depth, the delayed programme starts. Video delays build by
holding the output; audio delays build by time-stretching the live programme
(pitch kept) or by airing a fill asset.

**Dump**
: Remove the last *n* seconds from the buffer so they never reach air —
`delay.dump_seconds` by default. The removed seconds are written to a **dump
clip** if clips are enabled, and the depth drops by what was removed unless the
delay is set to rebuild.

**Dump all**
: Remove everything in the buffer, taking the output to live in one step.

**Rollout**
: Leave the delay and return to live deliberately. With `delay.fade_rollout` the
output dissolves to live; without it, it is a jump cut. With
`fill.rollout_fill` the fill airs for the remaining depth instead, and the
viewer sees fill, then live.

**Exit**
: The same action as Rollout, under the name the TCP control port and the audio
delay surfaces use.

**Cough**
: A held control. While it is down, the output is covered — silence, tone or
fill, per `censor.audio` — and when it is released, a tail of
`censor.cough_tail_ms` keeps the cover on. For the presenter clearing their
throat, and it does not touch the buffer.

**Censor**
: A one-shot cover of `censor.censor_seconds`, with a lead-in of `censor.pre_ms`
so it also covers what was *just* said. It can bleep the audio, mask the picture,
or both, and it can be put on a daypart schedule. Unlike a dump, it costs no
depth: nothing is removed from the buffer.

**The exits**
: Dump, Dump all and Rollout. They are never gated — not by the licence, not by
the local-control window on a standby. An instance that may be on air must never
trap its operator.

**Fill**
: What the output airs when there is no delayed programme to air: during a
build, during a rollout if `rollout_fill` is set, and while depth maintenance
holds a window open through a source outage. A fill set is a video kind (freeze,
black, an image, a looped clip or a live NDI source) paired with an audio kind
(silence, tone, the clip's own audio, the source's audio, or no audio frames at
all). Fills can be dayparted.

**Slate**
: A cover over the picture, taken from the fill set's image, used by the censor's
`video_mode: slate` and by the Slate control. It mutes the output audio by
default.

**Mask**
: The censor's other way of treating the picture: `blur`, `mosaic` or `solid`
(black), at `mask_strength`.

**Depth maintenance**
: What the delay does when its source stops. In `drain` mode the buffer empties
and the protection window goes with it; in `hold` mode the output airs the fill
instead of consuming, so the window survives the outage and the timeline drifts —
which `catchup` then absorbs.

## Cues and data

**Cue**
: An ad-insertion marker. A **break start** (`out`), a **return** (`in`), a
`cancel`, or a time signal. Airlock takes cues in, carries them through the delay
so they land with the pictures they belong to, and puts them out again.

**SCTE-104**
: The cue format carried in NDI metadata (and in SDI ancillary data elsewhere).
Airlock's input rail.

**SCTE-35**
: The cue format carried as sections on a transport-stream PID. Airlock's output
rail: a received SCTE-104 cue becomes an SCTE-35 section on `scte.pid`, delayed
to match the pictures.

**Pre-roll**
: How far ahead of the splice point a cue is signalled. The standards put the
floor at 4000 ms and Airlock enforces it for cues it originates. A pass-through
cue keeps the upstream's own pre-roll — substituting Airlock's would move the
transport-stream break away from the NDI one.

**Data channel**
: A TCP or UDP feed — automation messages, now-playing text, RDS — received,
carried through a delay channel at its current depth, and sent out again, so the
data lands with the audio it describes. Built from **receivers**, **senders** and
**routes**.

## Control surfaces

**Livewire**
: Axia's AoIP system. Airlock speaks its control protocol, **LWRP**, to an Axia
node on port 93.

**GPIO**
: General-purpose input/output — the contact closures a console button or a lamp
rides on. Airlock drives a delay from GPO pins and carries its state back out on
GPI pins. Three things to remember: controls ride GPO and lamps ride GPI; pins
are **0-based**; and the edge words on the wire are uppercase.

**Relay**
: A GPIO row that re-drives a contact seen on one pin onto another pin after an
audio delay's current depth, so a closure made live reaches the output at the
same moment the live audio does.

**Panel**
: Airlock's TCP control surface for hardware panels and Stream Deck / Companion
style controllers.

**OIDC**
: OpenID Connect — the single-sign-on protocol Airlock uses to let an identity
provider authenticate console users and map their groups to the `admin`,
`operator` and `viewer` roles.

## Audio

**Named input / named output**
: An entry in `audio_inputs` or `audio_outputs`: a **name** this box's
configuration uses, bound to a **device** on this box. The device is opened once
and shared by everything that names it — an aux track, an audio delay, an audio
encoder. Names are what the rest of the configuration refers to, and names are
what a backup must match; the device strings are machine-local and differ between
boxes.

**Stage**
: A node in the audio sources graph. A stage takes one source in — a named input,
or another stage — and produces a new source out, under its own id. Define it
once and any number of encoders can pick its output: it runs once and fans out.
Today a stage is either a Stereo Tool processor or a passthrough.

**Stereo Tool**
: Thimeo's audio processor, loaded as a native library at run time and licensed
separately. A stage can run an instance of it with its own `.sts` preset, and can
expose Stereo Tool's own browser tuning GUI. That GUI is an unauthenticated
on-air control surface — it is off by default, restricted by a whitelist, and
withdrawn entirely while an instance is a locked standby.

**Aux track**
: An extra audio track on a video delay. It takes audio from an NDI source or
from a named input, delays it in lockstep with the picture, and appends it after
the source's own channels on the delayed NDI output — for a second language, a
clean feed, or a commentary track.

**Audio (profanity) delay**
: A delay for sound alone, with no video. It builds by time-stretching (pitch
kept), dumps by jumping the read head forward over a crossfade, and exits by
compressing back to live or by crossfading. Its delayed output is itself a
pickable source.

**Loudness**
: The programme level measured to ITU-R BS.1770 / EBU R128 and reported in LUFS
on the block's card.

## Licensing and redundancy

**Seat**
: One running **block**, not one channel. A delay takes a `VDELAY` seat, an
encoder a `VENCODE` seat, a decoder a `VDECODE` seat, and the audio blocks draw
on their own pools. A channel that delays *and* encodes uses one of each. Seats
are handed out lowest channel id first, so a downgrade drops the highest ids and
the main channel keeps running. Seats are resolution-agnostic: a 4K channel costs
the same as an SD one.

**Watermark**
: What an unseated or unlicensed block puts on air instead of being refused. The
picture carries the Airlock lock with `AIRLOCK - UNLICENSED` under it in red,
blended into the top third of the frame; the sound carries a one-second tone
burst every thirty seconds at about −12 dBFS over the programme. An unlicensed
box is not broken — it keeps delaying, encoding and decoding, and the exits are
never gated.

**Hardware id**
: The fingerprint a licence is bound to. It is derived from this machine, so a
licence does not move between boxes — which is why licence paths and the whole
licensing state are machine-local in a redundant pair.

**Primary**
: The instance that does the work and serves its configuration to backups. A
primary with no backup paired to it behaves exactly like a standalone instance.

**Backup** (also **standby**)
: An instance that mirrors a primary's configuration continuously, keeps its own
machine-local settings, runs with its controls locked, holds its external outputs
back, publishes its NDI outputs under a suffixed name, and stays hot with full
delay buffers so it is useful the moment it is needed.

**Rank**
: The order a primary first registered its backups. Rank **#1** may take over by
itself; the rest wait for an operator, so a partition does not have several boxes
adopt one set of NDI names.

**Readiness**
: Whether a backup could actually carry the plant right now: every mirrored asset
landed, the mirrored channels fit this box's capacity ceiling, and the pair runs
one version. An automatic takeover requires it; an operator can override it with
**Take over anyway**.

**Takeover**
: The moment a backup becomes the plant: controls unlock, external outputs
resume, the NDI name suffix is dropped and the blocks restart to adopt the
primary's names. Automatic after `takeover_after_s`, or on an operator's command.

**Rejoin**
: The explicit, audited hand-back. Controls lock, the NDI names re-suffix, the
blocks restart, and the next poll resyncs from scratch — **the primary wins any
divergence**. Nothing re-locks on its own when a primary returns; a rejoin is
always a human decision.

**Local-control window**
: How long a backup that has taken the plant may run on its own authority before
the controls re-lock — `redundancy.grace_days`, 14 days by default. The exits
stay available for ever. The countdown is sealed, bound to the machine and
hardened against a clock wound back or held still; it ends the moment the primary
answers again, an operator rejoins, or the role changes.

**Sync digest**
: The SHA-256 of the primary's configuration document (with its asset manifest
folded in). A backup sends the digest it holds on every poll; the primary answers
the moment its own differs. On the primary's **Backups** table it is what makes a
child read `current` rather than `behind`.

## Housekeeping

**Dump clip**
: The seconds a dump removed, written to disk as a transport-stream file with a
record of who dumped what, and optionally emailed or posted to a webhook. Local
to the box that made it — clips are never mirrored.

**Block**
: One running thing with its own state, its own statistics card and its own
licence seat: a delay, an encoder, a decoder, an audio delay, an audio encoder,
an audio decoder.

**Channel**
: One delay, one encoder and one decoder that belong together, addressed by a
1-based `id` on every surface — `BUILD 2` on TCP,
`/api/channels/2/delay/build` on REST, the SNMP channel table, a GPIO row's
`channel`. One process runs up to 32.

**Watchdog**
: The supervisor that restarts a block whose input is alive but whose output has
stopped, with a backoff and a cap per hour. Off by default: it *acts*, so a plant
should opt in.
