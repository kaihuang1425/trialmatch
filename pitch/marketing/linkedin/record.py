"""Records the LinkedIn reel (1080x1350, 30 fps, H.264, with sound) from the site's own scenes.

    node trial-match-vercel/scripts/dev.mjs --port 8776      # the site, served locally
    python pitch/marketing/linkedin/record.py                # writes trial-match-agentverse.mp4 and cover.jpg here

Needs Python Playwright with Chromium (`pip install playwright && playwright install chromium`), numpy, and
imageio-ffmpeg (`pip install imageio-ffmpeg`, an ffmpeg build with H.264). Chromium runs as a real window parked
off-screen, so the GPU draws the frames (the 3D scene needs WebGL); nothing appears on screen. Each scene is captured
with Chrome's screencast (about 60-80 frames a second), resampled to an even 30 fps at the scene's playback speed,
and the scenes are joined with short cross-fades.

Sound: music.mp3 runs under the whole video. reel.js logs every character the agent team types and every press in
the scenes, and a keystroke (sfx/key-N.wav) or a tap (sfx/tap.wav) is laid at each one. sfx/slice.py cut those from
the ElevenLabs takes in sfx/.

Change the words on the title and end cards in cards.html; the captions over each scene are in SCENES below.
"""
import argparse
import asyncio
import base64
import json
import pathlib
import random
import shutil
import subprocess
import tempfile
import time
import wave

import imageio_ffmpeg
import numpy as np
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
W, H, FPS, SR = 1080, 1350, 30, 48000
FADE = 0.45                              # seconds of cross-fade between scenes
FR = "{x:40,y:262,w:1000,h:1062}"        # where a zoomed scene sits: under the caption, full width
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
KEY_DB, TAP_DB = -14.0, -10.0            # peak level of one keystroke and one tap, over music levelled to -16 LUFS


def cap(k, t, kc='#A8C7FA'):
    return "REEL.say({k:%r,kc:%r,t:%r})" % (k, kc, t)


# The 3D scene runs in the app: the trial sheet is widened so the viewer renders full size (no blurry zoom of a
# small WebGL canvas), and everything in the sheet except the 3D card is hidden.
APP_3D_CSS = """#scrim{background:#0E0E0F!important;align-items:flex-start!important;padding:262px 40px 0!important}
#scrim .sheet{width:1000px!important;max-width:1000px!important;max-height:none!important;overflow:visible!important;background:transparent!important;padding:0!important;box-shadow:none!important}
#scrim .sheet *:not(:has(.pvbox)):not(.pvbox):not(.pvbox *){display:none!important}
#pv-host .pv-stage{height:760px!important;flex:none!important}"""


async def open_details(page):
    await page.get_by_text('Details', exact=True).first.click()


# Each scene: how to set it up (not recorded), then timed page actions while recording (JavaScript, or a Python
# coroutine taking the page).
#   raw    seconds to record       trim  seconds cut from the start (camera jump, reveals)
#   speed  playback speed-up: one number, or [(from raw second, speed), ...] to ramp it
SCENES = [
    dict(name='title', page='cards', raw=3.4, speed=1.0, trim=0.15, steps=[]),
    dict(name='hero', page='landing-fresh', raw=6.0, speed=1.0, trim=1.05, steps=[]),
    dict(name='phone', raw=13.2, speed=1.5, trim=0.15, steps=[
        (0.0, "REEL.css(''); REEL.matte(null); REEL.cam('.tm .ph'," + FR + ",{s:1.62})"),
        (0.02, cap('For patients', 'An agent checks every trial<br>against the record.')),
        (0.05, "REEL.cam('.tm .ph'," + FR + ",{s:1.71,ms:13000,ease:'cubic-bezier(.3,0,.4,1)'})"),
        (4.4, cap('For patients', 'It asks only what the record<br>can’t answer.')),
        (8.9, cap('For patients', 'Apply in one tap.<br><i>Your name stays hidden.</i>')),
    ]),
    dict(name='relay', raw=9.8, speed=1.6, trim=0.15, steps=[
        (0.0, "REEL.say(null); REEL.css(''); REEL.matte(250, 1110); "
              "REEL.cam(['#agents h2','#agents .relay','#agents p.rv3'],{x:28,y:150,w:1024,h:1050},{s:0.95})"),
        (0.05, "REEL.cam(['#agents h2','#agents .relay','#agents p.rv3'],{x:28,y:150,w:1024,h:1050},{s:1.0,ms:9800,ease:'cubic-bezier(.3,0,.4,1)'})"),
    ]),
    # The hand-off runs fastest while the Researcher reads its sources, and slows for the typing.
    dict(name='team', raw=18.3, speed=[(0, 1.3), (2.6, 1.9), (8.1, 1.35), (14.6, 1.3)], trim=0.15, steps=[
        (0.0, "REEL.matte(null); REEL.css('#team > div > :not(.at){visibility:hidden}'); REEL.cam('.tm .at'," + FR + ")"),
        (0.02, cap('Watch them work', 'Agents hand work<br>to each other.')),
        (2.6, "REEL.cam(['.tm .at-wall','.tm .at-lane.net']," + FR + ",{pad:16,ms:1100})"),
        (2.9, cap('Privacy guard', 'Only public words go online.<br><i>The record stays on the device.</i>', '#6DD58C')),
        (8.1, "REEL.cam(['.tm .at-lane.loc','.tm .at-wall']," + FR + ",{pad:16,ms:1100})"),
        (8.4, cap('Back on the device', 'MedGemma checks the findings<br><i>against the record.</i>', '#6DD58C')),
        (10.2, "REEL.cam('.tm .at-out.mine'," + FR + ",{pad:16,ms:1200})"),
        (11.6, cap('Back on the device', 'And says when the research<br>doesn’t fit.', '#6DD58C')),
        (14.6, "REEL.cam('.tm .at'," + FR + ",{ms:1300})"),
        (14.8, cap('Watch them work', 'Nothing about you<br>went online.')),
    ]),
    # The app's 3D view: its own intro flies from the body to the lungs, a cell and the EGFR protein, then a click
    # on "The drug" flies into the pocket where osimertinib binds (a real crystal structure, labelled as such).
    dict(name='3d', page='app-3d', raw=13.0, speed=1.4, trim=0.35, steps=[
        (0.0, open_details),
        (0.05, cap('In 3D', 'See what the drug targets,<br><i>from the body to the protein.</i>', '#CDB4F0')),
        (8.2, "REEL.point(700, 1300, 0)"),
        (8.4, "REEL.aim('.pvbox .pv-segb', 'The drug')"),
        (9.4, "REEL.press('.pvbox .pv-segb', 'The drug')"),
        (9.55, cap('In 3D', 'And where a drug binds,<br><i>in a real crystal structure.</i>', '#CDB4F0')),
    ]),
    dict(name='clinician', raw=16.4, speed=1.8, trim=0.15, steps=[
        (0.0, "REEL.say(null); REEL.css(''); REEL.cam(['.tm .cw','.tm .sc-steps[data-for=cw]']," + FR + ",{s:2.0})"),
        (0.02, cap('For trial teams', 'A ranked shortlist in minutes,<br><i>not weeks.</i>', '#6DD58C')),
        (0.05, "REEL.cam(['.tm .cw','.tm .sc-steps[data-for=cw]']," + FR + ",{s:2.08,ms:16000,ease:'cubic-bezier(.3,0,.4,1)'})"),
        (6.0, cap('For trial teams', 'Every rule is quoted<br>from the record.', '#6DD58C')),
        (10.9, cap('For trial teams', 'The agents find and check.<br><i>People decide.</i>', '#6DD58C')),
    ]),
    dict(name='end', page='cards-end', raw=4.6, speed=1.0, trim=0.15, steps=[]),
]


class Screencast:
    """Chrome's screencast: every repaint arrives as a JPEG with a timestamp."""

    def __init__(self, ctx, page, folder):
        self.ctx, self.page, self.folder = ctx, page, folder
        self.frames = []           # (chrome timestamp, path, arrival time)

    async def start(self):
        self.folder.mkdir(parents=True, exist_ok=True)
        self.cdp = await self.ctx.new_cdp_session(self.page)
        self.cdp.on('Page.screencastFrame', self._on)
        await self.cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 95, 'maxWidth': W, 'maxHeight': H, 'everyNthFrame': 1})

    def _on(self, ev):
        p = self.folder / ('f%05d.jpg' % len(self.frames))
        p.write_bytes(base64.b64decode(ev['data']))
        self.frames.append((ev['metadata']['timestamp'], p, time.time()))
        asyncio.ensure_future(self.cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']}))

    async def stop(self):
        await self.cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.2)
        await self.cdp.detach()


def frame_times(frames):
    """Chrome's own frame timestamps, which are precise, after dropping the odd frame Chrome stamps out of order
    (it happens right after a camera jump). If too many would go, falls back to when each frame arrived."""
    kept, last = [], float('-inf')
    for f in frames:
        if f[0] > last and 0 <= f[2] - f[0] < 0.3:
            kept.append(f)
            last = f[0]
    if len(kept) >= 0.95 * len(frames):
        return [f[0] for f in kept], kept, 'chrome (%d stray frames dropped)' % (len(frames) - len(kept))
    return [f[2] - 0.015 for f in frames], frames, 'arrival'


def raw_times(sc):
    """The scene second shown in each output frame, at the scene's playback speed (one number or a ramp)."""
    sp = sc['speed'] if isinstance(sc['speed'], list) else [(0, sc['speed'])]
    out, r = [], sc['trim']
    while r < sc['raw']:
        out.append(r)
        r += [s for at, s in sp if at <= r][-1] / FPS
    return out


def encode_scene(frames, t0, sc, out):
    """Resamples the captured frames to an even 30 fps (nearest frame in time) and encodes a near-lossless clip."""
    rt = raw_times(sc)
    ts, frames, how = frame_times(frames)
    print('  %s: clock %s; frames span %.2f..%.2f s' % (sc['name'], how, ts[0] - t0, ts[-1] - t0), flush=True)
    proc = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                             '-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
                             '-c:v', 'libx264', '-preset', 'fast', '-crf', '10',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                             str(out)], stdin=subprocess.PIPE)
    j = 0
    for r in rt:
        t = t0 + r
        while j + 1 < len(ts) and abs(ts[j + 1] - t) <= abs(ts[j] - t):
            j += 1
        proc.stdin.write(frames[j][1].read_bytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit('ffmpeg failed on ' + sc['name'])
    return len(rt) / FPS


def place_cues(cues, t0, sc):
    """Wall-clock sound cues -> seconds into this scene's clip (dropped if they fall in the trimmed start or after the end)."""
    rt = np.array(raw_times(sc))
    ot = np.arange(len(rt)) / FPS
    out = []
    for c in cues:
        r = c['t'] / 1000.0 - t0
        if rt[0] <= r <= rt[-1]:
            out.append([c['k'], float(np.interp(r, rt, ot))])
    return out


def read_wav(path):
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768
        return x.reshape(-1, w.getnchannels())


def sfx_track(clips, total, path):
    """One stereo track holding every keystroke and tap at its place in the final video."""
    keys = [read_wav(p) for p in sorted((HERE / 'sfx').glob('key-*.wav'))]
    tap = read_wav(HERE / 'sfx' / 'tap.wav')
    track = np.zeros((int((total + 1) * SR), 2), dtype=np.float32)
    rnd = random.Random(7)
    offset, last_key, n = 0.0, -1.0, {'key': 0, 'tap': 0}
    for i, c in enumerate(clips):
        for kind, t in sorted(c['cues'], key=lambda x: x[1]):
            at = offset + t
            if kind == 'key':
                if at - last_key < 0.055:   # the site types faster than hands do: about 18 keys a second at most
                    continue
                last_key = at
                s, db = rnd.choice(keys), KEY_DB + rnd.uniform(-2.5, 1.5)
            else:
                s, db = tap, TAP_DB
            a = int(at * SR)
            seg = s[:max(0, min(len(s), len(track) - a))]
            track[a:a + len(seg)] += seg * 10 ** (db / 20)
            n[kind] += 1
        offset += c['dur'] - FADE
    pcm = (np.clip(track[:int(total * SR)], -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return n


def join(clips, out, music, sfx):
    """Cross-fades the scene clips into the final MP4. Music runs under it (cut to length, faded, levelled to
    -16 LUFS, what feeds expect); the keystrokes and taps sit on top; a limiter keeps the peaks under -1.5 dB."""
    total = sum(c['dur'] for c in clips) - FADE * (len(clips) - 1)
    args = [FFMPEG, '-y', '-loglevel', 'error']
    for c in clips:
        args += ['-i', str(c['path'])]
    parts = ['[%d:v]settb=AVTB,setpts=PTS-STARTPTS,fps=%d[s%d]' % (i, FPS, i) for i in range(len(clips))]
    prev, offset = '[s0]', 0.0
    for i in range(1, len(clips)):
        offset += clips[i - 1]['dur'] - FADE
        lab = '[v%d]' % i
        parts.append('%s[s%d]xfade=transition=fade:duration=%s:offset=%.3f%s' % (prev, i, FADE, offset, lab))
        prev = lab
    maps = ['-map', prev]
    audio = []
    if music:
        args += ['-i', str(music)]
        parts.append('[%d:a]atrim=0:%.3f,asetpts=PTS-STARTPTS,apad=whole_dur=%.3f,afade=t=in:d=0.4,afade=t=out:st=%.3f:d=2.5,'
                     'loudnorm=I=-16:TP=-2:LRA=11,aresample=%d[m]' % (len(clips), total, total, total - 2.5, SR))
        audio.append('[m]')
    if sfx:
        args += ['-i', str(sfx)]
        parts.append('[%d:a]aresample=%d[x]' % (len(clips) + (1 if music else 0), SR))
        audio.append('[x]')
    if audio:
        parts.append('%samix=inputs=%d:normalize=0:duration=first,alimiter=limit=0.84:level=false[a]' % (''.join(audio), len(audio)))
        maps += ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k']
    args += ['-filter_complex', ';'.join(parts)] + maps + [
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
             '-x264-params', 'aq-mode=3', '-r', str(FPS),
             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
             '-movflags', '+faststart', '-t', '%.3f' % total, str(out)]
    subprocess.run(args, check=True)
    return total


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:8776', help='where the site is served')
    ap.add_argument('--out', default=str(HERE / 'trial-match-agentverse.mp4'))
    ap.add_argument('--work', default=str(pathlib.Path(tempfile.gettempdir()) / 'trial-match-reel'), help='scratch folder for frames and clips')
    ap.add_argument('--only', default='', help='comma-separated scene names, to re-take a few (keeps the other clips)')
    ap.add_argument('--keep', action='store_true', help='keep the frame folders')
    ap.add_argument('--music', default=str(HERE / 'music.mp3'), help='soundtrack (ElevenLabs Music); empty for none')
    ap.add_argument('--no-sfx', action='store_true', help='leave out the keystrokes and taps')
    a = ap.parse_args()
    work = pathlib.Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, a.only.split(',')))
    cards = (HERE / 'cards.html').as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--window-position=-4000,0', '--hide-scrollbars', '--force-color-profile=srgb'])
        ctx = await browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        page = await ctx.new_page()
        # Warm the cache (fonts, hero photos) so nothing pops in while recording.
        for url in (a.base + '/', cards + '?c=title', cards + '?c=end'):
            await page.goto(url, wait_until='networkidle')
            await page.evaluate('document.fonts.ready.then(() => 1)')
        on = None                      # which page is loaded and ready: 'landing' or 'app'
        clips = []
        for sc in SCENES:
            clip, meta = work / (sc['name'] + '.mp4'), work / (sc['name'] + '.json')
            if only and sc['name'] not in only:
                if not clip.exists() or not meta.exists():
                    raise SystemExit('No earlier take of %s; run without --only first' % sc['name'])
                clips.append(dict(path=clip, **json.loads(meta.read_text())))
                continue
            kind = sc.get('page', 'landing')
            if kind.startswith('cards'):
                await page.goto(cards + ('?c=end' if kind == 'cards-end' else '?c=title'), wait_until='commit')
                await page.evaluate("document.body.style.visibility='hidden'")   # held until the screencast runs
                await page.wait_for_load_state('networkidle')
                await page.evaluate('document.fonts.ready.then(() => 1)')
                on = None
            elif kind == 'landing' and on != 'landing':
                await page.goto(a.base + '/', wait_until='networkidle')
                await page.wait_for_timeout(2500)
                await page.add_script_tag(path=str(HERE / 'reel.js'))
                on = 'landing'
            elif kind == 'app-3d':
                await page.goto(a.base + '/app/', wait_until='networkidle')
                await page.wait_for_timeout(2000)
                await page.get_by_role('button', name='I’m a patient').click()
                await page.wait_for_timeout(300)
                await page.get_by_text('Mei L.').first.click()
                await page.wait_for_timeout(2500)
                await page.add_style_tag(content=APP_3D_CSS)
                await page.add_script_tag(path=str(HERE / 'reel.js'))
                await open_details(page)                    # load the 3D library and structures once, untimed ...
                await page.wait_for_timeout(2500)
                await page.evaluate("document.querySelector('#scrim [data-act=close]').click(); sessionStorage.removeItem('pv-zoom-seen')")
                await page.wait_for_timeout(500)            # ... then close it, so the intro plays again on camera
                on = 'app'
            if on in ('landing', 'app'):
                await page.evaluate('REEL.take()')          # forget cues from the setup

            folder = work / sc['name']
            shutil.rmtree(folder, ignore_errors=True)
            rec = Screencast(ctx, page, folder)
            await rec.start()
            await asyncio.sleep(0.25)          # let the first frame land
            start, start_wall = time.perf_counter(), time.time()
            if kind.startswith('cards'):
                # Restart the card's CSS animations from zero, now that frames are being captured.
                await page.evaluate("document.body.style.visibility='';document.getAnimations().forEach(a=>{a.cancel();a.play()})")
            elif kind == 'landing-fresh':
                await page.goto(a.base + '/', wait_until='commit')
            for at, act in sorted(sc['steps'], key=lambda s: s[0]):
                wait = start + at - time.perf_counter()
                if wait > 0:
                    await asyncio.sleep(wait)
                await (page.evaluate(act) if isinstance(act, str) else act(page))
            wait = start + sc['raw'] - time.perf_counter()
            if wait > 0:
                await asyncio.sleep(wait)
            await rec.stop()
            cues = await page.evaluate('REEL.take()') if on in ('landing', 'app') else []
            if kind == 'landing-fresh':
                await page.wait_for_load_state('networkidle')
                await page.add_script_tag(path=str(HERE / 'reel.js'))
                on = 'landing'
            # Screencast timestamps are wall-clock seconds, so the scene's zero is the wall time when its steps began.
            frames = rec.frames
            dur = encode_scene(frames, start_wall, sc, clip)
            info = dict(dur=dur, cues=place_cues(cues, start_wall, sc))
            meta.write_text(json.dumps(info))
            clips.append(dict(path=clip, **info))
            print('%-10s %5d frames captured, %4.1f s clip, %d sound cues' % (sc['name'], len(frames), dur, len(info['cues'])), flush=True)
            # Cover image for the LinkedIn post: the title card once it has settled.
            if sc['name'] == 'title':
                shutil.copy(frames[-1][1], HERE / 'cover.jpg')
        await browser.close()

    total = sum(c['dur'] for c in clips) - FADE * (len(clips) - 1)
    music = pathlib.Path(a.music) if a.music else None
    sfx = None
    if not a.no_sfx:
        sfx = work / 'sfx.wav'
        n = sfx_track(clips, total, sfx)
        print('sound effects: %d keystrokes, %d taps' % (n['key'], n['tap']))
    join(clips, a.out, music if music and music.exists() else None, sfx)
    print('Wrote %s (%.1f s)' % (a.out, total))
    if not a.keep:
        for sc in SCENES:
            shutil.rmtree(work / sc['name'], ignore_errors=True)


if __name__ == '__main__':
    asyncio.run(main())
