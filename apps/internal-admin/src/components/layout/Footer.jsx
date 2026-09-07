import React from 'react';

export default function Footer() {
  return (
    <footer className="border-t border-dark-900/5 px-6 py-4 text-xs text-gray-500">
      Dorafi Staff Console · {new Date().getFullYear()}
    </footer>
  );
}
