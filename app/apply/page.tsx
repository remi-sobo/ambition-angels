import type { Metadata } from "next";
import { fetchOpenCohorts } from "@/lib/site/bloomos";
import ApplyForm, { type OpenCohort } from "./ApplyForm";

export const metadata: Metadata = {
  title: "Apply · Ambition Angels",
  description:
    "Apply to an Ambition Angels program. Career exposure, real internship simulations, and a community that believes in your ambition.",
};

// Public student application form (modules/02-program.md "Intake").
// BloomOS supplies the open cohorts for the program picker, and submissions
// go to BloomOS through the intake API.
export const dynamic = "force-dynamic";

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/** The programs to offer: this org's open cohorts, from BloomOS. */
async function loadCohorts(): Promise<OpenCohort[]> {
  return (await fetchOpenCohorts()) ?? [];
}

export default async function ApplyPage() {
  const cohorts = await loadCohorts();

  return (
    <main className="bg-ink min-h-screen" style={dotTexture}>
      <div className="container-site section-pad">
        <div className="max-w-[640px] mx-auto">
          <p className="font-heading font-semibold text-orange text-xs uppercase tracking-[0.2em] mb-3">
            Student Application
          </p>
          <h1 className="font-display font-black text-cream text-5xl sm:text-6xl uppercase leading-[0.95] mb-4">
            Your ambition starts here.
          </h1>
          <p className="text-gray-mid text-base leading-relaxed mb-10">
            Tell us a little about yourself and we&apos;ll take it from there. Applications take
            about two minutes; a parent or guardian email is required so we can follow up with
            next steps.
          </p>
          <ApplyForm cohorts={cohorts} />
        </div>
      </div>
    </main>
  );
}
