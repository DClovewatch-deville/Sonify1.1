# Soul Symphony visual experience v1.0

The former birth demo rotated role highlights every 3.2 seconds. It did not
explain the conversion or audition a phrase, and the source/score could be
outside the viewport. The new dialog keeps three stages together:

1. Trace and zoom the actual source path, with the actual sampled points.
2. Move those sample positions into the final note pitch contour.
3. Move real note events into a phrase view and audition the original voice stem.

Three examples (spine, pattern, support) take 11.7 seconds after audio loads.
The demo uses the current sample's note, phrase and source IDs. The sound is a
slice of its rendered voice WAV, not an unrelated generated melody. Closing,
Escape, replay and sample/mode changes cancel scheduled demo audio. Playback
is paused on entry; the user can return or explicitly play the shown phrase.

Arrangement now includes a small source preview, with actual sounding source
paths in matching voice colours, current role/pitch text, and an explicit
return-to-follow control for pinned selections. Sounding notes glow in Piano
Roll and Staff. Playback follows the audio rather than staying pinned to a
previous selection. Staff hit-testing uses its own note coordinates.

Motif Development is a four-stage journey with a source path thumbnail and
actual notes for each section. Clicking a stage seeks to that section.
Audio decoding is cached so seeks and repeated auditions reuse PCM.

## Scope and evidence

This change presents the current DS composition and its existing provenance.
It does not add object recognition or change the composer's music. Mapping
includes scale, register and harmonic processing; the guide labels those steps
rather than claiming that the raw contour alone equals the final pitches.

The current composition still selects one hero group per voice. A window
fragment can therefore be labelled as the main structural role. That is a
remaining material-selection limitation; expanding the animation is not a
replacement for improving the selected musical source material.

UI assets live under `ui/`; `build_studio.py` also copies `soul_experience.js`
into `dist/`. Verification: JS syntax checks, 46 Python regression tests,
desktop/narrow viewport review, demo completion/close/replay, playback,
solo/mute, section and view switching, and a second sample.

## v1.0.1 — focus + hero source (targeted, no visual restructure)

Two focused fixes on top of v1.0, keeping the existing look:

1. **Calmer rest state (①).** Previously at rest (t=0) several structures and
   the "sounding source" lines lit up at once, so the building showed three
   colours before playback. Now the building stays a faint grey until you play
   or select a structure; the sounding-source lines are drawn only during
   playback. Selecting a structure still focuses image + Piano Roll together.
2. **Richer, legible hero source (③).** `structures[].geometry_ids` already
   carries the whole hero region (e.g. 258 paths for the spine, 745 for
   support); the birth demo now shows that **region faintly** and the actually
   **traced path brightly** (thin context + bright trace), zooming on the
   traced path. The panel label reads e.g. “主体结构 区域 258 条结构线 · 追踪 1
   条来源路径”. `miniGeometry` gained `lw/blur/alpha` so the region reads as
   context rather than a solid blob.

Residual limitation (unchanged): each voice still uses one representative path
for its motif, so the traced line is the longest available fragment rather than
a hand-picked semantic curve.

## v1.1 — multi-path hero (stitching)

- **Hero curve = stitched multi-path polyline.** `soul_composition._stitch_curve`
  chains the longest paths of each voice's hero group by nearest endpoints into
  one polyline, and `_sample_curve` samples it; every sampled note still traces
  back to a real source path. A melody phrase now references several paths
  (e.g. `b00005` + `b00022`) instead of one fragment, so the demo's traced line
  and the melody contour are built from a fuller structure.
- **Brighter hero region in the demo**: the source panel's region lines went from
  alpha .30 / 1.0px to alpha .62 / 1.6px so the surrounding structure reads
  clearly; the traced stitched path stays bright (3.2px + glow).
- **Colours kept at rest**: the structure colours are shown again when idle
  (the earlier grey-out was reverted per review).
