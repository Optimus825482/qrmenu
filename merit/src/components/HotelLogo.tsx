import Image from "next/image";

const HOTEL_LOGOS: Record<string, { src: string; label: string }> = {
  ROYAL: { src: "/brand/hotels/royal-transparent.webp", label: "Merit Royal logosu" },
  DIAMOND: { src: "/brand/hotels/diamond-transparent.webp", label: "Merit Royal Diamond logosu" },
  PREMIUM: { src: "/brand/hotels/premium-transparent.webp", label: "Merit Royal Premium logosu" },
};

export function HotelLogo({ hotelCode, size = 64 }: { hotelCode: string; size?: number }) {
  const logo = HOTEL_LOGOS[hotelCode.toUpperCase()];
  if (!logo) return null;

  return (
    <span className="hotel-logo" style={{ width: size, height: size }}>
      <Image src={logo.src} alt={logo.label} width={size} height={size} unoptimized />
    </span>
  );
}
