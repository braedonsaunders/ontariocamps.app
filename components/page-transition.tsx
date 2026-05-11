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
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 flex flex-col"
    >
      {children}
    </motion.div>
  );
}
