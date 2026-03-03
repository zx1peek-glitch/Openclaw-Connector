type ActivityPageProps = {
  entries: string[];
};

export function ActivityPage({ entries }: ActivityPageProps) {
  return (
    <section>
      <h2>Activity</h2>
      <ul>
        {entries.map((entry, idx) => (
          <li key={`${entry}-${idx}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}
