"""Records the LinkedIn reel (1080x1350, 30 fps, H.264) from the landing page's own scenes.

    node trial-match-vercel/scripts/dev.mjs --port 8776      # the site, served locally
    python pitch/marketing/linkedin/record.py                # writes trial-match-agentverse.mp4 and cover.png here

Needs Python Playwright with Chromium (`pip install playwright && playwright install chromium`) and imageio-ffmpeg
(`pip install imageio-ffmpeg`, an ffmpeg build with H.264). Chromium runs as a real window parked off-screen, so the GPU
draws the frames; nothing appears on screen. Each scene is captured with Chrome's screencast (about 80 frames a second),
resampled to an even 30 fps (optionally sped up), and the scenes are joined with short cross-fades.

Change the words on the title and end cards in cards.html; the captions over each scene are in SCENES below.
"""
import argparse
import asyncio
import base64
import pathlib
import shutil
import subprocess
import tempfile
import time

import imageio_ffmpeg
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
W, H, FPS = 1080, 1350, 30
FADE = 0.45                              # seconds of cross-fade between scenes
FR = "{x:40,y:262,w:1000,h:1062}"        # where a zoomed scene sits: under the caption, full width
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def cap(k, t, kc='#A8C7FA'):
    return "REEL.say({k:%r,kc:%r,t:%r})" % (k, kc, t)


# Each scene: how to set it up (not recorded), then timed page actions while recording.
#   raw   seconds to record      speed  playback speed-up      trim  seconds cut from the start (camera jump, reveals)
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
    dict(name='relay', raw=9.8, speed=1.15, trim=0.15, steps=[
        (0.0, "REEL.say(null); REEL.css(''); REEL.matte(250, 1110); "
              "REEL.cam(['#agents h2','#agents .relay','#agents p.rv3'],{x:28,y:150,w:1024,h:1050},{s:0.95})"),
        (0.05, "REEL.cam(['#agents h2','#agents .relay','#agents p.rv3'],{x:28,y:150,w:1024,h:1050},{s:1.0,ms:9800,ease:'cubic-bezier(.3,0,.4,1)'})"),
    ]),
    dict(name='team', raw=18.3, speed=1.2, trim=0.15, steps=[
        (0.0, "REEL.matte(null); REEL.css('#team > div > :not(.at){visibility:hidden}'); REEL.cam('.tm .at'," + FR + ")"),
        (0.02, cap('Watch them work', 'Agents hand work<br>to each other.')),
        (2.6, "REEL.cam(['.tm .at-wall','.tm .at-lane.net']," + FR + ",{pad:16,ms:1100})"),
        (2.9, cap('Privacy guard', 'Only public words go online.<br><i>The record stays on the device.</i>', '#6DD58C')),
        (8.1, "REEL.cam(['.tm .at-lane.loc','.tm .at-wall']," + FR + ",{pad:16,ms:1100})"),
        (8.4, cap('Back on the device', 'MedGemma reads the findings<br><i>against the record.</i>', '#6DD58C')),
        (10.2, "REEL.cam('.tm .at-out.mine'," + FR + ",{pad:16,ms:1200})"),
        (10.5, cap('Back on the device', 'And says when the research<br>doesn’t fit.', '#6DD58C')),
        (14.6, "REEL.cam('.tm .at'," + FR + ",{ms:1300})"),
        (14.8, cap('Watch them work', 'Nothing about you<br>went online.')),
    ]),
    dict(name='clinician', raw=16.4, speed=1.65, trim=0.15, steps=[
        (0.0, "REEL.css(''); REEL.cam(['.tm .cw','.tm .sc-steps[data-for=cw]']," + FR + ",{s:2.0})"),
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
        self.frames = []           # (timestamp, path)

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


def encode_scene(frames, t0, sc, out):
    """Resamples the captured frames to an even 30 fps (nearest frame in time) and encodes a near-lossless clip."""
    n = int(round((sc['raw'] - sc['trim']) / sc['speed'] * FPS))
    ts, frames, how = frame_times(frames)
    print('  %s: clock %s; frames span %.2f..%.2f s' % (sc['name'], how, ts[0] - t0, ts[-1] - t0), flush=True)
    proc = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                             '-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
                             '-c:v', 'libx264', '-preset', 'fast', '-crf', '10',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                             str(out)], stdin=subprocess.PIPE)
    j = 0
    for k in range(n):
        t = t0 + sc['trim'] + k * sc['speed'] / FPS
        while j + 1 < len(ts) and abs(ts[j + 1] - t) <= abs(ts[j] - t):
            j += 1
        proc.stdin.write(frames[j][1].read_bytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit('ffmpeg failed on ' + sc['name'])
    return n / FPS


def join(clips, out, music=None):
    """Cross-fades the scene clips into the final MP4, with the music under it if there is a track: cut to the video's
    length, faded in and out, and levelled to -16 LUFS (what feeds expect)."""
    total = sum(d for _, d in clips) - FADE * (len(clips) - 1)
    args = [FFMPEG, '-y', '-loglevel', 'error']
    for c, _ in clips:
        args += ['-i', str(c)]
    if music:
        args += ['-i', str(music)]
    parts = ['[%d:v]settb=AVTB,setpts=PTS-STARTPTS,fps=%d[s%d]' % (i, FPS, i) for i in range(len(clips))]
    prev, offset = '[s0]', 0.0
    for i in range(1, len(clips)):
        offset += clips[i - 1][1] - FADE
        lab = '[v%d]' % i
        parts.append('%s[s%d]xfade=transition=fade:duration=%s:offset=%.3f%s' % (prev, i, FADE, offset, lab))
        prev = lab
    maps = ['-map', prev]
    if music:
        parts.append('[%d:a]atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=%.3f:d=2.5,'
                     'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]' % (len(clips), total, total - 2.5))
        maps += ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k']
    args += ['-filter_complex', ';'.join(parts)] + maps + [
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
             '-x264-params', 'aq-mode=3', '-r', str(FPS),
             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
             '-movflags', '+faststart', str(out)]
    subprocess.run(args, check=True)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:8776', help='where the site is served')
    ap.add_argument('--out', default=str(HERE / 'trial-match-agentverse.mp4'))
    ap.add_argument('--work', default=str(pathlib.Path(tempfile.gettempdir()) / 'trial-match-reel'), help='scratch folder for frames and clips')
    ap.add_argument('--only', default='', help='comma-separated scene names, to re-take a few (keeps the other clips)')
    ap.add_argument('--keep', action='store_true', help='keep the frame folders')
    ap.add_argument('--music', default=str(HERE / 'music.mp3'), help='soundtrack (ElevenLabs Music); empty for a silent video')
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
        landing_ready = False
        clips = []
        for sc in SCENES:
            clip = work / (sc['name'] + '.mp4')
            if only and sc['name'] not in only:
                if not clip.exists():
                    raise SystemExit('No earlier take of %s; run without --only first' % sc['name'])
                n = int(round((sc['raw'] - sc['trim']) / sc['speed'] * FPS))
                clips.append((clip, n / FPS))
                continue
            kind = sc.get('page', 'landing')
            if kind.startswith('cards'):
                await page.goto(cards + ('?c=end' if kind == 'cards-end' else '?c=title'), wait_until='commit')
                await page.evaluate("document.body.style.visibility='hidden'")   # held until the screencast runs
                await page.wait_for_load_state('networkidle')
                await page.evaluate('document.fonts.ready.then(() => 1)')
                landing_ready = False
            elif kind == 'landing-fresh' or not landing_ready:
                if kind != 'landing-fresh':
                    await page.goto(a.base + '/', wait_until='networkidle')
                    await page.wait_for_timeout(2500)
                    await page.add_script_tag(path=str(HERE / 'reel.js'))
                    landing_ready = True

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
            steps = sorted(sc['steps'])
            for at, js in steps:
                wait = start + at - time.perf_counter()
                if wait > 0:
                    await asyncio.sleep(wait)
                await page.evaluate(js)
            wait = start + sc['raw'] - time.perf_counter()
            if wait > 0:
                await asyncio.sleep(wait)
            await rec.stop()
            if kind == 'landing-fresh':
                await page.wait_for_load_state('networkidle')
                await page.add_script_tag(path=str(HERE / 'reel.js'))
                landing_ready = True
            # Screencast timestamps are wall-clock seconds, so the scene's zero is the wall time when its steps began.
            frames = rec.frames
            dur = encode_scene(frames, start_wall, sc, clip)
            clips.append((clip, dur))
            print('%-10s %5d frames captured, %4.1f s clip' % (sc['name'], len(frames), dur), flush=True)
            # Cover image for the LinkedIn post: the title card once it has settled.
            if sc['name'] == 'title':
                shutil.copy(frames[-1][1], HERE / 'cover.jpg')
        await browser.close()

    music = pathlib.Path(a.music) if a.music else None
    join(clips, a.out, music if music and music.exists() else None)
    total = sum(d for _, d in clips) - FADE * (len(clips) - 1)
    print('Wrote %s (%.1f s)' % (a.out, total))
    if not a.keep:
        for sc in SCENES:
            shutil.rmtree(work / sc['name'], ignore_errors=True)


if __name__ == '__main__':
    asyncio.run(main())
