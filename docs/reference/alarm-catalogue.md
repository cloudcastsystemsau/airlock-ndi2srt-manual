# Alarm catalogue

Every alarm Airlock can raise, with its code, severity, scope, what it means,
what clears it and what to do about it. The model behind the table — raise and
clear hysteresis, the ack/dismiss overlay, delivery — is on
[Alarms](../alarms/alarms.md).

## How to read the table

* **Code** is the constant on the wire: in the webhook payload, in the trap, in
  `ndi2srtBlockActiveAlarms`, in the TCP `ALARMS` line and in the script trigger.
* **Scope** names the block the alarm is raised on, and whether it belongs to a
  channel or to the process. A process-wide alarm carries **channel 0**.
* **Clears when** is the condition — every engine alarm also needs its restore
  time to pass before it lifts.

Severity is fixed per code. There is no way to re-grade one.

## Signal and transport

| Code | Friendly | Severity | Scope | Means | Clears when | Do this |
|---|---|---|---|---|---|---|
| `ALARM_SOURCE_LOST` | Source lost | critical | `encoder`, `delay` · channel | No NDI video (or audio, on an audio-only delay) from the configured source for `source_lost_s`. The block itself waits 3 s before it reports a disconnect. | The source is back and delivering. | Check the sender is running and in a group this box receives. Run **Check NDI** on Server › NDI. For a routed sender, add its address to the channel's extra IPs. |
| `ALARM_AUX_SOURCE_LOST` | Extra audio track source lost | warning | `delay` · channel | One of the delay's extra audio tracks has a source that is not delivering. The message names the track and its source. | Every extra track is connected again. | The named NDI source has gone. The main programme is unaffected — the track's slots fill with silence. |
| `ALARM_AUDIO_SILENCE` | Audio silence | critical | `encoder`, `decoder`, `delay` · channel | Peak is below `audio_silence_dbfs` for `audio_silence_s` — **or** no audio blocks are arriving at all while the video keeps coming. | Peak is above `audio_silence_dbfs + audio_hysteresis_db` for `audio_restore_s`. | Check the source is actually carrying audio and on the right pair. Mute at the desk reads as silence, correctly. If the chain is right, raise the threshold. |
| `ALARM_VIDEO_BLACK` | Video black | critical | `encoder`, `decoder`, `delay` · channel | Mean luma has been below `video_black_luma` for `video_silence_s`. | A picture above the threshold for `video_restore_s`. | A black source, a lens cap, or a fill that is black. Check the source before anything here. |
| `ALARM_VIDEO_FROZEN` | Video frozen | warning | `encoder`, `decoder`, `delay` · channel | The picture has stopped changing — motion below `video_frozen_motion` — for `video_silence_s`. Only judged while a live picture is arriving. | The picture moves again for `video_restore_s`. | A wedged sender, a still slate, or a locked-off shot on a static subject. Lower `video_frozen_motion` if a legitimate still is alarming. |
| `ALARM_SRT_DOWN` | SRT link down | critical | `encoder`, `decoder` · channel | The SRT link has not been connected for `srt_down_s`. The message carries the mode, the address and the socket's own last error. | The link connects. | In caller mode, check the far end is listening and the port is open. In listener mode, check nothing else holds the port. A passphrase mismatch shows in the message. |
| `ALARM_DECODER_STALL` | Decoder stalled | critical | `decoder` · channel | SRT is connected but no decoded picture has left for `decoder_stall_s`. | Pictures start leaving again. | The stream is arriving but is not decodable: wrong codec, a truncated bitstream, or a programme with no video PID. Check the decoder card's programme figures. |
| `ALARM_AV_SYNC` | Audio and video out of sync | warning | `encoder`, `decoder` · channel | Picture and sound are more than `av_offset_ms` apart for `av_offset_s`. The message is signed — it names which rail is ahead. | The offset comes back inside the limit. | On the encoder this is what a receiver will see in the muxed stream; on the decoder it is what is leaving. Sound early is worse than sound late. Check the source first, then any alignment delay in the chain. |
| `ALARM_DEPTH_EROSION` | Delay depth eroded | warning | `delay` · channel | A channel in **Delayed** has sat more than `depth_low_margin_s` under its target depth for `depth_low_s`. | Depth returns to within the margin. | Usually a source whose clock runs slower than the output, or frames being dropped on the way in. Check the delay card's input rate against the output rate. |

## Process and supervision

| Code | Friendly | Severity | Scope | Means | Clears when | Do this |
|---|---|---|---|---|---|---|
| `ALARM_WATCHDOG_STALL` | Block stalled (watchdog) | warning | `watchdog` · channel | A block's output has stopped with its input still arriving. The message names the block, how long it has been stalled and when the restart is due — or that it has hit the hourly restart cap. | The blocks are producing again. | Watch the restart happen. If the cap message appears, restarting is not fixing it: look at the block's own card. See [Watchdog](../server/watchdog.md). |
| `ALARM_GPIO_DOWN` | GPIO node unreachable | warning | `gpio` · process | There has been no LWRP session with the configured Livewire node for 5 s. GPIO controls are dead and the lamps are stale. | The session is re-established. | Check the node's address and password, and that nothing else holds its LWRP session. The console's GPIO chip in the top bar shows the same state. |

## Licensing

| Code | Friendly | Severity | Scope | Means | Clears when | Do this |
|---|---|---|---|---|---|---|
| `ALARM_LICENCE_INVALID` | Licence invalid | critical | `licence` · process | The product licence is absent, expired, revoked, or carries role flags that do not permit this instance's redundancy role. Nothing is blocked — unseated outputs carry the watermark. | A valid licence is seen. No restart needed. | Activate or re-activate on Server › Licence. On bare metal, check the hardware id is specific to this machine. |
| `ALARM_LICENCE_CHECK_FAILING` | Licence check failing | warning | `licence` · process | The daily online re-check has not reached the licensing server for long enough to be worth saying. **The licence is still valid** — the message names the day watermarks would start. | The first check that gets through. | Let the box reach the licensing server, or plan an offline arrangement. A rejected installer serial is reported here too. |
| `ALARM_UNLICENSED_RUNTIME_LIMIT` | Unlicensed runtime limit reached | warning | `licence` · process | A sweep of the unlicensed runtime limit disabled data receivers or scripts after their 30 minutes. The message names how many of each. | A valid licence is seen. | Activate a licence. Re-enabling an item grants it another 30 minutes, which is a stopgap, not a fix. |

## Redundancy

All of these are process-wide on the `redundancy` block (channel 0). See
[Takeover and rejoin](../redundancy/takeover.md).

| Code | Friendly | Severity | Raised on | Means | Clears when | Do this |
|---|---|---|---|---|---|---|
| `ALARM_REDUNDANCY_PRIMARY_LOST` | Primary unreachable | critical | the backup | This backup cannot reach its primary. The message carries the address and the error. | The primary answers again. | Check the primary is up and its web port is reachable from here. The backup keeps running on the configuration it already holds. |
| `ALARM_REDUNDANCY_TAKEOVER` | Backup has taken over | critical | the backup | This backup has taken the plant: controls unlocked, outputs resumed, the primary's NDI names adopted. | A rejoin, or a role change. | Expected after a takeover. Rejoin when the primary is back — the console offers **Rejoin…** on Server › Redundancy. |
| `ALARM_REDUNDANCY_SYNC_REFUSED` | Primary's configuration refused | warning | the backup | The primary answered, but the configuration it sent will not apply here — a path, a bound port, or a channel list this machine cannot honour. Contact is fine; the mirror is not. | The next configuration that applies cleanly. | Fix the named problem on this box. A takeover now would run on a stale configuration. |
| `ALARM_REDUNDANCY_ASSETS` | Primary's assets not mirrored | warning | the backup | One or more of the primary's fill or preset files could not be brought across. A takeover would air a missing fill. | Every asset is in sync. | The names and reasons are under `assets.files` on `GET /api/redundancy`, and listed on Server › Redundancy. |
| `ALARM_REDUNDANCY_LOCAL_WINDOW` | Backup local-control window | warning | the backup | This backup is holding the plant on local control and its window is running out — or has run out, and the controls have re-locked. Re-stated at four days, two days and expiry. | Reconnecting the primary, rejoining, or a role change. | Get the primary back and rejoin. Dump and Rollout keep working for ever, even past expiry. |
| `ALARM_REDUNDANCY_NOT_READY` | Backup not ready to take over | warning | the backup | The primary is gone and this box will not take over by itself: assets missing, over the capacity ceiling, a version mismatch, or it is not rank 1. | The primary returns, or the reason goes away. | The reasons are in `not_ready` on `GET /api/redundancy`. An operator can still force a takeover from the console. |
| `ALARM_REDUNDANCY_CHILD_TAKEN_OVER` | A backup has taken over | critical | the primary | A backup reports itself taken over, so two boxes may be airing under this primary's names. | The backup rejoins, or stops. | Decide which box is on air. Rejoin the backup, or stop this primary. |
| `ALARM_REDUNDANCY_CHILD_STALE` | A backup stopped polling | warning | the primary | A backup that was polling this primary has not for 20 s. | The backup polls again. | Check the backup is running and can reach this box. Its row on Server › Redundancy shows as **stale**. |

## Not an alarm

| Code | What it is |
|---|---|
| `ALARM_TEST` | The synthetic transition **Test webhook** fires. It is never raised by the box and never appears in the active list. |
| `DUMP` | The code on a [dump alert](../alarms/clips.md). A dump is one-shot: there is no restored counterpart and nothing to clear. Tell the two apart by the payload's `event` field — `"alarm"` or `"dump"`. |
