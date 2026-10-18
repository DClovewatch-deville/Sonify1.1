# Progressive music and final reveal v1.1

2026-10-17

## v1.3 — image-driven differentiation + audio-visual sync (0323.docx)

**Music differentiation (priority 1).** New `progressive_features.py` reads the
classified geometry (and the derived Soul material) and derives per-image
features — verticality, curvature, repetition, density, melodic span/step — then
maps them to arrangement parameters: development-register, articulation
(legato), rhythm pulse, **voice set** (3–4 voices) and climax lift. Different
images now produce different registers, voice sets and climaxes, and the theme
itself is each image's own hero contour (already); the earlier fixed template is
gone. Fully deterministic.

Measured (built-in samples): sample2 (column façade, tallest) → register +5,
strings voice, climax lift; sample3 → sparser 3 voices; sample0/1 register −1;
sample4/5 register +2. Themes differ per image.

**Audio-visual sync (priority 2).** The reveal caption now names the current
musical event alongside the visual stage, e.g. “主体结构 · 初生（主轮廓 → 主题旋律）”
and “完整细节（完整揭示 → 全声部高潮）”, so the structure→music mapping is read
during playback. The payload exposes `progressive.features` and
`progressive.arrangement_params` for traceability.

Contracts held: 36 s, 5 emotions, reprise == theme (24–26 s), tonic ending,
polyphony ≤ 6; unique note ids. 52 Python + 56 JS checks pass.

## v1.2 — expressive 起承转合 polish (this pass)

Refined the arrangement per the 0245.docx advice, without touching the visual
reveal or the other modes:

- **Rising melodic sequence into the climax**: bars 12 keeps the exact opening
  theme (reprise contract), while bars 13→15 rise in register (+2/+4/+6) so the
  melody climbs toward the final reveal instead of repeating. Lead max pitch
  grows ~76 (opening) → ~83 (revelation).
- **Harmonic tension + cadence**: the closing dominant is now **G7** (leading
  tone + 7th), resolving to a clear **C** tonic at 34 s (bar17) with a high
  string linger (C6).
- **Rhythmic accents build density** in bars 13–15 (climax accents), so the
  peak is driven by melody direction + harmony + density, not volume alone.
- Polyphony stays ≤ 6 (tonic voicing trimmed to two notes); reprise == theme and
  tonic-ending contracts still hold.

Objective (nature, sample5 mix): 0–6 s 0.057 → 6–14 s 0.130 → 24–32 s 0.177
(climax) → 34–36 s 0.112 (tail); peak 0.720; climax/opening 2.7×.

## Scope

Implements 0138.docx: preserve the four-stage reveal; add a continuous 36-second arrangement, original-theme reprise, cadence and verified source-photo recovery. Source processing, Soul composition and Blueprint composition are unchanged.

## Arrangement

progressive_arrangement.py uses the existing Soul source motif as musical material. All events retain a real parent note ID, actual source path and sampled source point. Four original lead pitches identify the image. Harmony, bass, response and octave doubling are explicit arrangement rules, not falsely described as direct height-to-pitch mapping. Five emotion stages start at 0, 6, 14, 24 and 32 seconds, on 120 BPM bar boundaries. Visual stages remain 0/6/18/24; full geometry completes at 30. At 24 seconds the opening theme returns over strings and voice-led harmony. A dominant preparation at 32 resolves to C at 34, sustaining to 35.8 before the 36-second endpoint. Maximum polyphony is six.

Five voices: lead, piano response, cello root/fifth, sustained harmony and octave string theme. Common harmony tones are tied across bars. Different rhythmic duties, pauses in the lead and continued harmony replace independent six-second chunks. Nature and chamber presets share the same source-driven arrangement, with flute/piano/cello/pad/strings versus violin/piano/cello/strings palettes. No drums, electronic drop or new model training.

SoundFont rendering supports optional shared-master normalization, leaving default behaviour unchanged for other modes. Progressive raw stems use calibrated mix gains/pans and one shared master gain, with a 0.7-second tail fade. The browser uses the same gain/pan metadata as the reference WAV. Sample5 nature reference peak is 0.720, whole-track RMS 0.135; chamber peak 0.720, RMS 0.113. Objective tests confirm stronger climax than opening, continuous sound support and a quiet final tail. This is not a claim of subjective listening quality.

## Original photo

The existing pavilion original in 线稿示例图/原图.jpg was inspected and matched to sample5. source_photo_manifest.json binds the photo to the exact structural source hash. Unknown uploads never inherit this pavilion photo. 33–34 seconds crossfades actual geometry to the source photo; 34–36 holds it during tonic resolution. Alignment is approximate because the sketch was generated; no pixel-registration accuracy is claimed. The photo is copied unchanged, including its existing source watermark. Samples without a verified photo get a **colourised fallback** generated from their own line-art (`relationship: colorized_from_lineart`), so every sample now resolves into colour at the reveal; the caption distinguishes 原始场景回归 (verified photo) from 色彩回归 (colourised fallback).

**Uploaded images** keep their real original: the intake workflow already stores the uploaded colour photo as `original.png`; `intake/bridge.py` now copies it into the workspace and binds it as `original_photo` (`relationship: uploaded_original`), so Progressive crossfades to the actual photo with no colourisation.

## Integration

studio_grammar.compose_units uses the new arrangement by default; progressive_legacy retains the old scheduler for before/after reproduction. build_studio.py preserves old reference rendering then rebuilds the arranged presets through build_progressive_arrangement.py. The upload bridge uses the new default arrangement and calibrated mix without adding unavailable preset choices. UI gracefully disables preset choice for legacy payloads. Mapping details report source material plus the actual arrangement role/chord, rather than presenting an obsolete pitch equation for arranged notes.

## Human acceptance package

Open progressive-review.html. Same pavilion, same 36-second four-stage drawing, old versus new music; only the new ending crossfades to colour. Comparison WAVs have approximately equal integrated RMS, preserving their time curves. WebM videos are directly recorded from the real geometry canvas and the corresponding comparison WAV via MediaRecorder, with VP9/Opus where available. They show the actual source geometry, not a generated promotional video. Download paths are in dist/progressive-review. The page can regenerate both recordings.

Compare without visuals first: continuity from opening to climax; memorable return of the opening motif; satisfying final cadence. Then watch the videos to judge visual/audio alignment. Music quality remains subject to human acceptance; no external service or subjective automated score was used.

## Verification

Arrangement tests cover all six images and both presets: parent provenance, exact original-theme reprise, final tonic, bounded durations, six-note concurrency, PCM continuity, climax/opening energy, output peak and matched comparison RMS. 51 existing reveal-plan checks and 11 trace/source checks pass. Shared regression suite initially exposed an obsolete legacy schedule expectation; default generator and the harmonic pitch contract were updated, and the affected deterministic schedule/layer tests passed. Browser verified both style choices, real playback, colour recovery and no console errors. Before/after videos exported and saved locally.
