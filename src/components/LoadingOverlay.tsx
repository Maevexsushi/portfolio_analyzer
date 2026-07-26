"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * A full-screen wait, for the one moment in this app where nothing on screen changes
 * for several seconds: the file is read, matched, and scored server-side, then the
 * whole report lands at once. A spinner alone reads as "is this stuck"; rotating through
 * what is actually happening reads as progress, even though the work is not truly
 * staged — it is one request, but the reader has no way to know that and no reason to
 * be told. Flat per the rest of the system: a solid tint, no backdrop blur.
 */
export function LoadingOverlay({
  active,
  messages,
}: {
  active: boolean;
  messages: readonly string[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => setIndex((current) => (current + 1) % messages.length), 1400);
    return () => clearInterval(id);
  }, [active, messages.length]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 px-4"
    >
      <div className="card flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <Loader2 size={36} className="animate-spin text-brand" aria-hidden />
        <p className="text-lg font-semibold">{messages[index]}</p>
        <p className="text-sm text-muted">This usually takes a few seconds.</p>
      </div>
    </div>
  );
}
