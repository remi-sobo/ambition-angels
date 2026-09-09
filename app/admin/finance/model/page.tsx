import ModelSection from "./ModelSection";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// The V1 model route. The whole screen lives in ModelSection (extracted at
// Spec Finance N2) so Forecast embeds the same four cards; here it renders
// standalone. Fenced behind aa.finance_model as of N2 — the sheet carries
// AA's numbers with no org in the data path, and before the fence any
// finance-holding org could read them here (a deliberate V1 behavior change,
// named in the N2 PR). At the N4 cutover this route 308s to Forecast.
export const revalidate = 3600;

export default async function FinanceModelPage() {
  return (
    <FeatureGate feature="aa.finance_model" label="Finance Model">
      <ModelSection />
    </FeatureGate>
  );
}
