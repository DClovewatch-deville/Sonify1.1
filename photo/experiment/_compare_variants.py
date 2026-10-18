import wave, numpy as np
print('Sample 0, 8 Blueprint variants (final):')
print(f'{"variant":15s}  {"centroid":>10s}  {"RMS":>8s}  {"peak":>8s}')
print('-' * 50)
for v in ['A_bells', 'B_strings', 'C_brass', 'D_woodwind', 'E_purebell', 'F_ethnic', 'G_celestial', 'H_mixed']:
    p = f'D:/Hackathon_SKD_Laptop/MusicPhoto/experiment/dist/sample0-bp-{v}.wav'
    with wave.open(p, 'rb') as w:
        n = w.getnframes()
        pcm = np.frombuffer(w.readframes(n), dtype='<i2').astype(float)
    rms = np.sqrt(np.mean(pcm**2))
    peak = np.max(np.abs(pcm))
    n_fft = min(4096, n)
    spec = np.abs(np.fft.rfft(pcm[:n_fft]))
    freq = np.fft.rfftfreq(n_fft, 1/22050)
    cent = (np.sum(spec*freq) / (np.sum(spec)+1e-9))
    print(f'{v:15s}  {cent:7.0f}Hz  {rms:7.1f}  {peak:5.0f}')
