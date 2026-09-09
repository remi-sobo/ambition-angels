import CloseSection from "./CloseSection";

// The V1 Friday close route. The whole ritual lives in CloseSection
// (extracted at Spec Work W1) so Work → Plan & Close renders the same flow;
// here it renders standalone — output byte-identical to the pre-W1 page. At
// the W4 cutover this route 308s to /admin/work/plan-close.
export const dynamic = "force-dynamic";

export default async function FridayClosePage() {
  return <CloseSection />;
}
