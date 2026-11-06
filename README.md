# Airlock manual

The user manual for **Airlock** — a broadcast delay server for NDI plants: video and
audio delay, SRT encoders and decoders, Icecast/RTMP/HLS audio, Axia GPIO, scripting,
alarms and a primary/backup pair.

**Read it at <https://cloudcastsystemsau.github.io/airlock-manual/>.**

## What is here

```
docs/            the manual, one Markdown file per page
  start/         overview, signal flow, install, the console, licensing
  video/         channels, delay, fills, censor, encoders, decoders, SCTE, timecode
  audio/         inputs and outputs, sources and Stereo Tool, delay, encoders, decoders
  control/       operating, panel, TCP, REST, Axia GPIO, channel lock
  data/          receivers and routes
  scripting/     overview, triggers, host API, Lua, JavaScript, examples
  alarms/        alarms, email and webhooks, SNMP, dump clips
  server/        general, NDI, authentication, users, telemetry, audit, config, watchdog
  redundancy/    overview, setting up a pair, takeover and rejoin, operating a standby
  reference/     configuration file, alarm catalogue, troubleshooting, glossary
  img/           screenshots, captured from a running instance
mkdocs.yml       site definition
```

## Building it

```bash
pip install mkdocs-material mkdocs-glightbox
mkdocs serve     # http://127.0.0.1:8000 with live reload
mkdocs build     # static site in site/
```

Pushing to `main` builds and deploys the site through GitHub Pages
(`.github/workflows/pages.yml`).

## Screenshots

Every screenshot comes from a running, licensed instance with two video channels, named
audio inputs and outputs, a Stereo Tool source, an audio delay, audio encoders on SRT and
HLS, data receivers and routes, an Axia GPIO node and five scripts. Re-capture them with
the harness in the product repository rather than editing images by hand.
