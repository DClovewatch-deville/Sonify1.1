# Soul Hero Interaction

2026-10-17

Scope follows the high-return final pass in 0048.docx: larger source, real path tracing, corresponding notes highlighted, and one-click immersive prologue into the current composition. Composition generation and score engraving are unchanged.

The ordinary source/score split is 42/58. Focus mode expands the stage to the viewport with a 45/55 split, a larger fitted source, a matching-height score, exit button and Escape handling. Narrow screens stack source and score. Birth animation uses a larger source next to the motif and actual phrase, then auto-enters the same immersive player when enabled.

Source tracing uses cumulative polyline length, not vertex count, preserving bends and unequal segment lengths. Whole-region context remains. During playback one real phrase per bar is chosen across audible voices; its actual source paths are traced with the phrase timeline. The corresponding Piano Roll notes glow when their actual times sound. A short arrow links the real source_point to the corresponding Piano Roll onset/pitch. No fabricated notes or new semantic labels are used. Labels distinguish melodic quantization from chord-root/voicing/response/texture rules. Reduced-motion preferences disable moving arrows and progressive tracing.

New source files: ui/soul_hero.js. build_studio.py includes the new file in output copies. Node checks cover empty/full/partial tracing and preservation of bends. Existing source hit-testing checks remain.

Validation completed: 5 tracing checks and 6 source hit-testing checks passed. Browser verified one-click prologue auto-transition into playing, direct-note arrow and source highlighting, focus exit button, Escape, normal Progressive mode switching, and 390px focus layout without horizontal overflow (clientWidth = scrollWidth = 363). No browser errors observed. Temporary viewport reset. Screenshot: soul-hero-v14.png.


## Geometry exhibition revision v15

Immersive mode is now a native modal dialog occupying 94% viewport height, with a dimmed and blurred backdrop. It shows only the fitted geometry artwork, structural colours and animated real source lines; Piano Roll, causal labels and side panels remain in the underlying normal interface. A compact transport and close button are retained. Entering directly starts playback. Existing source canvas and transport are temporarily moved and restored to their current original positions on exit, preserving event listeners and playback state. Escape and backdrop click close the exhibit. The modal traps focus through native dialog behaviour. Verified returning player/source to Soul stage, repeated open/close, Escape, playback pause and mobile dimensions without internal overflow (372x791). Existing 11 geometry and interaction checks pass; browser errors empty. Screenshot: soul-exhibition-v15.png.
