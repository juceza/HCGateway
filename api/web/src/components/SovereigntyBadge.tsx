import { ShieldCheck } from "lucide-react";

import { SOVEREIGNTY_BADGE_DETAIL, SOVEREIGNTY_BADGE_LABEL } from "@/lib/shell";

// Discreet data-sovereignty badge. The copy frames
// ownership and control — "your data, on your server" — and deliberately makes
// NO zero-knowledge claim, because the server decrypts record `data`
// server-side. The full sentence rides in `title` for a hover/tooltip without
// adding chrome to the minimal shell.
export function SovereigntyBadge() {
  return (
    <span
      data-testid="sovereignty-badge"
      title={SOVEREIGNTY_BADGE_DETAIL}
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {SOVEREIGNTY_BADGE_LABEL}
    </span>
  );
}
