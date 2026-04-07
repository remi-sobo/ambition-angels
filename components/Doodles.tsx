// Decorative SVG doodles — hand-drawn style

export function DoodleArrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 30 C20 28, 45 20, 65 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="0"/>
      <path d="M55 6 C60 10, 67 12, 65 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <path d="M65 12 C67 14, 72 18, 68 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleStar({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 4 L20 36M4 20 L36 20M7 7 L33 33M33 7 L7 33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleSquiggle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10 C12 2, 22 18, 32 10 C42 2, 52 18, 62 10 C72 2, 82 18, 92 10 C102 2, 112 18, 118 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleCircle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 4 C50 4, 58 14, 57 30 C56 46, 44 57, 28 56 C12 55, 3 44, 4 28 C5 12, 16 3, 30 4 Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleZigzag({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 24 L18 6 L34 24 L50 6 L66 24 L82 6 L98 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function DoodleUnderline({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 8 C50 2, 100 12, 150 6 C170 4, 185 8, 198 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function DoodleDots({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="10" r="3.5" fill="currentColor"/>
      <circle cx="20" cy="6" r="2.5" fill="currentColor"/>
      <circle cx="34" cy="12" r="4" fill="currentColor"/>
      <circle cx="48" cy="5" r="2" fill="currentColor"/>
      <circle cx="58" cy="14" r="3" fill="currentColor"/>
    </svg>
  );
}
