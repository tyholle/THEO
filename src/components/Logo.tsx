// src/components/Logo.tsx
// Reusable THEO logo: the purple hexagon icon + "THEO" text in white.
// Used in the top-left of every page header after sign-in.
// The hex path is extracted from the full theo-logo.svg.

export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Purple hexagon icon — just the icon portion of the full logo */}
      <svg width="28" height="32" viewBox="0 0 66 103" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M66 28.7484V45.7441L60.4468 51.5L66 57.2566V74.2523L45.3787 103H20.6213L0 74.2523V57.2566L5.55256 51.5L0 45.7441V28.7484L20.6213 0H45.3787L66 28.7484ZM5.88324 30.768V43.2182L10.7661 48.2799H16.9175L21.8004 43.2182V27.3607H27.6836V45.7441L22.1304 51.5L27.6836 57.2566V75.64H21.8004V59.7825L16.9175 54.7207H10.7661L5.88324 59.7825V72.2326L23.5783 96.9013H42.4217L60.1168 72.2326V59.7825L55.2339 54.7207H49.0825L44.1996 59.7825V75.64H38.3164V57.2566L43.8689 51.5L38.3164 45.7441V27.3607H44.1996V43.2182L49.0825 48.2799H55.2339L60.1168 43.2182V30.768L42.4217 6.09935H23.5783L5.88324 30.768Z"
          fill="#9175FF"
        />
      </svg>

      {/* THEO wordmark */}
      <span className="text-white font-bold text-xl tracking-wide">THEO</span>
    </div>
  )
}
