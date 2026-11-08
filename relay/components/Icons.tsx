// Small stroke icons. All decorative (aria-hidden); the button that holds one carries the label.

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const Logo = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M5 15a7 7 0 0112-5" />
    <path d="M19 9a7 7 0 01-12 5" />
  </Svg>
);
export const Cross = (p: P) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const ArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Svg>
);
export const ArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </Svg>
);
export const Pin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0118.5 10c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
export const DocIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
  </Svg>
);
export const Chevron = (p: P) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const Deck = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="6" width="14" height="14" rx="3" />
    <path d="M8 3h8" />
  </Svg>
);
export const Person = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5" />
  </Svg>
);
export const Chat = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);
export const Bookmark = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" />
  </Svg>
);
export const Upload = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Svg>
);
export const Sparkle = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </Svg>
);
export const Tablet = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
    <path d="M9.3 8.1l5.4 7.8" />
  </Svg>
);
export const Drip = (p: P) => (
  <Svg {...p}>
    <path d="M8 3h8v7a4 4 0 01-8 0z" />
    <path d="M12 14v3a3 3 0 003 3h3" />
    <path d="M8 7h8" />
  </Svg>
);
export const Flask = (p: P) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);
export const Calendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </Svg>
);
export const Clock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const Home = (p: P) => (
  <Svg {...p}>
    <path d="M4 11l8-6 8 6v9H4z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
);
export const ExternalLink = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
  </Svg>
);
export const Heart = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" />
  </Svg>
);
export const Reset = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 102.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);
