import type { AvatarId } from "@party/shared";
import { cn } from "../../components/ui/cn";

type Ears = "pointy" | "round" | "tufts" | "long" | "antlers" | "antenna" | "stalks" | "none" | "small";
interface Spec {
  label: string;
  bg: string;
  face: string;
  ears: Ears;
  earColor?: string;
  extra?: "muzzle" | "patches" | "stripes" | "beak" | "duckbill" | "spout" | "nose" | "whiskers" | "bands" | "shell" | "claws";
  extraColor?: string;
}

const INK = "#1C1A17";

export const AVATARS: Record<AvatarId, Spec> = {
  fox: { label: "Fox", bg: "#F6D9C4", face: "#E8743B", ears: "pointy", extra: "muzzle", extraColor: "#FFF6EC" },
  owl: { label: "Owl", bg: "#E5DCCB", face: "#8C6A4A", ears: "tufts", extra: "beak", extraColor: "#E9B949" },
  bear: { label: "Bear", bg: "#E8D9C9", face: "#7A5638", ears: "round", extra: "muzzle", extraColor: "#C9A27E" },
  cat: { label: "Cat", bg: "#DCE3E8", face: "#5E6B78", ears: "pointy", extra: "whiskers", extraColor: "#F2F4F6" },
  frog: { label: "Frog", bg: "#DCEBD3", face: "#5E9E4F", ears: "stalks", extra: "muzzle", extraColor: "#B9DB9F" },
  panda: { label: "Panda", bg: "#E4E4DE", face: "#FBFAF6", ears: "round", earColor: INK, extra: "patches", extraColor: INK },
  koala: { label: "Koala", bg: "#DEE2E2", face: "#A3AAAD", ears: "round", earColor: "#C9CED0", extra: "nose", extraColor: "#3E3A36" },
  tiger: { label: "Tiger", bg: "#F7DFC0", face: "#EE9A32", ears: "small", extra: "stripes", extraColor: INK },
  whale: { label: "Whale", bg: "#D3E3EE", face: "#3F6E95", ears: "none", extra: "spout", extraColor: "#9EC4E0" },
  otter: { label: "Otter", bg: "#E9DED2", face: "#9A6E4C", ears: "small", extra: "muzzle", extraColor: "#E6CDB4" },
  llama: { label: "Llama", bg: "#F1E7DA", face: "#F7F1E6", ears: "long", earColor: "#E6D7C1", extra: "muzzle", extraColor: "#E6D7C1" },
  moose: { label: "Moose", bg: "#E4DBCF", face: "#6B4C36", ears: "antlers", earColor: "#C79A63", extra: "nose", extraColor: "#4A3424" },
  crab: { label: "Crab", bg: "#F7D9D2", face: "#D9543F", ears: "stalks", extra: "claws", extraColor: "#D9543F" },
  bee: { label: "Bee", bg: "#F6EBC2", face: "#F2C230", ears: "antenna", extra: "bands", extraColor: INK },
  duck: { label: "Duck", bg: "#F4EED0", face: "#F7D654", ears: "none", extra: "duckbill", extraColor: "#EE8A2E" },
  snail: { label: "Snail", bg: "#E7E1EE", face: "#B9A6CF", ears: "antenna", extra: "shell", extraColor: "#8B6FAE" },
};

function EarsShape({ ears, color }: { ears: Ears; color: string }) {
  switch (ears) {
    case "pointy":
      return <path d="M11 22 14 7l9 9ZM37 22 34 7l-9 9Z" fill={color} />;
    case "small":
      return (
        <>
          <circle cx="14" cy="17" r="4" fill={color} />
          <circle cx="34" cy="17" r="4" fill={color} />
        </>
      );
    case "round":
      return (
        <>
          <circle cx="13" cy="16" r="6" fill={color} />
          <circle cx="35" cy="16" r="6" fill={color} />
        </>
      );
    case "tufts":
      return <path d="M13 20 13 9l7 7ZM35 20 35 9l-7 7Z" fill={color} />;
    case "long":
      return (
        <>
          <ellipse cx="16" cy="12" rx="3.2" ry="8" fill={color} />
          <ellipse cx="32" cy="12" rx="3.2" ry="8" fill={color} />
        </>
      );
    case "antlers":
      return (
        <g stroke={color} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M16 17 12 8M13 12 8 10M14 14 9 15" />
          <path d="M32 17 36 8M35 12 40 10M34 14 39 15" />
        </g>
      );
    case "antenna":
      return (
        <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill={INK}>
          <path d="M19 16 15 7M29 16 33 7" />
          <circle cx="15" cy="7" r="1.8" />
          <circle cx="33" cy="7" r="1.8" />
        </g>
      );
    case "stalks":
      return (
        <>
          <circle cx="17" cy="15" r="5.5" fill={color} />
          <circle cx="31" cy="15" r="5.5" fill={color} />
        </>
      );
    case "none":
      return null;
  }
}

function Extra({ spec }: { spec: Spec }) {
  const c = spec.extraColor ?? INK;
  switch (spec.extra) {
    case "muzzle":
      return (
        <>
          <ellipse cx="24" cy="33" rx="6.5" ry="4.5" fill={c} />
          <ellipse cx="24" cy="31.4" rx="1.8" ry="1.3" fill={INK} />
        </>
      );
    case "patches":
      return (
        <>
          <ellipse cx="19" cy="27" rx="3.6" ry="4.4" fill={c} transform="rotate(20 19 27)" />
          <ellipse cx="29" cy="27" rx="3.6" ry="4.4" fill={c} transform="rotate(-20 29 27)" />
          <ellipse cx="24" cy="33" rx="1.8" ry="1.3" fill={INK} />
        </>
      );
    case "stripes":
      return <path d="M22 15h4l-1 5h-2ZM14 24l4 1-1 2-3-1ZM34 24l-4 1 1 2 3-1Z" fill={c} />;
    case "beak":
      return <path d="M21.5 30h5L24 34.5Z" fill={c} />;
    case "duckbill":
      return <ellipse cx="24" cy="32.5" rx="6" ry="3" fill={c} />;
    case "spout":
      return <path d="M24 13c0-3-2-4-4-4M24 13c0-3 2-4 4-4M24 13V8" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />;
    case "nose":
      return <ellipse cx="24" cy="31.5" rx="3.6" ry="4" fill={c} />;
    case "whiskers":
      return (
        <g stroke={c} strokeWidth="1.2" strokeLinecap="round">
          <path d="M13 31h6M13 34l6-1.5M35 31h-6M35 34l-6-1.5" />
          <ellipse cx="24" cy="31" rx="1.6" ry="1.2" fill="#E9A0A0" stroke="none" />
        </g>
      );
    case "bands":
      return <path d="M13 31.5h22M14.5 36h19" stroke={c} strokeWidth="2.6" strokeLinecap="round" />;
    case "shell":
      return (
        <g>
          <circle cx="35" cy="34" r="6.5" fill={c} />
          <path d="M35 34m-3 0a3 3 0 1 0 3-3" stroke="#E7E1EE" strokeWidth="1.5" fill="none" />
        </g>
      );
    case "claws":
      return (
        <>
          <path d="M6 30a5 5 0 0 1 7-5l-2 3 3 1a5 5 0 0 1-8 1Z" fill={c} />
          <path d="M42 30a5 5 0 0 0-7-5l2 3-3 1a5 5 0 0 0 8 1Z" fill={c} />
        </>
      );
    default:
      return null;
  }
}

export function AvatarArt({ id, title }: { id: string; title?: string }) {
  const spec = AVATARS[id as AvatarId] ?? AVATARS.fox;
  const eyesOnStalks = spec.ears === "stalks";
  return (
    <svg viewBox="0 0 48 48" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className="block size-full">
      {title && <title>{title}</title>}
      <rect width="48" height="48" fill={spec.bg} />
      <EarsShape ears={spec.ears} color={spec.earColor ?? spec.face} />
      <circle cx="24" cy="28" r="13" fill={spec.face} />
      <Extra spec={spec} />
      {eyesOnStalks ? (
        <>
          <circle cx="17" cy="15" r="2.6" fill="#fff" />
          <circle cx="31" cy="15" r="2.6" fill="#fff" />
          <circle cx="17.4" cy="15.4" r="1.4" fill={INK} />
          <circle cx="31.4" cy="15.4" r="1.4" fill={INK} />
        </>
      ) : (
        <>
          <circle cx="19" cy="26.5" r="1.9" fill={spec.extra === "patches" ? "#fff" : INK} />
          <circle cx="29" cy="26.5" r="1.9" fill={spec.extra === "patches" ? "#fff" : INK} />
        </>
      )}
    </svg>
  );
}

const SIZES = { xs: "size-6 rounded-[5px]", sm: "size-8 rounded-sm", md: "size-11 rounded-md", lg: "size-14 rounded-lg", xl: "size-20 rounded-xl" };

export function Avatar({
  id,
  size = "md",
  dimmed,
  className,
  label,
}: {
  id: string;
  size?: keyof typeof SIZES;
  dimmed?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden border border-ink/10",
        SIZES[size],
        dimmed && "opacity-45 grayscale",
        className,
      )}
    >
      <AvatarArt id={id} title={label} />
    </span>
  );
}
