import Image from "next/image";

const markSources = {
  court: "/brand/huddle-mark-green.svg",
  forest: "/brand/huddle-mark-forest.svg",
  ink: "/brand/huddle-mark-ink.svg",
  linen: "/brand/huddle-mark-linen.svg",
} as const;

type BrandMarkProps = Readonly<{
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  size?: number;
  tone?: keyof typeof markSources;
}>;

export function BrandMark({
  className,
  decorative = false,
  priority = false,
  size = 32,
  tone = "court",
}: BrandMarkProps) {
  return (
    <Image
      alt={decorative ? "" : "Huddle"}
      aria-hidden={decorative || undefined}
      className={className}
      draggable={false}
      height={size}
      priority={priority}
      src={markSources[tone]}
      width={size}
    />
  );
}
