# Soul Symphony — arrangement notes

The Soul mode presents a deterministic, motif-driven piece over a
C-pentatonic field. This file records what each revision changed.

## v0.9 — Geometry → Music traceability (the "soul" of the mode)

Implements the P0 of the latest GPT review: the causal chain
*Geometry → Motif → Music* must be **seen during playback**.

- **Motif transformation** (not group switching): each voice keeps one HERO
  motif; A states it (原形), B retrogrades it (逆行), C fragments/reorders and
  augments it (展开), A′ returns it with an octave lift (回归). Voices enter and
  exit per section (A: melody+pad+ambience · B: +rhythm, −ambience ·
  C: all · A′: −rhythm) so nothing drones start-to-finish.
- **Visual-structure roles** (work for complex/abstract images too, no semantics):
  主体结构 spine → 主旋律 · 重复结构 pattern → 节奏织体 ·
  支撑结构 support → 低音/和声 · 背景纹理 texture → 环境氛围.
  Each note carries `structure`; the payload exposes `structures` with each
  role's colour and `geometry_ids` (its hero region).
- **Synchronised highlight** (the core feature): during playback the current
  structure's geometry lights up on the building (colour + glow) while the rest
  dims to a faint grey (25–35 %), and the matching notes light up in the Piano
  Roll. Selecting a structure row focuses both the image and the roll; clicking
  a note highlights its source geometry and vice-versa.
- **Main-interface summary** replaces the open log: “系统如何理解这张图？” with
  four rows (structure → music role). The detailed per-note trace is demoted to
  a collapsed advanced panel.
- **8–12 s explanatory animation** (“观看音乐如何诞生”): highlights 主体 → 重复 →
  支撑 in turn, each with its caption — a state-change animation, not a video.
- **Unified colour semantics** across image / voice list / Piano Roll.

## v0.8 — anchor notes, phrase development, harmony planner


Implements the P0 items of the *Soul Symphony v2.0 工程整改任务书*.

- **P0.1 Anchor notes.** Every note carries `note_role` ∈
  {anchor, variation, harmony, ornament, ambient}. Melody notes that come
  straight from the geometry contour are **anchors**; development/bridge notes
  are **variation**; the accompaniment voices are harmony/ornament/ambient.
  Notes also carry `motif_id`, `section_id`, `voice_id`, `parent_note_id`.
- **P0.2 Phrase Development Engine.** A per-section `MELODY_PLAN` states /
  rests / dialogues / augments / recapitulates the motif (A: statement+response,
  B: contrast + call-and-answer with the rhythm voice, C: fragmentation +
  augmentation + climax, A′: return + cadence). Real **rests** give the line
  breathing (melody silent ~35 % of the timeline).
- **P0.3 Harmony Planner.** A chord per bar from a per-section progression,
  smooth **voice leading** (each chord tone chosen to move least from the
  previous one), and half/authentic **cadences** (B ends on V, A′ ends V→I).
  Two styles ship: `east` (pentatonic open/quartal) and `west` (functional
  major-key triads/sevenths).
- **P0.4 Five real voice roles.** melody (anchors/phrases), rhythm-response
  (stays quiet under the melody in B — answers in the gaps), bass (root with
  stepwise connection), harmony (voice-led chord bed), ambience (open tones).
- **P0.5 Section differentiation** by content, not volume/register alone.

### UI
- The thin composition timeline becomes a real **multi-voice MIDI Piano Roll**
  (pitch axis with C-labels, bar lines, A/B/C/A′ bands, real note lengths,
  playhead sync, click a note to trace it), plus a **Motif Development** view
  showing each geometry motif and how it is transformed in every section, and a
  **Staff** view (treble melody + bass, engraved from the real pitches and
  durations with stems, hollow/filled heads and ledger lines).
- **Phrase dynamics**: a per-section velocity arc (A/B build, C is the climax,
  A′ eases into the cadence) on top of the bar/beat accents.

### Verification
- 46 tests pass. Objective audio (sample5): overlap ≤ 6, melody same-pitch
  ~13 %, dynamic range 17.9 dB, chords I/vi/IV/V/ii/iii, roles present.

## v0.7 — motif-driven, register-layered, harmonised


Implements the three fixes identified by comparing the arrangement against
Grieg's *Morning Mood* (Western) and *春江花月夜* (Eastern) and the music-theory
brief in `Basic Theory of Music/`.

1. **Melody (voice 0).** Each structural group's representative path supplies
   an 8-point contour, reduced to a short stepwise **motif** that is then
   *developed*: original in A/A′, **retrograde (逆行)** in B, **sequence one
   degree up (上移一级)** in C. Bigger contour jumps become wider intervals.
   Downbeats and the phrase-final note land on **chord tones**; inner beats
   carry passing tones. Result: same-pitch repetition fell from ~95 % to
   ~13–17 %, and successive intervals now span roughly ±2…±7 semitones.
2. **Register layering.** The five tracks occupy distinct octaves so they stop
   colliding in one low cluster — bass 38–48, harmony 48–59, accompany 57–66,
   rhythm 63–70, melody 69–84 (full C2–C6 pentatonic ladder `studio_grammar.PENTA`).
3. **Harmony.** A fixed chord per bar over a c-pentatonic vocabulary
   (I / vi / IV / V / ii / iii); bass plays the root, harmony holds two chord
   tones, rhythm arpeggiates chord tones; sustained parts sit on chord tones.
   Section A′ ends on an authentic **V→I** cadence.

Form: 32 bars at 92 BPM (≈ 83.5 s), four sections **A / B / C / A′**, with A and
A′ sharing the same motif sequence (true recapitulation).

Provenance is unchanged: `group.sources -> representative source -> motif ->
phrase -> section -> note`. Whole-group highlighting marks the current phrase;
it does not claim every highlighted fragment is a separate sounding note.

## Limits

- Spatial groups are geometric candidates; subject/background still comes from
  the length/centrality heuristic. No semantic building/tree/roof segmentation
  or depth inference.
- One representative path supplies each group's motif; the rest of the group is
  context. The arrangement is deterministic with fixed section/instrument
  templates.
- Rests, phrase-level crescendo and a longer form (the "breathing space" the
  reference pieces have) are **not** in v0.7 yet — the next step.
- Blueprint keeps its spatial graphic-score task; Progressive keeps its
  six-stage introduction.

## v0.6 — four-section composition (previous)

Introduced the 32-bar A/B/C/A′ form, 3×3 spatial-cell grouping, phrase-level
region highlights, a five-track timeline with solo/mute, and the expandable
Composition Journey panel.

## Validation

`test_studio.py` checks determinism, provenance (pitch == PENTA[final_index],
source points on real segments), phrase/section bounds, scale mapping, group
coverage, motif return in A′, same-pitch retrigger isolation, polyphony ≤ 6,
audio format/headroom, and Blueprint/Progressive contracts. `test_audio_timing.py`
checks short notes survive offline SoundFont rendering. Browser review covers
playback, section navigation, solo/mute, trace expansion and mode switching.
