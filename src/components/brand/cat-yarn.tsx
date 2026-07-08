// Decorative monochrome (white line-art) cat batting a ball of yarn, plus an
// animated credit. Pure SVG + CSS — no JS, no color. Sits under the auth footer.
export function CatYarn() {
  return (
    <div className="mt-6 flex flex-col items-center gap-1 text-foreground/90">
      <style>{catYarnCss}</style>
      <svg
        className="cy-svg"
        width="150"
        height="98"
        viewBox="0 0 200 130"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="A cat playing with a ball of yarn"
        role="img"
      >
        {/* ground shadows */}
        <ellipse className="cy-sh" cx="120" cy="120" rx="34" ry="3.5" fill="currentColor" stroke="none" />
        <ellipse className="cy-sh cy-sh-ball" cx="64" cy="118" rx="15" ry="3" fill="currentColor" stroke="none" />

        {/* ── Cat ─────────────────────────────────────────── */}
        <g className="cy-cat">
          {/* tail */}
          <g className="cy-tail">
            <path d="M140 104 C165 106 174 86 162 72 C156 64 146 66 146 74" />
          </g>

          {/* body */}
          <path d="M120 60 C99 64 93 92 103 110 C110 117 130 117 137 110 C147 92 141 64 120 60 Z" />

          {/* right foreleg + paw (resting) */}
          <path d="M132 96 C136 104 136 108 134 111" />
          <ellipse cx="132" cy="111" rx="6" ry="4" />

          {/* left foreleg + paw — bats at the yarn */}
          <g className="cy-paw">
            <path d="M110 88 C98 94 86 100 79 105" />
            <ellipse cx="79" cy="105" rx="6.5" ry="4.2" />
          </g>

          {/* head */}
          <g className="cy-head">
            {/* ears */}
            <g className="cy-ear">
              <path d="M105 30 L100 15 L116 27" />
            </g>
            <g className="cy-ear cy-ear-r">
              <path d="M135 30 L140 15 L124 27" />
            </g>
            {/* head shape */}
            <path d="M120 24 C133 24 141 33 141 45 C141 55 132 63 120 63 C108 63 99 55 99 45 C99 33 107 24 120 24 Z" />
            {/* eyes */}
            <g className="cy-eyes" fill="currentColor" stroke="none">
              <ellipse cx="111" cy="45" rx="2.6" ry="3.4" />
              <ellipse cx="129" cy="45" rx="2.6" ry="3.4" />
            </g>
            {/* nose + mouth */}
            <path d="M117 52 L123 52 L120 55 Z" fill="currentColor" stroke="none" />
            <path d="M120 55 C120 58 117 59 115 58 M120 55 C120 58 123 59 125 58" strokeWidth="1.8" />
            {/* whiskers */}
            <g strokeWidth="1.5" opacity="0.85">
              <path d="M108 51 L90 48 M108 54 L91 55" />
              <path d="M132 51 L150 48 M132 54 L149 55" />
            </g>
          </g>
        </g>

        {/* ── Ball of yarn ────────────────────────────────── */}
        <g transform="translate(64 100)">
          <g className="cy-bounce">
            <g className="cy-squash">
              <g className="cy-spin">
                <circle cx="0" cy="0" r="14" />
                <ellipse cx="0" cy="0" rx="14" ry="6" transform="rotate(22)" strokeWidth="1.7" />
                <ellipse cx="0" cy="0" rx="14" ry="6" transform="rotate(-30)" strokeWidth="1.7" />
                <ellipse cx="0" cy="0" rx="13" ry="9" transform="rotate(74)" strokeWidth="1.7" />
                <ellipse cx="0" cy="0" rx="9" ry="14" transform="rotate(8)" strokeWidth="1.7" />
              </g>
              {/* loose trailing strand */}
              <path className="cy-strand" d="M13 3 C24 8 20 16 30 18 C37 19 39 14 36 11" strokeWidth="1.7" />
            </g>
          </g>
        </g>
      </svg>

      <p className="cy-credit">
        Created by <span className="cy-name">@Nxrth!</span>
      </p>
    </div>
  );
}

const catYarnCss = `
.cy-svg { filter: drop-shadow(0 0 6px rgb(255 255 255 / 0.16)); overflow: visible; }
.cy-svg g { transform-box: fill-box; }

.cy-cat { animation: cy-breathe 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
.cy-head { animation: cy-headbob 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
.cy-paw { animation: cy-bat 1.6s cubic-bezier(.5,0,.5,1) infinite; transform-origin: 92% 8%; }
.cy-tail { animation: cy-tail 2.6s ease-in-out infinite; transform-origin: 8% 88%; }
.cy-ear { animation: cy-ear 3.4s ease-in-out infinite; transform-origin: 50% 100%; }
.cy-ear-r { animation-delay: .2s; }
.cy-eyes { animation: cy-blink 4.4s ease-in-out infinite; transform-origin: 50% 50%; }

.cy-bounce { animation: cy-bounce 1.6s cubic-bezier(.5,0,.5,1) infinite; }
.cy-squash { animation: cy-squash 1.6s cubic-bezier(.5,0,.5,1) infinite; transform-origin: 50% 100%; }
.cy-spin { animation: cy-spin 1.9s linear infinite; transform-origin: 50% 50%; }
.cy-strand { animation: cy-strand 1.6s ease-in-out infinite; transform-origin: 0% 20%; }
.cy-sh-ball { animation: cy-shadow 1.6s cubic-bezier(.5,0,.5,1) infinite; transform-origin: 50% 50%; }

@keyframes cy-bounce { 0%,100% { transform: translateY(2px); } 50% { transform: translateY(-30px); } }
@keyframes cy-squash {
  0%,100% { transform: scale(1.12, .88); }
  15%,85% { transform: scale(1, 1); }
  50% { transform: scale(.94, 1.06); }
}
@keyframes cy-spin { to { transform: rotate(360deg); } }
@keyframes cy-strand { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(10deg); } }
@keyframes cy-shadow { 0%,100% { transform: scaleX(1); opacity:.5; } 50% { transform: scaleX(.6); opacity:.22; } }

@keyframes cy-bat { 0%,100% { transform: rotate(15deg); } 45% { transform: rotate(15deg); } 50% { transform: rotate(-8deg); } 55% { transform: rotate(-8deg); } }
@keyframes cy-tail { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(9deg); } }
@keyframes cy-ear { 0%,88%,100% { transform: rotate(0); } 94% { transform: rotate(-10deg); } }
@keyframes cy-blink { 0%,90%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes cy-breathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.02); } }
@keyframes cy-headbob { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }

.cy-credit {
  font-family: var(--font-display), sans-serif;
  font-size: .82rem;
  letter-spacing: .01em;
  color: var(--muted-foreground);
}
.cy-name {
  font-weight: 600;
  background: linear-gradient(100deg,
    var(--muted-foreground) 30%, #fff 48%, #fff 52%, var(--muted-foreground) 70%);
  background-size: 220% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: cy-shimmer 3s linear infinite;
  text-shadow: 0 0 10px rgb(255 255 255 / 0.12);
}
@keyframes cy-shimmer { to { background-position: -220% center; } }

@media (prefers-reduced-motion: reduce) {
  .cy-svg *, .cy-name { animation: none !important; }
}
`;
