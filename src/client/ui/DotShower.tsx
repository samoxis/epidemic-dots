// A short shower of colony-coloured dots when the player beats the lab's forecast. It reacts to a result the player
// earned (never a random reward), plays once and is skipped with reduced motion.
const COLOURS = ['#ffd166', '#9ad9d2', '#c9a8f0', '#f6b8a8', '#a9d3f5', '#f5c6e2', '#e9d9b0'];

export function DotShower() {
  const dots = Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i * 53) % 600,
    size: 10 + ((i * 7) % 8),
    colour: COLOURS[i % COLOURS.length],
  }));
  return (
    <div className="dgv-shower" aria-hidden="true">
      {dots.map((d, i) => (
        <i
          key={i}
          style={{ left: `${d.left}%`, animationDelay: `${d.delay}ms`, width: d.size, height: d.size, background: d.colour }}
        />
      ))}
    </div>
  );
}
