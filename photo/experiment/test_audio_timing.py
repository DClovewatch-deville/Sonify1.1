"""Check that short notes survive offline SoundFont rendering at their time."""
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

import run  # registers the experiment/vendor dependency directory
from render_soundfont import HAVE_TSF, find_soundfont, render_wav


class AudioTiming(unittest.TestCase):
    @unittest.skipUnless(HAVE_TSF and find_soundfont(), 'local SoundFont unavailable')
    def test_subsecond_note_is_audible_at_its_scheduled_start(self):
        rate = 22050
        note = dict(start=.38, duration=.18, pitch=60, program=0,
                    velocity=95, voice=0)
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'timing.wav'
            render_wav([note], target, total_seconds=1.0, rate=rate)
            with wave.open(str(target)) as wav:
                samples = np.frombuffer(wav.readframes(wav.getnframes()),
                                        dtype='<i2').reshape(-1, wav.getnchannels())
        self.assertLessEqual(np.max(np.abs(samples[:int(.35 * rate)].astype(float))), 1)
        self.assertGreater(np.sqrt(np.mean(samples[int(.42 * rate):
                                                   int(.52 * rate)].astype(float) ** 2)), 100)

    @unittest.skipUnless(HAVE_TSF and find_soundfont(), 'local SoundFont unavailable')
    def test_reused_synth_does_not_leak_previous_stem(self):
        rate = 22050
        with tempfile.TemporaryDirectory() as folder:
            first = Path(folder) / 'first.wav'
            second = Path(folder) / 'second.wav'
            render_wav([dict(start=0, duration=.18, pitch=60,
                             program=0, velocity=95, voice=0)],
                       first, total_seconds=1.0, rate=rate)
            render_wav([dict(start=.38, duration=.18, pitch=64,
                             program=0, velocity=95, voice=0)],
                       second, total_seconds=1.0, rate=rate)
            with wave.open(str(second)) as wav:
                samples = np.frombuffer(wav.readframes(wav.getnframes()),
                                        dtype='<i2').reshape(-1, wav.getnchannels())
        self.assertLessEqual(np.max(np.abs(samples[:int(.35 * rate)].astype(float))), 1)


if __name__ == '__main__':
    unittest.main()
