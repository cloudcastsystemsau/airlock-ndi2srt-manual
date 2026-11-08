# Sources and Stereo Tool

A **source** is anything in Airlock that can hand audio to something else. A
named input is a raw source. A **stage** takes one source in, processes it, and
publishes the result as a new source — so a Stereo Tool chain is built once and
any number of delays and encoders pick it up. **Audio › Sources** is where you
build stages.

![The Audio sources page](../img/audio/sources.png){ .shot }

## What a stage is

A stage is a processor instance with a name. It subscribes to one upstream
source, runs it through its processing, and fans the processed audio out to
every consumer that names it.

```mermaid
flowchart LR
  in1["Named input<br/>Studio A desk"] --> st1["Stage: online<br/>Stereo Tool"]
  in1 --> st2["Stage: dab<br/>Stereo Tool"]
  st1 --> dly["Audio delay"]
  st1 --> enc1["Encoder · Icecast"]
  st2 --> enc2["Encoder · SRT"]
  dly --> out["Named output"]
  dly --> enc3["Encoder · HLS"]
```

Two things follow from that shape, and both matter in a plant:

- **Process once, fan out.** Ten encoders on one stage cost one instance of the
  processing, not ten. Pick the stage, not the input, on every consumer that
  should hear the same sound.
- **Separate sound, separate stage.** Online, DAB+ and the broadcast chain each
  want their own loudness and clipping. Build one stage per sound, each with its
  own preset — and each with its own tuning interface if you enable it.

Stages chain. A stage's **From** may be a named input or *another stage*, so a
house chain can feed per-service trims. A stage cannot take an audio delay as
its source, and it cannot take itself.

## Add a stage

1. Open **Audio › Sources**.
2. Press **Add Stereo Tool**. A card appears, pre-filled.
3. Set the fields:
    - **Name** — what you call it. This is the label on the card and in pickers.
    - **Source id** — the identifier consumers pick, e.g. `online`. Keep it
      short, lower-case and stable: changing it breaks every block pointing at
      it.
    - **From** — the upstream source: a named input or another stage.
    - **Kind** — **Stereo Tool (Thimeo)** or **Passthrough**.
    - **On** — **Enabled** or **Off**.
4. Press **Save**.

The card's status pill shows `running · ST v<version>` once the stage is up and
its source is delivering, `no source` if the upstream has not arrived yet, or
`stopped`. Two meters sit beside it, marked **in** and **out** — the audio
arriving and the audio leaving. On a processing stage those two should look
visibly different; if they do not, the processing is not in the path.

!!! note "Saving restarts a stage"
    Any change to a stage — a preset path, the licence, a bypass — rebuilds it.
    Expect a brief break in that stage's audio, and in the audio of anything
    downstream of it. Save processing changes off air.

## Stereo Tool processing

Stereo Tool is Thimeo's broadcast audio processor — loudness control, AGC,
multiband, stereo handling and clip protection. Airlock does not include it: it
loads Thimeo's shared library at run time, creates one processor instance per
stage, and passes your audio through it.

### Installing the library

Put the Stereo Tool shared library where Airlock can find it. It looks, in
order, at:

1. the path in the `NDI2SRT_STEREOTOOL` environment variable, if set — this must
   be the full path to the library file itself;
2. the directory the Airlock executable is in;
3. a `stereotool/x64` folder in that directory;
4. the operating system's normal library search path.

The file names it recognises are the ones Thimeo ships:

| Platform | File |
|---|---|
| Linux x64 | `libStereoTool_intel64.so` |
| Linux ARM64 | `libStereoTool_arm64.so` |
| Windows x64 | `libStereoTool_64.dll` or `libStereoTool_intel64.dll` |
| macOS | `libStereoTool_64.dylib` |

If no library is found, the stage still runs and passes audio through untouched.
The card shows a warning banner naming the file this box needs and the folder to
put it in — for example *copy `libStereoTool_64.dll` into `C:\Program
Files\ndi2srt` (beside ndi2srt)* — and the log says the same once. Nothing drops
off air because Stereo Tool is missing.

**No restart is needed.** A running stage looks for the library again every few
seconds and changes over to Stereo Tool when it appears. Loading takes from a second to several seconds
(about 10 s end to end on a Windows desktop) — the card says **Stereo Tool is loading** meanwhile — and happens beside
the audio, which keeps passing through until the engine is ready. An audio
encoder with Stereo Tool picks the library up the next time it is started
(disable and enable it).

The library's code is loaded **once per process**; every stage and every
encoder still makes **its own Stereo Tool instance** from it, with its own
input, output, preset, licence, bypass and web port. Almost all of the start-up time
is that instance — about 0.8 s measured on a Mac mini and about 6 s on a
Windows desktop, against 0.07–0.15 s for the library itself — so it is paid for
each stage and encoder.

### Licence and presets

Stereo Tool is **licensed separately, by Thimeo**. Your Airlock licence does not
cover it and Airlock does not validate it — it hands the key you type to the
processor and reports what the processor says back.

| Field | What to put in it |
|---|---|
| **Licence** | Your Stereo Tool key. Leave it empty and the processor runs **unlicensed** — it still processes, and it adds Thimeo's audible watermark to the output. |
| **Preset** | The full path to a `.sts` preset file on this box. Leave it empty to run the processor's defaults. |

Once the stage is up, the card reports what the processor told it:
`licence valid` or `unlicensed · watermarked`, the version, and the processing
latency in samples. That latency figure is the fixed delay the processor adds —
useful when you are lining up metadata or a second rail against the processed
audio.

A preset that fails to load is logged as `FAILED` and the stage keeps running on
whatever the processor had. Check the path, and check that the file is readable
by the account the service runs as.

### Bypass

**Mode** has two settings:

- **Process** — audio goes through the processor.
- **Bypass (no processing)** — audio passes through untouched.

Bypass is the control to reach for when you want the stage out of the path but
want everything downstream to keep running. Consumers stay subscribed, the
source keeps publishing, and nothing restarts except the stage itself.


!!! warning "Stereo in, stereo out"
    The processor works on **stereo at 48 kHz**. A stage whose source delivers
    anything other than two channels passes that audio through unprocessed. Feed
    processing stages from a 48 kHz stereo source, or take a stereo pair at the
    consumer that needs it.

## The Stereo Tool web interface

Stereo Tool has its own browser-based tuning interface, and each instance can
offer its own. Airlock exposes it per stage so that Online, DAB+ and Broadcast
are each tuned in their own browser tab, against their own processor.

To enable it:

1. Set **Web UI** to **On**.
2. Set **Port**. `0` picks a free port and reports the one it chose.
3. Set **Allow from** — a CIDR range. The default is `127.0.0.1/32`: this box
   only.
4. Save.

When the stage comes back up, the card shows a link reading
`open tuner :<port> ↗`. It opens the processor's own interface, served by the
processor on that port.

!!! danger "The tuner has no password"
    Stereo Tool's web interface is an **unauthenticated on-air control
    surface**. Anyone who can reach that port can change your processing while
    it is on air. It is off by default for that reason.

    Keep **Allow from** as tight as the job permits — `127.0.0.1/32` and an SSH
    tunnel, or a single operator subnet. `0.0.0.0/0` means *anywhere that can
    route to this box*. It is not protected by Airlock's own sign-in, roles or
    audit log, and nothing it changes appears in Airlock's audit trail.

The tuner follows Airlock's control lock. While this instance is a locked
backup, the interface is withdrawn — the port closes and the link disappears —
and it comes back on its own within a second of the instance becoming
controllable again. A backup should not be offering an on-air processing
surface for a plant it is not driving.

## Using a stage

A stage's output is a source like any other. Pick it:

- on **Audio › Delay**, in the delay's **Source** picker — stages are listed
  with *(processed)* beside the name;
- on **Audio › Encoders**, as the encoder's source;
- on another stage, as its **From**.

The card's `used by N encoder(s)` pill tells you how many consumers are attached
right now. A stage with no consumers still runs — it is cheap to leave one
configured and unused, and it means a consumer that picks it later hears audio
immediately.

!!! tip "Where to put processing relative to the delay"
    Feeding the delay *from* a stage means the delay holds already-processed
    audio: what you dump is what would have aired. Feeding an encoder from a
    stage that is fed by the delay processes after the delay instead. Both are
    valid; pick one per service and be consistent, because a build or a dump in
    the middle of a processing chain behaves differently on each side.

## Settings reference

### Stage

| Setting | Console label | Config key | Default | Meaning |
|---|---|---|---|---|
| Source id | **Source id** | `audio_stages[].id` | — | The identifier consumers pick. Unique on the box. |
| Name | **Name** | `audio_stages[].name` | — | Display label on the card and in pickers. |
| Upstream | **From** | `audio_stages[].source` | `""` | The source into the stage: a named input or another stage's id. |
| Kind | **Kind** | `audio_stages[].kind` | `stereotool` | `stereotool` (a processor instance) or `passthrough`. |
| On | **On** | `audio_stages[].enabled` | `true` | Marks the stage enabled. To take processing out of the path on air, use **Mode › Bypass**. |

### Stereo Tool, per stage

| Setting | Console label | Config key | Default | Meaning |
|---|---|---|---|---|
| Processing | — | `audio_stages[].stereotool.enabled` | `false` (`true` from the console's **Add Stereo Tool**) | Whether a processor instance is created for this stage at all. |
| Mode | **Mode** | `audio_stages[].stereotool.bypass` | `false` | `true` = **Bypass (no processing)**; audio passes through the instance untouched. |
| Licence | **Licence** | `audio_stages[].stereotool.licence` | `""` | Your Thimeo key. Empty = unlicensed, which processes **and watermarks**. |
| Preset | **Preset** | `audio_stages[].stereotool.preset` | `""` | Full path to a `.sts` preset on this box. Empty = the processor's defaults. |
| Web UI | **Web UI** | `audio_stages[].stereotool.web_enable` | `false` | Offer the processor's own browser tuner for this stage. |
| Port | **Port** | `audio_stages[].stereotool.web_port` | `0` | The tuner's port. `0` = pick a free one and report it. |
| Allow from | **Allow from** | `audio_stages[].stereotool.web_whitelist` | `127.0.0.1/32` | CIDR range allowed to reach the tuner. |

```json
{
  "audio_stages": [
    {
      "id": "online",
      "name": "Online processing",
      "source": "Studio A desk",
      "kind": "stereotool",
      "enabled": true,
      "stereotool": {
        "enabled": true,
        "bypass": false,
        "licence": "",
        "preset": "/opt/airlock/presets/online.sts",
        "web_enable": true,
        "web_port": 0,
        "web_whitelist": "10.20.0.0/24"
      }
    }
  ]
}
```

### Status endpoint

`GET /api/audio-sources` returns two things: `sources`, a row per stage with its
run state, in/out meters, rate, consumers and processor state (loaded, version,
licence validity, latency, bypass, web port); and `list`, every pickable source
on the box as `{ id, label, kind }` where `kind` is `input`, `stage` or `delay`.
That list is what every source picker in the console is built from.

### Redundancy

The stage list is **plant policy**: `audio_stages` is copied from a primary to
its backups, licence key, preset path and all. The *inputs* those stages name
are machine-local, so each box resolves `From` against its own hardware — which
is why input names must match across a redundant pair.

## Troubleshooting

**The card says Stereo Tool's library is not on this box.**
Airlock could not find the Stereo Tool shared library. The banner names the file
and the folder for this box: copy that file there (or point
`NDI2SRT_STEREOTOOL` at the file, not the folder) and it is picked up within a
few seconds. If it still says so, check the architecture matches the Airlock
build. Audio is passing through untouched in the meantime.

**`unlicensed · watermarked`.**
No key, or a key the processor rejected. The audio on air carries Thimeo's
watermark. Enter the key in **Licence** and save.

**The in and out meters look identical.**
Processing is not in the path. Check **Mode** is **Process**, check the library
loaded (`running · ST v…` on the pill), and check the source is **stereo** — a
mono or multi-channel source passes through unprocessed.

**The pill says `no source`.**
The stage is running but the upstream is not delivering. Check **From** names a
source that exists, and check that source on **Audio › Inputs & outputs**. A
stage retries its source every two seconds and connects by itself when it
appears, so this clears on its own once the input is right.

**The tuner link does not appear.**
Three reasons, in order of likelihood: **Web UI** is **Off**; the library did not
load (there is no processor to serve it); or this instance is a locked backup, in
which case the interface is deliberately withdrawn.

**The tuner opens but I cannot reach it from my desk.**
**Allow from** is a CIDR range and it defaults to the local machine only. Widen
it to your operator subnet, and check nothing between you and the box is
blocking the port.

**Audio clicked when I saved.**
Saving a stage rebuilds it. That is expected; do processing edits off air, or on
a stage nothing is currently airing.
