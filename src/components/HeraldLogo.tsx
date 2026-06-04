import React from "react";

interface HeraldLogoProps {
  className?: string;
  size?: number;
}

export default function HeraldLogo({ className = "", size = 32 }: HeraldLogoProps) {
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      className={`select-none shrink-0 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Herald icon"
    >
      <defs>
        <linearGradient id="pennant2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6B048"/>
          <stop offset="1" stopColor="#EC7A3C"/>
        </linearGradient>
      </defs>
      {/* tile */}
      <rect x="0" y="0" width="240" height="240" rx="52" fill="#18223B"/>
      {/* staff */}
      <line x1="104" y1="64" x2="104" y2="184" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round"/>
      {/* merge branch */}
      <path d="M58 184 C58 152, 80 150, 104 150" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none"/>
      {/* nodes */}
      <circle cx="104" cy="150" r="12" fill="#FFFFFF"/>
      <circle cx="104" cy="92"  r="14" fill="#18223B" stroke="#FFFFFF" strokeWidth="6"/>
      {/* forked pennant */}
      <path d="M104 74 L188 88 L160 102 L188 116 L104 130 Z" fill="url(#pennant2)"/>
    </svg>
  );
}
