"""Cuts the ElevenLabs sound effects into single hits: every keystroke in typing-raw.mp3 becomes key-N.wav, and the
loudest click in tap-raw.mp3 becomes tap.wav. Each hit is peak-normalised to -1 dBFS; record.py sets the volume."""
import pathlib
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
SR = 48000


def load(path):
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def save(path, x):
    x = x / max(1e-9, np.abs(x).max()) * 10 ** (-1 / 20)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def onsets(x, gap=0.06, rel=0.25):
    env = np.abs(x).max(axis=1)
    k = int(0.003 * SR)
    env = np.convolve(env, np.ones(k) / k, mode='same')
    thr = env.max() * rel
    out, last = [], -10 ** 9
    for i in np.flatnonzero((env[1:] >= thr) & (env[:-1] < thr)) + 1:
        if i - last >= gap * SR:
            out.append(i); last = i
    return out, env


def cut(x, i, pre=0.004, post=0.11):
    a, b = max(0, i - int(pre * SR)), min(len(x), i + int(post * SR))
    seg = x[a:b].copy()
    fade = int(0.03 * SR)
    seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
    seg[:int(pre * SR)] *= np.linspace(0, 1, int(pre * SR))[:, None]
    return seg


keys = load(HERE / 'typing-raw.mp3')
on, env = onsets(keys)
hits = sorted(on, key=lambda i: -env[i:i + int(0.02 * SR)].max())[:8]   # the clearest keystrokes
for old in HERE.glob('key-*.wav'):
    old.unlink()
for n, i in enumerate(sorted(hits)):
    save(HERE / ('key-%d.wav' % (n + 1)), cut(keys, i))
tap = load(HERE / 'tap-raw.mp3')
on, env = onsets(tap, rel=0.4)
best = max(on, key=lambda i: env[i:i + int(0.02 * SR)].max())
save(HERE / 'tap.wav', cut(tap, best, post=0.16))
print('keys: %d onsets found, %d kept; tap: %d onsets' % (len(onsets(keys)[0]), len(hits), len(on)))
