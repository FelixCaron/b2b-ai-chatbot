import React from 'react';

/**
 * The dorafi brand mark: a "d" whose bowl is a speech bubble holding two
 * dots. The dots are hardcoded white (punched out of the mark), so this
 * only reads correctly with a dark `currentColor` (e.g. `text-brand-900`)
 * directly on a light background — do NOT recolor it white/light or place
 * it on a colored tile, the dots will disappear into the mark.
 */
export default function LogoMark({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M62 8c5 0 9 4 9 9v45c0 5-4 9-9 9s-9-4-9-9V17c0-5 4-9 9-9z"
        fill="currentColor"
      />
      <path
        d="M62 8c8 0 15 3 15 9s-7 8-15 8-15-2-15-8 7-9 15-9z"
        fill="currentColor"
      />
      <path
        d="M53 34c15 0 27 11 27 25s-12 25-27 25c-4 0-8-1-11-2l-13 7 3-13c-6-5-9-11-9-17 0-14 12-25 27-25z"
        fill="currentColor"
      />
      <circle cx="45" cy="59" r="5.5" fill="white" />
      <circle cx="63" cy="59" r="5.5" fill="white" />
    </svg>
  );
}
