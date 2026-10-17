// The "impact counter" at the top. It's computed from completed posts.
// Assumption for the pitch: each shared item keeps about 0.5 kg of food out of the trash.
const KG_PER_ITEM = 0.5;

export default function ImpactBar({ posts }) {
  const done = posts.filter((p) => p.status === "completed");
  const saved = done.reduce((sum, p) => sum + (Number(p.estValue) || 0), 0);
  const neighbors = new Set(done.flatMap((p) => [p.ownerId, p.claimedById]).filter(Boolean)).size;

  const stats = [
    { value: done.length, label: "items shared" },
    { value: `$${saved.toFixed(0)}`, label: "saved" },
    { value: `${(done.length * KG_PER_ITEM).toFixed(1)} kg`, label: "food not wasted" },
    { value: neighbors, label: "neighbors helped" },
  ];

  return (
    <section className="impact" aria-label="Community impact">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <strong>{s.value}</strong>
          <span>{s.label}</span>
        </div>
      ))}
    </section>
  );
}
