'use client';

// Hospital header image. Looks up /sites/<key>.jpg; until it loads (or if it is missing) an SVG
// scene for that site shows instead, so the card never shows a broken image. Adding a photo later
// needs no code change: drop the file in public/sites with the key as its name.

import { useCallback, useState } from 'react';
import type { SiteKey } from '@/lib/deck';

interface Palette {
  sky: [string, string];
  far: string;
  near: string;
  sun: string;
}

const PALETTES: Record<SiteKey | 'generic', Palette> = {
  'royal-marsden': { sky: ['#F2CFA6', '#F8EBDC'], far: '#C9B49A', near: '#3E4F47', sun: '#FBE3C2' },
  'royal-free': { sky: ['#BFD6E3', '#EEF3F1'], far: '#A7B9B9', near: '#2E3E44', sun: '#F4F7F2' },
  barts: { sky: ['#E3C6DD', '#F6EEF3'], far: '#BFA9B9', near: '#41394A', sun: '#FBEFF5' },
  guys: { sky: ['#CFE2C8', '#F1F4EC'], far: '#A9BCA3', near: '#2F4237', sun: '#F7FAF1' },
  uclh: { sky: ['#CCD5F0', '#EFF1F8'], far: '#A9B1CF', near: '#2C3550', sun: '#F6F7FC' },
  generic: { sky: ['#E5DCC8', '#F4F1EA'], far: '#C2B9A7', near: '#3C4741', sun: '#FAF5EA' },
};

/** Near-skyline silhouettes, one per site, drawn on a 320 × 180 canvas (ground at y = 150). */
const NEAR: Record<SiteKey | 'generic', string> = {
  // Victorian block with gables and chimneys
  'royal-marsden':
    'M0 150V112h22v-10h10v10h18V96l14-12 14 12v16h18V88l20-16 20 16v24h16v-8h8v8h22V98l12-10 12 10v14h20v-14h6v14h22V108h26v42z',
  // tall slab tower with a low podium
  'royal-free': 'M0 150v-30h40v-8h30v8h20V48h70v72h22v-16h34v16h24v-22h30v52h50v30z',
  // classical front with pediment and a small dome
  barts: 'M0 150v-34h36v-6h28v6h24V92l46-24 46 24v24h20V96a16 16 0 0132 0v20h28v-12h20v12h40v34z',
  // very tall tower beside lower blocks
  guys: 'M0 150v-26h34v-10h40v10h22V30h38v94h18v-22h44v22h28v-34h34v34h62v26z',
  // modern tower with an angled top and glazed bands
  uclh: 'M0 150v-24h30v-14h46v14h20V58l52-18v86h20v-30h40v30h22v-20h34v20h56v24z',
  generic: 'M0 150v-30h30v-12h36v12h22v-26h40v26h24v-18h34v18h26v-34h34v34h74v30z',
};

const FAR = 'M0 150v-46h18v-8h20v14h24v-22h22v18h30v-10h26v16h22v-26h20v22h26v-12h24v18h22v-20h22v14h24v-8h20v42z';

export function SiteScene({ k }: { k: SiteKey | null }) {
  const key = k ?? 'generic';
  const p = PALETTES[key];
  const id = `sky-${key}`;
  return (
    <svg className="scene" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id})`} />
      <circle cx="248" cy="52" r="20" fill={p.sun} opacity="0.9" />
      <path d={FAR} fill={p.far} opacity="0.75" />
      <path d={NEAR[key]} fill={p.near} />
      <rect y="150" width="320" height="30" fill={p.near} opacity="0.92" />
      <path d="M0 162h320" stroke={p.sky[1]} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="14 10" />
    </svg>
  );
}

export function SiteImage({ siteKey, className = '' }: { siteKey: SiteKey | null; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // An image can finish loading before React attaches onLoad (hydration); check on mount too.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, []);
  return (
    <div className={`siteimg ${className}`}>
      <SiteScene k={siteKey} />
      {siteKey && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={siteKey}
          ref={ref}
          src={`/sites/${siteKey}.jpg`}
          alt=""
          draggable={false}
          decoding="async"
          className={loaded ? 'in' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

/** Home → site sketch with an approximate travel time. Not a map: distances are straight-line. */
export function RouteMap({ home, site, minutes, miles }: { home: string; site: string; minutes: string; miles: number | null }) {
  const far = miles !== null && miles >= 1;
  const x2 = far ? 268 : 214;
  return (
    <figure className="route" aria-label={`From home in ${home} to ${site}: about ${minutes}, approximate.`}>
      <svg viewBox="0 0 300 116" role="img" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="298" height="114" rx="16" className="route-bg" />
        <path d="M0 84c40-14 70 10 112-2s70-30 112-14 56 10 76 2" className="route-river" />
        <g className="route-grid">
          <path d="M60 0v116M140 0v116M220 0v116M0 38h300" />
        </g>
        <path d={`M44 70C${(44 + x2) / 2 - 20} 18 ${(44 + x2) / 2 + 20} 18 ${x2} 52`} className="route-path" pathLength={1} />
        <circle cx="44" cy="70" r="7" className="route-home" />
        <circle cx={x2} cy="52" r="8" className="route-site" />
        <circle cx={x2} cy="52" r="3" fill="#fff" />
      </svg>
      <figcaption>
        <span className="route-lbl">Home · {home}</span>
        <span className="route-time mono">approx. {minutes}</span>
        <span className="route-lbl r">{site}</span>
      </figcaption>
    </figure>
  );
}
