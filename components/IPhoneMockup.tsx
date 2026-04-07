import Image from "next/image";

export default function IPhoneMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 280, height: 570 }}>
      {/* iPhone 15 body */}
      <div
        className="absolute inset-0 rounded-[44px] shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #2a2a2a 0%, #111 50%, #1a1a1a 100%)",
          boxShadow: "0 0 0 1.5px #3a3a3a, 0 40px 80px rgba(0,0,0,0.6), inset 0 0 0 1px #444",
        }}
      />

      {/* Screen area */}
      <div
        className="absolute overflow-hidden bg-black"
        style={{
          top: 10,
          left: 10,
          right: 10,
          bottom: 10,
          borderRadius: 36,
        }}
      >
        <Image
          src="/images/app mockup.png"
          alt="Ambition app"
          fill
          className="object-cover object-top"
          sizes="260px"
        />
      </div>

      {/* Dynamic Island */}
      <div
        className="absolute bg-black"
        style={{
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          width: 120,
          height: 34,
          borderRadius: 20,
          zIndex: 10,
        }}
      />

      {/* Power button - right side */}
      <div
        className="absolute"
        style={{
          right: -3,
          top: 140,
          width: 3,
          height: 64,
          borderRadius: "0 2px 2px 0",
          background: "linear-gradient(to right, #2a2a2a, #3a3a3a)",
        }}
      />

      {/* Volume buttons - left side */}
      {[100, 150].map((top) => (
        <div
          key={top}
          className="absolute"
          style={{
            left: -3,
            top,
            width: 3,
            height: 40,
            borderRadius: "2px 0 0 2px",
            background: "linear-gradient(to left, #2a2a2a, #3a3a3a)",
          }}
        />
      ))}

      {/* Silent switch */}
      <div
        className="absolute"
        style={{
          left: -3,
          top: 70,
          width: 3,
          height: 24,
          borderRadius: "2px 0 0 2px",
          background: "linear-gradient(to left, #2a2a2a, #3a3a3a)",
        }}
      />
    </div>
  );
}
