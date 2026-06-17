import { colorAt } from "@/lib/palette";

/** Renders text with each letter in a different bright color (spaces skipped). */
export default function RainbowText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  let colorIndex = 0;
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => {
        if (ch === " ") return <span key={i}>&nbsp;</span>;
        const color = colorAt(colorIndex++);
        return (
          <span key={i} aria-hidden style={{ color }}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
