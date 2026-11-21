import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { metricRenderState } from "@/lib/admin/metrics/render";
import { figureFromMetricState } from "@/lib/admin/figure";
import Figure, { type FigureProps } from "./ui/Figure";
import Metric from "./Metric";

/**
 * A <Figure> fed by the Contract 2 metric catalog: the number comes only
 * through a defined metric_key, exactly as <Metric> renders it, and the
 * Figure adds the label, the required source line and the freshness state.
 *
 * - no snapshot yet       → missing ("No data yet"), never 0
 * - snapshot past cadence → stale (badge, warning source line, Refresh)
 * - undefined key         → <Metric>'s refusal chip, no number at all
 *
 * Server component; reads the org's catalog through the session client.
 */
export default async function MetricFigure({
  metricKey,
  ...rest
}: { metricKey: string } & Omit<FigureProps, "value" | "freshness">) {
  const catalog = await getMetricCatalog();
  const fig = figureFromMetricState(metricRenderState(catalog, metricKey));
  if (!fig) return <Metric metricKey={metricKey} />;
  return <Figure {...rest} value={fig.value} freshness={fig.freshness} />;
}
