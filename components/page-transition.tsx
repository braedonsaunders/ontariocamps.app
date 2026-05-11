"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Light SPA transition: each new route fades in over the previous one.
 *
 * We deliberately do NOT use AnimatePresence + mode="wait" + an exit
 * animation. That sequence had a window where the previous page had
 * already faded to opacity 0 but the new page's RSC hadn't streamed in
 * yet — visible as a flash of white. By only animating the *incoming*
 * route, the previous page stays painted until React commits the new
 * tree, eliminating the flicker.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Opacity-only animation. A `y` translate would set `transform` on this
  // wrapper, which establishes a containing block for `fixed` descendants —
  // breaking the `/map` page that pins maplibre to the viewport. Plain
  // opacity has no such side effect.
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 flex flex-col"
    >
      {children}
    </motion.div>
  );
}
