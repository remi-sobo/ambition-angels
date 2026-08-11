import Image from "next/image";

/**
 * The Teacher Dashboard mockup (laptop frame), shown on /schools, the
 * homepage Guide layer, and the Platform page. Always carries a
 * "sample data" caption per the build plan — the frame shows student
 * names, faces, and progress that are all invented.
 */
export default function DashboardMockup({ className = "" }: { className?: string }) {
  return (
    <figure className={className}>
      <Image
        src="/images/teacher-dashboard-mockup.png"
        alt="Teacher dashboard on a laptop: an advisory roster showing each student's current internship, progress, and status, with a student spotlight, conversation prompts, and this week's follow-ups"
        width={1536}
        height={1024}
        className="w-full h-auto"
      />
      <figcaption className="mt-3 text-center text-xs text-gray-warm">
        Teacher dashboard. Sample data shown for illustration.
      </figcaption>
    </figure>
  );
}
