/**
 * Ilustração vetorial original (feita para o DeliveryMoz, sem direitos de terceiros):
 * prato de frango grelhado com arroz e matapa, taça de camarão, sumo e piri-piri.
 * Leve (sem pedidos de rede) e nítida em qualquer ecrã.
 */
export function HeroFoodArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 480" className={className} role="img" aria-label="Ilustração de refeições: frango grelhado com arroz, camarão e sumo">
      <defs>
        <radialGradient id="fa-plate" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1ece4" />
        </radialGradient>
        <linearGradient id="fa-chicken" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9843f" />
          <stop offset="100%" stopColor="#a8541f" />
        </linearGradient>
        <linearGradient id="fa-juice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb547" />
          <stop offset="100%" stopColor="#f57c1f" />
        </linearGradient>
        <filter id="fa-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#1c1b1a" floodOpacity="0.16" />
        </filter>
      </defs>

      {/* Fundo */}
      <circle cx="270" cy="250" r="215" fill="var(--brand)" opacity="0.1" />
      <circle cx="420" cy="380" r="70" fill="var(--accent)" opacity="0.12" />

      {/* Prato principal */}
      <g filter="url(#fa-shadow)">
        <circle cx="255" cy="265" r="168" fill="url(#fa-plate)" />
      </g>
      <circle cx="255" cy="265" r="136" fill="#fbf8f3" stroke="#ece5da" strokeWidth="3" />

      {/* Arroz */}
      <path d="M150 262c-6-44 30-78 72-78 35 0 66 22 70 58 3 30-20 52-60 56-44 4-77-8-82-36z" fill="#fffdf7" stroke="#eee6d6" strokeWidth="2" />
      {[[178, 228], [200, 214], [226, 210], [250, 222], [168, 252], [192, 246], [218, 240], [244, 248], [266, 238], [184, 274], [210, 270], [236, 276], [262, 266]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="6" ry="2.6" fill="#efe6d2" transform={`rotate(${(i * 37) % 180} ${x} ${y})`} />
      ))}

      {/* Matapa / verdes */}
      <g>
        <circle cx="300" cy="330" r="38" fill="#3e7d3f" />
        <circle cx="282" cy="318" r="18" fill="#56a052" />
        <circle cx="318" cy="340" r="15" fill="#4a8f47" />
        <circle cx="304" cy="312" r="9" fill="#6db865" />
        <circle cx="294" cy="346" r="6" fill="#f2efe4" opacity="0.7" />
        <circle cx="312" cy="322" r="4" fill="#f2efe4" opacity="0.7" />
      </g>

      {/* Frango grelhado */}
      <g>
        <path d="M268 196c34-26 92-18 104 20 12 38-20 74-62 72-40-2-70-60-42-92z" fill="url(#fa-chicken)" />
        <path d="M284 210l60 40M278 232l52 34M300 200l58 34" stroke="#7a3812" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
        <path d="M196 312c22-30 74-30 88 2 10 24-10 50-44 50-30 0-56-26-44-52z" fill="url(#fa-chicken)" />
        <path d="M208 318l58 26M214 338l44 16" stroke="#7a3812" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
      </g>

      {/* Tomate e limão */}
      <circle cx="350" cy="292" r="18" fill="#e5483b" />
      <circle cx="350" cy="292" r="11" fill="#f39a8c" />
      <path d="M156 296a26 26 0 0 1 48 10z" fill="#f6c445" stroke="#e7ad22" strokeWidth="3" />

      {/* Taça de camarão */}
      <g filter="url(#fa-shadow)">
        <circle cx="430" cy="118" r="66" fill="#ffffff" />
      </g>
      <circle cx="430" cy="118" r="52" fill="#fff4ea" stroke="#f3dccb" strokeWidth="2" />
      {[[410, 104, -20], [440, 98, 25], [426, 128, 5], [452, 126, 40], [404, 132, -40]].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <path d={`M${x - 14} ${y}a14 14 0 1 1 28 0`} fill="none" stroke="#f08a4b" strokeWidth="11" strokeLinecap="round" />
          <path d={`M${x + 14} ${y}l8 6l-8 4z`} fill="#e46b2c" />
        </g>
      ))}
      <path d="M418 84c6-6 14-6 18 0" stroke="#3e7d3f" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Sumo */}
      <g filter="url(#fa-shadow)">
        <path d="M70 330h74l-10 112a12 12 0 0 1-12 11H92a12 12 0 0 1-12-11z" fill="#ffffff" opacity="0.92" />
      </g>
      <path d="M76 352h62l-8 86a8 8 0 0 1-8 7H92a8 8 0 0 1-8-7z" fill="url(#fa-juice)" />
      <path d="M120 300l-8 64" stroke="var(--brand)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="96" cy="376" r="5" fill="#fff" opacity="0.6" />
      <circle cx="116" cy="400" r="4" fill="#fff" opacity="0.5" />
      <circle cx="140" cy="334" r="16" fill="#f6c445" stroke="#e7ad22" strokeWidth="3" />
      <path d="M140 320v28M126 334h28" stroke="#e7ad22" strokeWidth="2" />

      {/* Piri-piri */}
      <path d="M418 300c18 6 30 24 26 44-2 10-12 10-14 2-4-16-12-26-24-32z" fill="#d7261e" />
      <path d="M416 300c-2-8 2-14 10-14" stroke="#3e7d3f" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M452 236c14 2 22 16 18 30-2 8-10 6-10 0-2-10-6-18-14-22z" fill="#e5483b" />
    </svg>
  );
}
