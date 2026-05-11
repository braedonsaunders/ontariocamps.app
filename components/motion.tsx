"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

// Tasteful defaults: subtle vertical slide-in, fast spring, no bounce.
const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.05 },
  },
};

const heroVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

type BaseProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

type FadeProps = BaseProps & {
  delay?: number;
  whenInView?: boolean;
};

/**
 * Simple fade-up wrapper. Use for hero sections, section headers, and any
 * standalone element that should "introduce itself" on mount.
 */
export function MotionFadeUp({ children, className, style, delay = 0, whenInView }: FadeProps) {
  if (whenInView) {
    return (
      <motion.div
        className={className}
        style={style}
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ delay }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      variants={fadeUpVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container that staggers its `MotionStaggerItem` children.
 */
export function MotionStagger({ children, className, style, whenInView }: FadeProps) {
  if (whenInView) {
    return (
      <motion.div
        className={className}
        style={style}
        variants={staggerParent}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      variants={staggerParent}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerItem({ children, className, style }: BaseProps) {
  return (
    <motion.div className={className} style={style} variants={fadeUpVariants}>
      {children}
    </motion.div>
  );
}

/**
 * Hero-sized fade-up: larger distance, slower curve. For the top of pages.
 */
export function MotionHero({ children, className, style, delay = 0 }: FadeProps) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={heroVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Card that lifts gently on hover. Use as a drop-in wrapper around card content.
 */
export function MotionLift({ children, className, style }: BaseProps) {
  return (
    <motion.div
      className={className}
      style={style}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}
