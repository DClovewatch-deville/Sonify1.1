# Soul interaction v12

2026-10-16

Source and Piano Roll now audition the actual phrase for the selected voice. Source hit testing uses real path segments with a 9 CSS pixel tolerance, respects zoom/pan, and selects the phrase in the original current section. Blank clicks do not select distant notes.

Preview uses the existing rendered voice stem at the phrase timestamp (maximum 5.5 seconds). It is a phrase excerpt, not resynthesis of an isolated individual note. Main score position and solo/mute state are saved. Continue restores the score position; preview does not overwrite voice settings. Repeated previews cancel previous audio. Mode/sample/edition/transport changes cancel preview.

The stage now places the interactive image beside the Piano Roll. The former duplicate large image is hidden in Soul only. Source zoom 100–300%, fit and drag are provided. Voice solo/mute and alternative score views remain available in disclosures. Mapping details remain folded by default.

Validation: 4 Node checks cover section selection, blank hit rejection, zoom/pan coordinates and preserving original section context. Browser verified source click, reverse note click, replay, resume, zoom, mode switching and birth dialog. 390px responsive check found no horizontal overflow. Browser error log empty. Existing composition and birth-animation algorithms retained in this iteration.


## 2026-10-17 region feedback correction

Restored full structure-role and group highlights alongside precise note paths. Playback and reverse note selection now show the entire region with a stronger source path and a labelled source marker. All extracted group paths can be hit-tested; unused groups audition a related voice and are explicitly labelled as an association, not direct note provenance. No new notes are invented. The fitted view respects both viewport height and width; zoomed reverse note selections reveal the source automatically. Six hit-testing checks pass, including unused-group selection and distinguishing associated sources. Browser verified a harmony note illuminates a large purple region and clicking previously inactive background lines triggers a labelled related-voice preview.
