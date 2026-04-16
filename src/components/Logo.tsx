// src/components/Logo.tsx
// Full THEO wordmark from public/theo-logo.svg — same asset as the login page,
// sized for the signed-in header (login page uses its own Image for the larger size).

import Image from "next/image";

const HEADER_WIDTH = 152;
const HEADER_HEIGHT = 47;

export default function Logo() {
  return (
    <Image
      src="/theo-logo.svg"
      alt="THEO"
      width={HEADER_WIDTH}
      height={HEADER_HEIGHT}
      className="h-9 w-auto shrink-0"
    />
  );
}
