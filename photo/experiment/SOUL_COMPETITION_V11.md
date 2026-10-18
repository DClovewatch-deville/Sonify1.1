# Soul Symphony competition experience

This iteration follows `GPT_Advice/产品建议/2039.docx` and `2118.docx`.
The priorities are musical development, continuous provenance during playback,
and completing the audience experience within approximately one minute.

## Delivered

- Full composition: 32 bars at 92 BPM, 83.48 seconds. Competition edition:
  18 bars, 46.96 seconds. The cut contains four A bars, four B bars, six C
  bars, and the last four A′ bars, including the new final cadence.
- The competition cut copies real note/phrase IDs and source geometry.
  `source_time` stores the original full-score onset. Each edition has its
  own rendered stems, MIDI, source timeline and stereo reference mix.
- Bass now targets actual chord roots, fifths and connections. A uses longer
  notes, B uses harmonic movement, C uses a denser connecting line, and the
  end slows to sustained roots. Harmony voice leading chooses distinct tones
  instead of collapsing multiple voices onto the same pitch.
- C has higher dynamics and density. The response part enters in melodic
  rests; its rhythms alternate. A′ includes an audible final melody on C,
  a root bass and a three-tone tonic voicing.
- Browser playback uses five equal-power pan positions and a gentle master
  compressor. Stereo reference WAVs are available in the advanced download
  panel. Those reference WAVs use the same gains and pans, without the
  browser's master compressor. MIDI carries pan controllers.
- The source occupies about 30% of the desktop arrangement area. Its current
  geometry, all sounding role labels, Piano Roll and voice controls follow
  the same clock. Clicking a note pauses at its real onset and pins its source.
- The birth guide progressively traces paths, reveals sample/pitch points,
  and plays the actual voice excerpt. The checked continuation option closes
  the guide and starts the chosen edition in the main Piano Roll.
- Motif Development shows actual two-bar multivoice windows, using a common
  pitch scale and real note durations. A′ shows the final cadence window.
- Staff uses the real events of all five voices on two staves, with colour,
  voice labels, 4/4, bar lines and playhead. Piano Roll remains the default.
- Path stitching now limits gaps and rejects incompatible endpoint directions.
  The lead role prioritises long contours over total texture length. No semantic object segmentation was added.

## Validation

The existing 46 tests plus cut/cadence, bass/harmony, and crossing-path checks
pass (49 checks total). Cut tests cover all six samples, timing, provenance,
rendered stem duration and final tonic. JS syntax and Git whitespace checks
are also part of verification.

For sample 5's competition stereo reference mix: peak 0.3000, left/right correlation 0.9907. Section RMS: A 0.0556, B 0.0601, C 0.0733, A′ 0.047. These describe measurable level/space changes, not subjective musical quality.

The composition still uses a small set of geometric hero groups and rule
templates with GM instruments. Source-role naming describes visual functions;
it does not prove that a roof, tree or other object was semantically recognised.
