# Progressive Revelation exhibition v1

2026-10-17

Implemented the P0 scope from 0115.docx. Soul composition and presentation logic are unchanged except common mode routing. Progressive now has its own renderer and geometry reveal plan instead of the old full-image background and scan cursor.

Every drawable contour gets revealStage, revealGroup, start and end derived from actual geometry length, centrality, subject/background metadata and spatial neighbours. The first stage ranks salient long contours; the second adds major structures; the third adds secondary spatial geometry; the fourth adds remaining details. These are geometric heuristics, not semantic object segmentation or true depth recovery. No paths are invented. All source contours appear in the completed frame, including contours outside the classified music units.

The existing 36-second audio and MIDI are reused unchanged. Four visual stages start at 0, 6, 18 and 24 seconds, matching existing voice-entry boundaries. At 30 seconds all geometry is complete; the existing final ensemble continues until 36 seconds. Completed paths persist, current paths draw on by actual cumulative polyline length, and unrevealed paths are hidden. Current sounding source paths only glow after their geometry has been revealed. The completion moment includes a restrained luminance lift and FROM GEOMETRY → MUSIC. No scan line is drawn.

The default screen hides Mapping/IDs/MIDI/technical logs and old six-chapter controls. Four stage controls support deterministic seeking and replay. Final mapping details are available after playback. Enlarged exhibition mode offers a large dark artwork, four progress indicators and transport; Escape exits. Wide-aspect inputs use right-to-left group ordering, but no dedicated scroll asset/showcase or semantic landscape recognizer has been added.

Validation: 51 plan checks across all six sample images plus all-background and wide-aspect fixtures; exact source vertex identity, complete coverage, no duplicate paths, four populated stages, empty opening, hidden majority in first stage, completion before final ensemble. Existing 11 source/trace checks also pass. Browser verified real 36-second playback, completion, backward seeking, second sample, final details, three-mode switching, and mobile exhibition width without overflow. Browser error log empty. Screenshots: progressive-start-v1.png and progressive-complete-v1.png.
