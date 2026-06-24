import { IconDice5Filled } from "@tabler/icons-react";
import ProgressiveImage from "../ProgressiveImage";

interface GameCoverProps {
  smallUrl: string | null;
  largeUrl: string | null;
  alt: string;
  /** Приглушить обложку (ч/б) — для отсутствующей в коллекции базы. */
  dimmed?: boolean;
}

/** Квадратная обложка игры: прогрессивная картинка или заглушка-кубик. */
export default function GameCover({
  smallUrl,
  largeUrl,
  alt,
  dimmed = false,
}: GameCoverProps) {
  return (
    <div className="aspect-square overflow-hidden border-b-[3px] border-ink bg-brand-soft">
      {smallUrl || largeUrl ? (
        <ProgressiveImage
          smallUrl={smallUrl}
          largeUrl={largeUrl}
          alt={alt}
          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            dimmed ? "opacity-60 grayscale" : ""
          }`}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-ink/30">
          <IconDice5Filled size={48} />
        </div>
      )}
    </div>
  );
}
