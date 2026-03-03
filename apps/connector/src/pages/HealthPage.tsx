import { mapHealthSummary, type HealthSummary } from "../types/health";

type HealthPageProps = {
  summary: HealthSummary;
};

export function HealthPage({ summary }: HealthPageProps) {
  const status = mapHealthSummary(summary);

  return (
    <section>
      <h2>Health</h2>
      <p>Status: {status}</p>
      <p>Latency: {summary.latencyMs}ms</p>
      <p>Failures: {summary.consecutiveFailures}</p>
    </section>
  );
}
