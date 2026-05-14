export default function Snapshot({ text }: { text: string }) {
  return (
    <section className="rounded-card border border-orange/30 bg-orange/[0.06] p-5">
      <div className="text-[10px] uppercase tracking-wider text-orange/80 mb-2">
        Snapshot
      </div>
      <p className="text-cream text-base leading-relaxed">{text}</p>
    </section>
  );
}
