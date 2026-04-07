import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/the-app", label: "The App" },
  { href: "/curriculum", label: "Curriculum" },
  { href: "/donate", label: "Donate" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-cream">
      {/* CTA band */}
      <div className="bg-orange">
        <div className="container-site py-14 lg:py-20 text-center">
          <p className="text-white/80 text-sm font-medium uppercase tracking-widest mb-3">
            Join the Movement
          </p>
          <h2 className="font-heading font-bold text-white text-3xl lg:text-4xl mb-4 leading-tight">
            A small investment from you can go<br className="hidden lg:block" /> a long way.
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-prose mx-auto">
            Become an Ambition Angel today.
          </p>
          <Link
            href="/donate"
            className="inline-block bg-white text-orange font-semibold text-base px-8 py-4 rounded-full hover:bg-orange-light transition-colors"
          >
            Donate Now
          </Link>
        </div>
      </div>

      {/* Main footer */}
      <div className="container-site py-14 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16 mb-12">

          {/* Vision */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block mb-6">
              <Image
                src="/images/AmbitionAngels_Logo.png"
                alt="Ambition Angels"
                width={180}
                height={54}
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>
            <p className="text-gray-mid text-sm leading-relaxed mb-4">
              We envision a future where all teens experience greater wealth,
              health, and life satisfaction as they grow into adults. At Ambition
              Angels, we have the potential to alter the course of an entire
              generation for good.
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.linkedin.com/company/ambition-angels"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-gray-mid hover:text-cream transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/@ambitionangels"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="text-gray-mid hover:text-cream transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav links */}
          <div>
            <h3 className="font-heading font-semibold text-cream text-sm uppercase tracking-widest mb-5">
              Navigate
            </h3>
            <ul className="flex flex-col gap-3">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-mid text-sm hover:text-cream transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact + app */}
          <div>
            <h3 className="font-heading font-semibold text-cream text-sm uppercase tracking-widest mb-5">
              Get in Touch
            </h3>
            <ul className="flex flex-col gap-3 text-gray-mid text-sm mb-8">
              <li>
                <a
                  href="mailto:remi@ambitionangels.org"
                  className="hover:text-cream transition-colors"
                >
                  remi@ambitionangels.org
                </a>
              </li>
              <li>380 Portage Ave, Palo Alto, CA 94306</li>
            </ul>
            <h3 className="font-heading font-semibold text-cream text-sm uppercase tracking-widest mb-4">
              Get the App
            </h3>
            <div className="flex flex-col gap-2">
              <a
                href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download for iOS
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
                </svg>
                Download for Android
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-cream/10 pt-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <p className="text-gray-mid text-xs">
            &copy; {new Date().getFullYear()} Ambition Angels Inc. &middot; US
            501(c)(3) &middot; EIN 87-2513010
          </p>
          <p className="text-gray-mid text-xs">
            Built to put career exposure in every pocket.
          </p>
        </div>
      </div>
    </footer>
  );
}
