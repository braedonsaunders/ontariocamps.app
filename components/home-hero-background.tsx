"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, Images } from "lucide-react";
import { cn } from "@/lib/utils";

const sceneIds = [
  "algonquin-dusk",
  "killarney-dawn",
  "superior-starglow",
  "georgian-bay-noon",
  "muskoka-autumn",
  "bruce-clearwater",
] as const;

export type HomeHeroBackgroundId = (typeof sceneIds)[number];

type HomeHeroBackgroundProps = {
  sceneId?: HomeHeroBackgroundId;
  rotate?: boolean;
  intervalMs?: number;
  className?: string;
};

const homeHeroBackgroundScenes = [
  {
    id: "algonquin-dusk",
    label: "Algonquin dusk",
    swatch: "linear-gradient(135deg, #e995ab 0%, #ffd087 42%, #152836 100%)",
    Scene: AlgonquinDuskScene,
  },
  {
    id: "killarney-dawn",
    label: "Killarney dawn",
    swatch: "linear-gradient(135deg, #ffb88f 0%, #8ed4dc 48%, #253f5f 100%)",
    Scene: KillarneyDawnScene,
  },
  {
    id: "superior-starglow",
    label: "Superior starglow",
    swatch: "linear-gradient(135deg, #86e6c6 0%, #4262b8 45%, #071325 100%)",
    Scene: SuperiorStarglowScene,
  },
  {
    id: "georgian-bay-noon",
    label: "Georgian Bay noon",
    swatch: "linear-gradient(135deg, #dff8ff 0%, #62c7d9 45%, #e08770 100%)",
    Scene: GeorgianBayNoonScene,
  },
  {
    id: "muskoka-autumn",
    label: "Muskoka autumn",
    swatch: "linear-gradient(135deg, #ffc66f 0%, #b44335 42%, #19384d 100%)",
    Scene: MuskokaAutumnScene,
  },
  {
    id: "bruce-clearwater",
    label: "Bruce clearwater",
    swatch: "linear-gradient(135deg, #f5f1d7 0%, #49d0c7 46%, #294f70 100%)",
    Scene: BruceClearwaterScene,
  },
] as const;

export const homeHeroBackgrounds = homeHeroBackgroundScenes.map(({ id, label }) => ({
  id,
  label,
}));

export function HomeHeroBackground({
  sceneId = "algonquin-dusk",
  rotate = true,
  intervalMs = 14000,
  className,
}: HomeHeroBackgroundProps) {
  const requestedScene = useMemo(
    () => homeHeroBackgroundScenes.find((scene) => scene.id === sceneId) ?? homeHeroBackgroundScenes[0],
    [sceneId],
  );
  const [activeId, setActiveId] = useState<HomeHeroBackgroundId>(requestedScene.id);
  const [renderedIds, setRenderedIds] = useState<HomeHeroBackgroundId[]>([requestedScene.id]);
  const [transitionKey, setTransitionKey] = useState(0);
  const [manualSelection, setManualSelection] = useState(false);
  const activeScene =
    homeHeroBackgroundScenes.find((scene) => scene.id === activeId) ?? homeHeroBackgroundScenes[0];

  useEffect(() => {
    setActiveId((currentId) => {
      setRenderedIds(currentId === requestedScene.id ? [requestedScene.id] : [currentId, requestedScene.id]);
      if (currentId !== requestedScene.id) setTransitionKey((key) => key + 1);
      return requestedScene.id;
    });
    setManualSelection(false);
  }, [requestedScene.id]);

  useEffect(() => {
    if (renderedIds.length < 2) return;

    const timer = window.setTimeout(() => {
      setRenderedIds([activeId]);
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [activeId, renderedIds.length]);

  useEffect(() => {
    if (!rotate || manualSelection || homeHeroBackgroundScenes.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveId((currentId) => {
        const currentIndex = homeHeroBackgroundScenes.findIndex((scene) => scene.id === currentId);
        const nextScene = homeHeroBackgroundScenes[(currentIndex + 1) % homeHeroBackgroundScenes.length];
        setRenderedIds([currentId, nextScene.id]);
        setTransitionKey((key) => key + 1);
        return nextScene.id;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, manualSelection, rotate]);

  function handleSceneChange(e: ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value as HomeHeroBackgroundId;

    setManualSelection(true);
    setActiveId((currentId) => {
      if (currentId === nextId) return currentId;

      setRenderedIds([currentId, nextId]);
      setTransitionKey((key) => key + 1);
      return nextId;
    });
  }

  return (
    <>
      <style>{`
        .oc-scene-frame {
          transition:
            opacity 1200ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 1400ms cubic-bezier(0.22, 1, 0.36, 1),
            filter 1100ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform, filter;
        }
        .oc-scene-wash {
          animation: ocSceneWash 1250ms cubic-bezier(0.22, 1, 0.36, 1) both;
          background:
            radial-gradient(circle at 40% 48%, rgba(255, 255, 255, 0.45), transparent 18%),
            linear-gradient(105deg, transparent 0%, rgba(255, 255, 255, 0) 28%, rgba(255, 255, 255, 0.28) 48%, rgba(118, 230, 220, 0.24) 58%, rgba(255, 255, 255, 0) 73%, transparent 100%);
          mix-blend-mode: screen;
        }
        .oc-scene-ripple {
          animation: ocSceneRipple 1250ms cubic-bezier(0.22, 1, 0.36, 1) both;
          background:
            repeating-radial-gradient(ellipse at 48% 76%, rgba(255,255,255,0.28) 0 1px, transparent 1px 18px);
          mask-image: linear-gradient(to top, black 0%, transparent 72%);
          opacity: 0;
        }
        @keyframes ocSceneWash {
          0% { opacity: 0; transform: translateX(-120%) skewX(-12deg) scaleX(0.78); }
          28% { opacity: 0.86; }
          100% { opacity: 0; transform: translateX(120%) skewX(-12deg) scaleX(1.14); }
        }
        @keyframes ocSceneRipple {
          0% { opacity: 0; transform: translateY(24px) scale(0.94); }
          35% { opacity: 0.45; }
          100% { opacity: 0; transform: translateY(-16px) scale(1.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-scene-frame,
          .oc-scene-wash,
          .oc-scene-ripple {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
        data-active-scene={activeId}
      >
        {homeHeroBackgroundScenes
          .filter(({ id }) => renderedIds.includes(id))
          .map(({ id, Scene }) => (
            <div
              key={id}
              className={cn(
                "oc-scene-frame absolute inset-0",
                id === activeId
                  ? "translate-y-0 scale-100 opacity-100 blur-0"
                  : "-translate-y-2 scale-[1.035] opacity-0 blur-md",
              )}
            >
              <Scene />
            </div>
          ))}
        {transitionKey > 0 && (
          <>
            <div key={`wash-${transitionKey}`} className="oc-scene-wash absolute -inset-x-1/3 inset-y-0" />
            <div key={`ripple-${transitionKey}`} className="oc-scene-ripple absolute inset-x-0 bottom-0 h-2/3" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/40" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-forest-950/75 to-transparent" />
      </div>
      <div className="absolute right-4 top-4 z-20 sm:right-6 lg:right-8">
        <div className="group flex h-10 items-center gap-2 rounded-full border border-white/18 bg-black/18 pl-3 pr-2 text-white shadow-lg shadow-black/15 backdrop-blur-md transition-colors duration-300 hover:bg-black/26">
          <Images size={15} className="text-white/75" aria-hidden="true" />
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/45 transition-all duration-500"
            style={{ background: activeScene.swatch }}
            aria-hidden="true"
          />
          <div className="relative">
            <select
              aria-label="Homepage background"
              value={activeId}
              onChange={handleSceneChange}
              className="h-10 max-w-[11rem] appearance-none bg-transparent py-0 pl-0 pr-7 text-sm font-medium text-white outline-none transition-colors duration-300 group-hover:text-white"
            >
              {homeHeroBackgroundScenes.map((scene) => (
                <option key={scene.id} value={scene.id} className="text-stone-900">
                  {scene.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-white/75 transition-transform duration-300 group-hover:translate-y-[-40%]"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function AlgonquinDuskScene() {
  return (
    <svg
      className="oc-home-hero-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-home-hero-svg .oc-cloud-a {
          animation: ocCloudA 42s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-cloud-b {
          animation: ocCloudB 56s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-cloud-c {
          animation: ocCloudC 48s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-glow-pulse {
          animation: ocGlowPulse 8s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-mist {
          animation: ocMist 22s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-mist-slow {
          animation: ocMistSlow 30s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-water-ripples {
          animation: ocWaterRipples 13s linear infinite alternate;
        }
        .oc-home-hero-svg .oc-water-shine {
          animation: ocWaterShine 9s ease-in-out infinite alternate;
        }
        .oc-home-hero-svg .oc-tree-breathe {
          animation: ocTreeBreathe 11s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        @keyframes ocCloudA {
          from { transform: translate3d(-26px, 6px, 0) scale(1); }
          to { transform: translate3d(34px, -5px, 0) scale(1.018); }
        }
        @keyframes ocCloudB {
          from { transform: translate3d(30px, -7px, 0) scale(1.015); }
          to { transform: translate3d(-42px, 6px, 0) scale(1); }
        }
        @keyframes ocCloudC {
          from { transform: translate3d(-18px, -2px, 0); }
          to { transform: translate3d(22px, 5px, 0); }
        }
        @keyframes ocGlowPulse {
          from { opacity: 0.76; transform: scale(0.99); }
          to { opacity: 1; transform: scale(1.035); }
        }
        @keyframes ocMist {
          from { transform: translateX(-42px); opacity: 0.34; }
          to { transform: translateX(58px); opacity: 0.62; }
        }
        @keyframes ocMistSlow {
          from { transform: translateX(50px); opacity: 0.2; }
          to { transform: translateX(-54px); opacity: 0.44; }
        }
        @keyframes ocWaterRipples {
          from { transform: translateX(-38px); }
          to { transform: translateX(38px); }
        }
        @keyframes ocWaterShine {
          from { opacity: 0.18; transform: translateY(2px); }
          to { opacity: 0.42; transform: translateY(-3px); }
        }
        @keyframes ocTreeBreathe {
          from { transform: skewX(-0.25deg); }
          to { transform: skewX(0.35deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-home-hero-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5f6fbd" />
          <stop offset="21%" stopColor="#e995ab" />
          <stop offset="39%" stopColor="#ffd087" />
          <stop offset="56%" stopColor="#aebfdf" />
          <stop offset="79%" stopColor="#385d82" />
          <stop offset="100%" stopColor="#152836" />
        </linearGradient>
        <radialGradient id="oc-sunbreak" cx="52%" cy="17%" r="42%">
          <stop offset="0%" stopColor="#fff8d6" stopOpacity="0.95" />
          <stop offset="30%" stopColor="#ffd694" stopOpacity="0.72" />
          <stop offset="62%" stopColor="#f193a5" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#293e69" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oc-cloud-warmth" cx="52%" cy="27%" r="44%">
          <stop offset="0%" stopColor="#fff3ce" stopOpacity="0.9" />
          <stop offset="42%" stopColor="#f9a273" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#7a5cae" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#21394c" />
          <stop offset="37%" stopColor="#162c3e" />
          <stop offset="100%" stopColor="#0b1824" />
        </linearGradient>
        <linearGradient id="oc-reflection" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f6b081" stopOpacity="0.36" />
          <stop offset="45%" stopColor="#6f85b9" stopOpacity="0.17" />
          <stop offset="100%" stopColor="#0e1f2e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="oc-mist-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#b7d8e8" stopOpacity="0" />
          <stop offset="18%" stopColor="#c8e7f0" stopOpacity="0.22" />
          <stop offset="48%" stopColor="#e7f5f1" stopOpacity="0.4" />
          <stop offset="78%" stopColor="#b6d0e6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#b7d8e8" stopOpacity="0" />
        </linearGradient>
        <filter id="oc-blur-sm" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <filter id="oc-blur-lg" x="-40%" y="-50%" width="180%" height="200%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="oc-glow" x="-50%" y="-60%" width="200%" height="220%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feColorMatrix
            in="blur"
            result="warm"
            type="matrix"
            values="1.08 0 0 0 0.08 0 0.8 0 0 0.04 0 0 0.42 0 0 0 0 0 0.84 0"
          />
          <feMerge>
            <feMergeNode in="warm" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="oc-lake-clip">
          <path d="M0 386 C260 372 406 392 620 382 C827 372 1058 388 1248 378 C1407 369 1516 381 1600 374 L1600 620 L0 620 Z" />
        </clipPath>
        <path
          id="oc-left-ridge"
          d="M0 318 C91 267 168 264 257 291 C335 314 414 296 505 277 C606 255 703 270 795 312 L795 408 L0 408 Z"
        />
        <path
          id="oc-right-forest-mass"
          d="M715 332 C764 305 792 263 846 247 C910 228 934 277 989 254 C1057 225 1091 252 1147 231 C1195 214 1235 240 1282 213 C1332 184 1391 201 1428 225 C1484 260 1536 225 1600 244 L1600 407 L715 407 Z"
        />
      </defs>

      <rect width="1800" height="700" fill="url(#oc-sky)" />
      <rect y="388" width="1800" height="312" fill="url(#oc-lake)" />
      <rect className="oc-glow-pulse" width="1800" height="430" fill="url(#oc-sunbreak)" />
      <ellipse cx="900" cy="124" rx="540" ry="196" fill="url(#oc-cloud-warmth)" opacity="0.66" filter="url(#oc-blur-lg)" />

      <path
        d="M0 332 C123 289 247 301 356 318 C492 338 596 285 736 297 C851 307 934 345 1036 334 C1194 317 1316 284 1480 306 C1618 325 1711 292 1800 314 L1800 423 L0 423 Z"
        fill="#2a5270"
        opacity="0.36"
      />
      <path
        d="M0 365 C118 336 236 348 349 365 C512 389 637 337 792 349 C946 361 1034 398 1166 378 C1320 354 1449 334 1589 354 C1690 368 1753 350 1800 357 L1800 432 L0 432 Z"
        fill="#15394e"
        opacity="0.48"
      />
      <g className="oc-tree-breathe">
        <TreeLine count={72} baseY={402} color="#173a4c" heightBase={30} heightVariance={29} opacity={0.44} spacing={25} xOffset={-8} seed={8.9} />
        <TreeLine count={58} baseY={410} color="#0d2a38" heightBase={38} heightVariance={34} opacity={0.36} spacing={31} xOffset={10} seed={10.6} />
      </g>

      <g transform="translate(92 42) scale(0.9)">

      <g className="oc-cloud-a" opacity="0.78" filter="url(#oc-blur-sm)">
        <path
          d="M-48 84 C72 35 181 67 292 50 C413 31 483 -24 624 23 C742 62 845 50 945 27 C1079 -3 1192 28 1275 78 C1385 144 1518 105 1649 132 L1657 0 L-48 0 Z"
          fill="#4e5d9b"
          opacity="0.46"
        />
        <path
          d="M0 91 C104 41 226 66 344 56 C456 47 535 -8 655 35 C728 61 822 103 899 69 C997 25 1066 48 1138 101 C1228 169 1345 116 1468 127 C1535 133 1580 161 1615 191 L1610 0 L0 0 Z"
          fill="#f0a1ac"
          opacity="0.38"
        />
      </g>

      <g className="oc-cloud-b" filter="url(#oc-glow)">
        <path
          d="M590 174 C625 121 694 132 741 113 C793 91 827 34 890 49 C940 61 968 108 1015 100 C1086 87 1133 118 1158 164 C1180 204 1231 209 1268 242 C1177 232 1093 224 990 235 C846 250 715 234 590 174 Z"
          fill="#ffe4b3"
          opacity="0.72"
        />
        <path
          d="M650 190 C692 147 744 160 787 134 C840 103 861 68 913 83 C952 94 977 139 1020 136 C1087 131 1129 158 1153 197 C1041 188 946 204 842 206 C767 208 707 201 650 190 Z"
          fill="#fca46f"
          opacity="0.34"
        />
        <path
          d="M725 127 C757 101 794 111 815 84 C849 39 910 37 944 71 C965 93 975 125 1008 126 C1058 128 1099 147 1116 183 C1047 164 996 164 936 172 C849 184 780 172 725 127 Z"
          fill="#fff9df"
          opacity="0.58"
        />
      </g>

      <g className="oc-cloud-c" opacity="0.55" filter="url(#oc-blur-sm)">
        <path
          d="M131 214 C204 177 286 188 357 205 C459 230 538 191 632 202 C711 211 758 235 800 267 C680 258 555 276 414 260 C285 246 196 253 84 278 C75 251 90 231 131 214 Z"
          fill="#253f6f"
          opacity="0.55"
        />
        <path
          d="M925 246 C1007 210 1078 223 1158 244 C1260 270 1359 230 1488 246 C1544 253 1587 273 1626 306 C1466 285 1309 302 1135 289 C1033 281 948 290 867 310 C860 282 879 266 925 246 Z"
          fill="#2f4771"
          opacity="0.5"
        />
      </g>

      <use href="#oc-left-ridge" fill="#294a66" opacity="0.56" />
      <path
        d="M0 340 C113 297 231 298 335 318 C450 341 558 316 667 318 C755 320 838 344 921 372 L921 412 L0 412 Z"
        fill="#173548"
        opacity="0.6"
      />
      <path
        d="M0 365 C93 339 212 337 318 352 C436 369 562 346 706 356 C800 363 889 379 963 402 L0 414 Z"
        fill="#102b3a"
        opacity="0.82"
      />

      <g className="oc-tree-breathe">
        <TreeLine count={62} baseY={379} color="#153545" heightBase={54} heightVariance={42} opacity={0.55} spacing={17} xOffset={-18} seed={0.5} />
        <TreeLine count={40} baseY={373} color="#0e2a38" heightBase={74} heightVariance={66} opacity={0.7} spacing={18} xOffset={18} seed={2.1} />
      </g>

      <use href="#oc-right-forest-mass" fill="#091724" opacity="0.96" />
      <g className="oc-tree-breathe">
        <TreeLine count={58} baseY={385} color="#081622" heightBase={114} heightVariance={118} opacity={0.96} spacing={17} xOffset={698} seed={4.2} />
        <TreeLine count={28} baseY={379} color="#0d1d2d" heightBase={78} heightVariance={84} opacity={0.9} spacing={18} xOffset={1120} seed={6.7} />
      </g>

      <g opacity="0.96">
        <PineTree x={748} baseY={384} height={192} width={92} fill="#071521" />
        <PineTree x={789} baseY={385} height={262} width={116} fill="#071420" />
        <PineTree x={833} baseY={386} height={218} width={104} fill="#081621" />
        <PineTree x={1284} baseY={382} height={236} width={104} fill="#06131d" />
        <PineTree x={1343} baseY={382} height={283} width={122} fill="#06131d" />
        <PineTree x={1406} baseY={383} height={245} width={108} fill="#06131d" />
        <BareSnag x={1449} baseY={382} height={250} color="#08131b" />
      </g>

      <g className="oc-mist" filter="url(#oc-blur-lg)">
        <path
          d="M-80 353 C75 337 185 371 339 354 C511 335 651 352 806 368 C956 384 1094 344 1237 359 C1392 376 1517 347 1680 355 L1680 409 L-80 409 Z"
          fill="url(#oc-mist-gradient)"
        />
      </g>
      <g className="oc-mist-slow" filter="url(#oc-blur-lg)">
        <path
          d="M-120 327 C53 315 155 342 319 329 C467 317 573 338 713 347 C905 359 1016 320 1168 330 C1314 339 1450 321 1720 338 L1720 384 L-120 386 Z"
          fill="#c9e0ea"
          opacity="0.25"
        />
      </g>

      <g clipPath="url(#oc-lake-clip)">
        <rect y="374" width="1600" height="246" fill="url(#oc-lake)" />
        <use href="#oc-left-ridge" transform="translate(0 777) scale(1 -0.62)" fill="#13283a" opacity="0.45" />
        <use href="#oc-right-forest-mass" transform="translate(0 768) scale(1 -0.55)" fill="#06111d" opacity="0.72" />
        <path
          d="M458 389 C564 386 643 392 730 385 C815 378 892 383 969 390 C878 415 783 433 681 430 C581 427 512 414 458 389 Z"
          fill="url(#oc-reflection)"
          opacity="0.65"
          filter="url(#oc-blur-sm)"
        />
        <path
          d="M716 387 C775 389 840 386 898 390 C851 437 806 494 765 602 C752 515 740 446 716 387 Z"
          fill="#05121e"
          opacity="0.42"
          filter="url(#oc-blur-sm)"
        />
        <path
          d="M1268 383 C1325 384 1396 382 1468 386 C1412 444 1374 513 1347 620 C1320 524 1296 448 1268 383 Z"
          fill="#050f19"
          opacity="0.54"
          filter="url(#oc-blur-sm)"
        />
        <g className="oc-water-shine" filter="url(#oc-blur-sm)">
          <ellipse cx="801" cy="425" rx="205" ry="18" fill="#ffc28c" opacity="0.35" />
          <ellipse cx="1018" cy="461" rx="168" ry="11" fill="#8eb4d4" opacity="0.16" />
          <ellipse cx="333" cy="429" rx="248" ry="13" fill="#9ac4d7" opacity="0.15" />
        </g>
        <g className="oc-water-ripples">
          <WaterRipples />
        </g>
      </g>

      <path
        d="M0 386 C260 372 406 392 620 382 C827 372 1058 388 1248 378 C1407 369 1516 381 1600 374"
        fill="none"
        stroke="#d4eced"
        strokeOpacity="0.28"
        strokeWidth="2"
      />
      </g>

      <g className="oc-water-shine">
        <path
          d="M110 444 C260 432 401 452 548 442 C712 431 820 450 978 443 C1124 437 1252 419 1412 433 C1514 442 1632 430 1762 438"
          fill="none"
          stroke="#cfe9ee"
          strokeOpacity="0.17"
          strokeWidth="3"
        />
        <ellipse cx="896" cy="516" rx="374" ry="18" fill="#f7b984" opacity="0.14" />
        <ellipse cx="1244" cy="574" rx="284" ry="13" fill="#8dbdd1" opacity="0.11" />
        <ellipse cx="440" cy="559" rx="332" ry="11" fill="#9bc9d7" opacity="0.09" />
      </g>
      <g className="oc-water-ripples" opacity="0.56">
        <WideWaterRipples />
      </g>
      <path
        d="M0 390 C283 378 432 401 664 389 C887 377 1112 398 1329 385 C1512 374 1652 389 1800 379"
        fill="none"
        stroke="#d4eced"
        strokeOpacity="0.18"
        strokeWidth="1.4"
      />
      <rect y="0" width="1800" height="700" fill="#06131e" opacity="0.08" />
    </svg>
  );
}

function KillarneyDawnScene() {
  return (
    <svg
      className="oc-killarney-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-killarney-svg .oc-kill-clouds {
          animation: ocKillClouds 44s ease-in-out infinite alternate;
        }
        .oc-killarney-svg .oc-kill-haze {
          animation: ocKillHaze 26s ease-in-out infinite alternate;
        }
        .oc-killarney-svg .oc-kill-glow {
          animation: ocKillGlow 9s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center;
        }
        .oc-killarney-svg .oc-kill-shine {
          animation: ocKillShine 11s ease-in-out infinite alternate;
        }
        .oc-killarney-svg .oc-kill-ripples {
          animation: ocKillRipples 15s linear infinite alternate;
        }
        .oc-killarney-svg .oc-kill-trees {
          animation: ocKillTrees 12s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        @keyframes ocKillClouds {
          from { transform: translate3d(-36px, 4px, 0); }
          to { transform: translate3d(42px, -6px, 0); }
        }
        @keyframes ocKillHaze {
          from { transform: translateX(48px); opacity: 0.24; }
          to { transform: translateX(-58px); opacity: 0.5; }
        }
        @keyframes ocKillGlow {
          from { opacity: 0.68; transform: scale(0.98); }
          to { opacity: 0.95; transform: scale(1.035); }
        }
        @keyframes ocKillShine {
          from { opacity: 0.22; transform: translateY(2px); }
          to { opacity: 0.48; transform: translateY(-3px); }
        }
        @keyframes ocKillRipples {
          from { transform: translateX(-34px); }
          to { transform: translateX(34px); }
        }
        @keyframes ocKillTrees {
          from { transform: skewX(-0.18deg); }
          to { transform: skewX(0.24deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-killarney-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-kill-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#405c94" />
          <stop offset="22%" stopColor="#ff9f93" />
          <stop offset="42%" stopColor="#ffe2b2" />
          <stop offset="66%" stopColor="#8ed2dc" />
          <stop offset="100%" stopColor="#23465f" />
        </linearGradient>
        <radialGradient id="oc-kill-sun" cx="61%" cy="25%" r="37%">
          <stop offset="0%" stopColor="#fff8d9" stopOpacity="0.98" />
          <stop offset="32%" stopColor="#ffc48f" stopOpacity="0.58" />
          <stop offset="72%" stopColor="#8aceda" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#224563" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-kill-lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2e7186" />
          <stop offset="46%" stopColor="#1e5069" />
          <stop offset="100%" stopColor="#102c42" />
        </linearGradient>
        <linearGradient id="oc-kill-granite" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd1aa" />
          <stop offset="38%" stopColor="#d98585" />
          <stop offset="72%" stopColor="#775e82" />
          <stop offset="100%" stopColor="#24344f" />
        </linearGradient>
        <linearGradient id="oc-kill-granite-dark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#9e6d7b" />
          <stop offset="48%" stopColor="#51476d" />
          <stop offset="100%" stopColor="#17283d" />
        </linearGradient>
        <linearGradient id="oc-kill-mist" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#eef8ee" stopOpacity="0" />
          <stop offset="26%" stopColor="#fff4dc" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#ccecf0" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#eef8ee" stopOpacity="0" />
        </linearGradient>
        <filter id="oc-kill-blur" x="-25%" y="-35%" width="150%" height="170%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="oc-kill-soft" x="-20%" y="-25%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1800" height="700" fill="url(#oc-kill-sky)" />
      <rect y="382" width="1800" height="318" fill="url(#oc-kill-lake)" />
      <rect className="oc-kill-glow" width="1800" height="420" fill="url(#oc-kill-sun)" />
      <circle cx="1112" cy="196" r="46" fill="#fff6cf" opacity="0.86" filter="url(#oc-kill-soft)" />

      <g className="oc-kill-clouds" filter="url(#oc-kill-soft)">
        <path
          d="M-60 108 C93 62 226 92 364 78 C507 64 620 16 753 58 C876 96 988 86 1107 58 C1242 26 1354 53 1455 105 C1578 169 1682 132 1850 157 L1850 0 L-60 0 Z"
          fill="#fff0ce"
          opacity="0.3"
        />
        <path
          d="M290 230 C377 194 461 208 542 220 C643 236 738 193 833 214 C931 235 1003 259 1097 238 C1200 214 1307 226 1410 261 C1248 259 1116 284 947 277 C792 271 659 284 515 270 C423 262 347 269 244 289 C236 262 249 244 290 230 Z"
          fill="#fbb9a4"
          opacity="0.26"
        />
      </g>

      <path
        d="M0 328 C148 289 273 316 409 297 C558 276 672 303 815 288 C938 275 1026 313 1157 299 C1317 281 1449 297 1575 318 C1660 332 1733 318 1800 306 L1800 430 L0 430 Z"
        fill="#315b75"
        opacity="0.42"
      />
      <path
        d="M0 371 C154 347 297 366 451 350 C611 334 748 362 903 348 C1055 335 1195 358 1336 352 C1507 345 1640 370 1800 354 L1800 424 L0 424 Z"
        fill="#17384e"
        opacity="0.58"
      />

      <g className="oc-kill-trees">
        <TreeLine count={72} baseY={374} color="#173b3e" heightBase={34} heightVariance={39} opacity={0.54} spacing={25} xOffset={0} seed={3.4} />
        <TreeLine count={50} baseY={390} color="#0d2933" heightBase={44} heightVariance={47} opacity={0.7} spacing={31} xOffset={118} seed={5.8} />
      </g>

      <path
        d="M0 418 C86 356 168 336 263 355 C356 373 438 330 529 348 C609 365 661 421 724 452 L0 472 Z"
        fill="url(#oc-kill-granite)"
      />
      <path
        d="M112 407 C184 376 235 371 303 390 C366 408 430 380 515 395 C432 425 327 445 226 450 C149 454 84 446 32 430 C58 421 87 414 112 407 Z"
        fill="#ffd8ad"
        opacity="0.35"
      />
      <path
        d="M655 446 C753 397 829 395 918 418 C1000 439 1061 402 1149 413 C1253 426 1325 458 1426 452 C1512 448 1586 421 1681 437 C1729 445 1765 459 1800 476 L1800 525 L655 525 Z"
        fill="url(#oc-kill-granite-dark)"
      />
      <path
        d="M836 431 C919 413 985 431 1052 440 C1130 451 1200 429 1272 439 C1191 464 1093 475 997 470 C922 466 868 452 836 431 Z"
        fill="#f6b095"
        opacity="0.24"
      />

      <g className="oc-kill-haze" filter="url(#oc-kill-blur)">
        <path
          d="M-120 363 C74 341 204 378 386 358 C540 341 662 359 821 370 C1004 383 1132 350 1295 360 C1464 371 1606 347 1920 367 L1920 424 L-120 426 Z"
          fill="url(#oc-kill-mist)"
        />
      </g>

      <g opacity="0.55" transform="translate(0 819) scale(1 -0.74)">
        <path
          d="M0 418 C86 356 168 336 263 355 C356 373 438 330 529 348 C609 365 661 421 724 452 L0 472 Z"
          fill="#18354b"
        />
        <path
          d="M655 446 C753 397 829 395 918 418 C1000 439 1061 402 1149 413 C1253 426 1325 458 1426 452 C1512 448 1586 421 1681 437 C1729 445 1765 459 1800 476 L1800 525 L655 525 Z"
          fill="#122d44"
        />
      </g>

      <g className="oc-kill-shine">
        <ellipse cx="1075" cy="472" rx="350" ry="19" fill="#ffe2a8" opacity="0.3" filter="url(#oc-kill-soft)" />
        <ellipse cx="410" cy="532" rx="300" ry="14" fill="#9fe1e1" opacity="0.15" />
        <path
          d="M184 443 C346 431 488 452 650 444 C833 435 980 452 1146 441 C1342 428 1537 433 1708 448"
          fill="none"
          stroke="#d7f3ee"
          strokeOpacity="0.22"
          strokeWidth="2.4"
        />
      </g>
      <g className="oc-kill-ripples" opacity="0.66">
        <WideWaterRipples />
      </g>
      <rect width="1800" height="700" fill="#071b28" opacity="0.06" />
    </svg>
  );
}

function SuperiorStarglowScene() {
  return (
    <svg
      className="oc-superior-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-superior-svg .oc-superior-aurora-a {
          animation: ocSuperiorAuroraA 18s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center;
        }
        .oc-superior-svg .oc-superior-aurora-b {
          animation: ocSuperiorAuroraB 24s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center;
        }
        .oc-superior-svg .oc-superior-stars {
          animation: ocSuperiorStars 6s ease-in-out infinite alternate;
        }
        .oc-superior-svg .oc-superior-mist {
          animation: ocSuperiorMist 28s ease-in-out infinite alternate;
        }
        .oc-superior-svg .oc-superior-ripples {
          animation: ocSuperiorRipples 16s linear infinite alternate;
        }
        .oc-superior-svg .oc-superior-moon {
          animation: ocSuperiorMoon 10s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes ocSuperiorAuroraA {
          from { opacity: 0.42; transform: translate3d(-22px, 12px, 0) skewX(-3deg); }
          to { opacity: 0.72; transform: translate3d(28px, -8px, 0) skewX(2deg); }
        }
        @keyframes ocSuperiorAuroraB {
          from { opacity: 0.28; transform: translate3d(36px, -6px, 0) scaleY(0.96); }
          to { opacity: 0.58; transform: translate3d(-30px, 8px, 0) scaleY(1.06); }
        }
        @keyframes ocSuperiorStars {
          from { opacity: 0.58; }
          to { opacity: 0.95; }
        }
        @keyframes ocSuperiorMist {
          from { transform: translateX(-48px); opacity: 0.18; }
          to { transform: translateX(64px); opacity: 0.38; }
        }
        @keyframes ocSuperiorRipples {
          from { transform: translateX(-44px); }
          to { transform: translateX(44px); }
        }
        @keyframes ocSuperiorMoon {
          from { opacity: 0.78; transform: scale(0.985); }
          to { opacity: 1; transform: scale(1.025); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-superior-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-superior-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#071325" />
          <stop offset="32%" stopColor="#17305f" />
          <stop offset="55%" stopColor="#264b75" />
          <stop offset="75%" stopColor="#142b44" />
          <stop offset="100%" stopColor="#071420" />
        </linearGradient>
        <radialGradient id="oc-superior-moon-glow" cx="76%" cy="19%" r="32%">
          <stop offset="0%" stopColor="#f7fbff" stopOpacity="0.92" />
          <stop offset="24%" stopColor="#b9d9ff" stopOpacity="0.38" />
          <stop offset="68%" stopColor="#5a78cc" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#071325" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-superior-lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1c496d" />
          <stop offset="45%" stopColor="#102b47" />
          <stop offset="100%" stopColor="#06111e" />
        </linearGradient>
        <linearGradient id="oc-superior-aurora" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#67ffd0" stopOpacity="0" />
          <stop offset="30%" stopColor="#8bf3d0" stopOpacity="0.64" />
          <stop offset="58%" stopColor="#79a9ff" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#b889ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="oc-superior-rock" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#304c70" />
          <stop offset="48%" stopColor="#182b47" />
          <stop offset="100%" stopColor="#07111f" />
        </linearGradient>
        <filter id="oc-superior-blur" x="-25%" y="-35%" width="150%" height="170%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="oc-superior-soft" x="-20%" y="-25%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1800" height="700" fill="url(#oc-superior-sky)" />
      <rect y="390" width="1800" height="310" fill="url(#oc-superior-lake)" />
      <rect className="oc-superior-moon" width="1800" height="420" fill="url(#oc-superior-moon-glow)" />
      <circle cx="1362" cy="130" r="35" fill="#f7fbff" opacity="0.86" />
      <circle cx="1348" cy="118" r="34" fill="#dfefff" opacity="0.16" />

      <g className="oc-superior-stars">
        <StarField />
      </g>

      <g className="oc-superior-aurora-a" filter="url(#oc-superior-blur)">
        <path
          d="M-90 221 C124 146 293 184 458 157 C635 128 747 66 914 103 C1107 146 1213 107 1394 82 C1532 63 1651 96 1890 77 L1890 282 C1663 242 1512 235 1359 254 C1174 277 1039 231 879 206 C720 181 579 229 416 245 C234 263 79 242 -90 302 Z"
          fill="url(#oc-superior-aurora)"
          opacity="0.78"
        />
      </g>
      <g className="oc-superior-aurora-b" filter="url(#oc-superior-blur)">
        <path
          d="M138 152 C306 98 475 122 620 151 C794 185 936 127 1106 139 C1262 150 1405 201 1572 174 C1671 159 1745 144 1838 150 L1838 286 C1677 298 1531 256 1392 251 C1229 244 1117 292 955 259 C779 223 661 244 514 225 C372 207 246 205 90 249 Z"
          fill="#7de7ff"
          opacity="0.3"
        />
      </g>

      <path
        d="M0 346 C130 315 261 328 394 304 C545 277 688 316 815 307 C958 296 1083 264 1238 293 C1384 320 1517 300 1660 282 C1725 274 1769 284 1800 292 L1800 430 L0 430 Z"
        fill="#1f4163"
        opacity="0.54"
      />
      <path
        d="M0 380 C135 354 257 367 394 352 C568 332 682 368 839 352 C1019 333 1148 359 1318 349 C1484 340 1630 366 1800 346 L1800 430 L0 430 Z"
        fill="#0f2940"
        opacity="0.78"
      />
      <g opacity="0.78">
        <TreeLine count={68} baseY={390} color="#081a28" heightBase={46} heightVariance={58} opacity={0.88} spacing={27} xOffset={-14} seed={11.8} />
        <TreeLine count={42} baseY={382} color="#061520" heightBase={56} heightVariance={66} opacity={0.96} spacing={36} xOffset={620} seed={13.2} />
      </g>

      <path
        d="M0 456 C76 397 174 379 276 393 C354 403 416 367 496 379 C578 392 648 433 717 474 L0 515 Z"
        fill="url(#oc-superior-rock)"
      />
      <path
        d="M1187 449 C1269 386 1372 376 1468 396 C1543 411 1609 382 1685 399 C1735 410 1770 432 1800 459 L1800 526 L1187 526 Z"
        fill="#071321"
      />
      <path
        d="M1217 428 C1295 409 1373 420 1437 433 C1370 456 1287 463 1217 428 Z"
        fill="#496083"
        opacity="0.2"
      />

      <g className="oc-superior-mist" filter="url(#oc-superior-blur)">
        <path
          d="M-120 374 C98 351 239 389 449 370 C659 351 812 385 1016 374 C1247 362 1397 344 1595 365 C1698 376 1791 365 1920 358 L1920 428 L-120 428 Z"
          fill="#c7e8ed"
          opacity="0.22"
        />
      </g>

      <g opacity="0.5" transform="translate(0 834) scale(1 -0.72)">
        <path
          d="M0 456 C76 397 174 379 276 393 C354 403 416 367 496 379 C578 392 648 433 717 474 L0 515 Z"
          fill="#071321"
        />
        <path
          d="M1187 449 C1269 386 1372 376 1468 396 C1543 411 1609 382 1685 399 C1735 410 1770 432 1800 459 L1800 526 L1187 526 Z"
          fill="#050d18"
        />
      </g>

      <g filter="url(#oc-superior-soft)">
        <ellipse cx="1362" cy="469" rx="230" ry="14" fill="#cce7ff" opacity="0.22" />
        <ellipse cx="822" cy="520" rx="355" ry="18" fill="#78f0cf" opacity="0.12" />
        <path
          d="M64 431 C245 416 388 439 570 428 C771 416 958 438 1153 426 C1367 413 1556 422 1736 435"
          fill="none"
          stroke="#a8d7e6"
          strokeOpacity="0.18"
          strokeWidth="2.2"
        />
      </g>
      <g className="oc-superior-ripples" opacity="0.58">
        <WideWaterRipples />
      </g>
      <rect width="1800" height="700" fill="#030b14" opacity="0.08" />
    </svg>
  );
}

function GeorgianBayNoonScene() {
  return (
    <svg
      className="oc-georgian-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-georgian-svg .oc-gb-clouds {
          animation: ocGbClouds 38s ease-in-out infinite alternate;
        }
        .oc-georgian-svg .oc-gb-sparkle {
          animation: ocGbSparkle 7s ease-in-out infinite alternate;
        }
        .oc-georgian-svg .oc-gb-ripples {
          animation: ocGbRipples 14s linear infinite alternate;
        }
        .oc-georgian-svg .oc-gb-pines {
          animation: ocGbPines 12s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        @keyframes ocGbClouds {
          from { transform: translate3d(-34px, 2px, 0); }
          to { transform: translate3d(44px, -5px, 0); }
        }
        @keyframes ocGbSparkle {
          from { opacity: 0.22; transform: translateY(2px); }
          to { opacity: 0.56; transform: translateY(-2px); }
        }
        @keyframes ocGbRipples {
          from { transform: translateX(-38px); }
          to { transform: translateX(38px); }
        }
        @keyframes ocGbPines {
          from { transform: skewX(-0.16deg); }
          to { transform: skewX(0.22deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-georgian-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-gb-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#dff8ff" />
          <stop offset="38%" stopColor="#9bddea" />
          <stop offset="70%" stopColor="#63c5d8" />
          <stop offset="100%" stopColor="#2c8198" />
        </linearGradient>
        <radialGradient id="oc-gb-sun" cx="73%" cy="18%" r="35%">
          <stop offset="0%" stopColor="#fffbd6" stopOpacity="0.88" />
          <stop offset="33%" stopColor="#fff3b1" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#89d8e5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-gb-lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5fd2dc" />
          <stop offset="42%" stopColor="#279eb6" />
          <stop offset="100%" stopColor="#0d4766" />
        </linearGradient>
        <linearGradient id="oc-gb-granite" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f4af91" />
          <stop offset="40%" stopColor="#c66c64" />
          <stop offset="100%" stopColor="#554565" />
        </linearGradient>
        <linearGradient id="oc-gb-granite-cool" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd0aa" />
          <stop offset="44%" stopColor="#917190" />
          <stop offset="100%" stopColor="#233b58" />
        </linearGradient>
        <filter id="oc-gb-soft" x="-20%" y="-25%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="oc-gb-blur" x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <rect width="1800" height="700" fill="url(#oc-gb-sky)" />
      <rect y="365" width="1800" height="335" fill="url(#oc-gb-lake)" />
      <rect width="1800" height="410" fill="url(#oc-gb-sun)" />

      <g className="oc-gb-clouds" filter="url(#oc-gb-soft)">
        <path
          d="M-80 132 C86 75 238 112 394 95 C538 79 645 34 790 74 C918 110 1037 98 1164 70 C1310 38 1454 68 1572 120 C1657 158 1730 151 1880 170 L1880 0 L-80 0 Z"
          fill="#fff8e1"
          opacity="0.42"
        />
        <path
          d="M171 248 C275 205 371 221 456 237 C587 262 692 212 821 229 C958 248 1059 277 1194 251 C1316 228 1436 244 1553 285 C1376 280 1219 309 1033 300 C853 292 707 306 534 289 C389 275 278 287 115 325 C100 292 120 266 171 248 Z"
          fill="#edfaff"
          opacity="0.32"
        />
      </g>

      <path
        d="M0 330 C138 303 260 318 404 300 C558 281 706 315 854 302 C1011 288 1144 306 1297 296 C1471 284 1615 306 1800 289 L1800 407 L0 407 Z"
        fill="#2e7891"
        opacity="0.32"
      />
      <g className="oc-gb-pines">
        <TreeLine count={72} baseY={384} color="#1d5660" heightBase={31} heightVariance={34} opacity={0.58} spacing={25} xOffset={-18} seed={14.4} />
        <TreeLine count={48} baseY={399} color="#123e4c" heightBase={39} heightVariance={44} opacity={0.72} spacing={36} xOffset={130} seed={15.7} />
      </g>

      <path
        d="M0 438 C82 382 176 369 271 388 C356 405 420 363 510 379 C606 396 693 446 756 492 L0 524 Z"
        fill="url(#oc-gb-granite)"
      />
      <path
        d="M765 439 C853 388 948 380 1042 402 C1126 422 1194 384 1287 398 C1386 413 1476 458 1564 461 C1663 464 1721 430 1800 448 L1800 520 L765 520 Z"
        fill="url(#oc-gb-granite-cool)"
      />
      <path
        d="M111 419 C196 397 272 410 352 426 C277 451 173 454 84 433 C92 428 101 424 111 419 Z"
        fill="#ffd1a7"
        opacity="0.3"
      />
      <path
        d="M973 420 C1082 399 1172 424 1275 433 C1160 462 1050 459 973 420 Z"
        fill="#ffe0b7"
        opacity="0.22"
      />
      <g className="oc-gb-pines" opacity="0.96">
        <TreeLine count={18} baseY={404} color="#08272f" heightBase={56} heightVariance={54} opacity={0.92} spacing={24} xOffset={82} seed={16.4} />
        <TreeLine count={24} baseY={414} color="#082833" heightBase={50} heightVariance={52} opacity={0.88} spacing={29} xOffset={1050} seed={18.2} />
      </g>

      <g opacity="0.34" transform="translate(0 842) scale(1 -0.72)">
        <path
          d="M0 438 C82 382 176 369 271 388 C356 405 420 363 510 379 C606 396 693 446 756 492 L0 524 Z"
          fill="#174861"
        />
        <path
          d="M765 439 C853 388 948 380 1042 402 C1126 422 1194 384 1287 398 C1386 413 1476 458 1564 461 C1663 464 1721 430 1800 448 L1800 520 L765 520 Z"
          fill="#113d5a"
        />
      </g>

      <g className="oc-gb-sparkle" filter="url(#oc-gb-soft)">
        <ellipse cx="860" cy="438" rx="380" ry="18" fill="#fff9d8" opacity="0.32" />
        <ellipse cx="1280" cy="526" rx="260" ry="13" fill="#d8fbff" opacity="0.2" />
        <path
          d="M108 407 C297 395 479 416 669 404 C889 391 1085 416 1301 403 C1485 393 1641 398 1766 410"
          fill="none"
          stroke="#eaffff"
          strokeOpacity="0.24"
          strokeWidth="2.3"
        />
      </g>
      <g className="oc-gb-ripples" opacity="0.62">
        <WideWaterRipples />
      </g>
      <rect width="1800" height="700" fill="#06334a" opacity="0.04" />
    </svg>
  );
}

function MuskokaAutumnScene() {
  return (
    <svg
      className="oc-muskoka-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-muskoka-svg .oc-mus-clouds {
          animation: ocMusClouds 46s ease-in-out infinite alternate;
        }
        .oc-muskoka-svg .oc-mus-fog {
          animation: ocMusFog 24s ease-in-out infinite alternate;
        }
        .oc-muskoka-svg .oc-mus-leaves {
          animation: ocMusLeaves 12s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        .oc-muskoka-svg .oc-mus-ripples {
          animation: ocMusRipples 15s linear infinite alternate;
        }
        @keyframes ocMusClouds {
          from { transform: translate3d(36px, -3px, 0); }
          to { transform: translate3d(-42px, 5px, 0); }
        }
        @keyframes ocMusFog {
          from { transform: translateX(-54px); opacity: 0.26; }
          to { transform: translateX(62px); opacity: 0.54; }
        }
        @keyframes ocMusLeaves {
          from { transform: skewX(-0.22deg); }
          to { transform: skewX(0.28deg); }
        }
        @keyframes ocMusRipples {
          from { transform: translateX(-40px); }
          to { transform: translateX(40px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-muskoka-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-mus-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#745483" />
          <stop offset="23%" stopColor="#dd7970" />
          <stop offset="44%" stopColor="#ffc66f" />
          <stop offset="68%" stopColor="#536f7c" />
          <stop offset="100%" stopColor="#183344" />
        </linearGradient>
        <radialGradient id="oc-mus-glow" cx="48%" cy="27%" r="42%">
          <stop offset="0%" stopColor="#fff1bd" stopOpacity="0.82" />
          <stop offset="42%" stopColor="#ec8b58" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#25384c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-mus-lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#315a68" />
          <stop offset="45%" stopColor="#1d3b4d" />
          <stop offset="100%" stopColor="#0c2232" />
        </linearGradient>
        <linearGradient id="oc-mus-rock" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#c58268" />
          <stop offset="43%" stopColor="#734e55" />
          <stop offset="100%" stopColor="#1a2c3b" />
        </linearGradient>
        <linearGradient id="oc-mus-fog" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#fff2d4" stopOpacity="0" />
          <stop offset="28%" stopColor="#fff2d4" stopOpacity="0.34" />
          <stop offset="58%" stopColor="#d7e6e0" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fff2d4" stopOpacity="0" />
        </linearGradient>
        <filter id="oc-mus-blur" x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="oc-mus-soft" x="-20%" y="-25%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1800" height="700" fill="url(#oc-mus-sky)" />
      <rect y="390" width="1800" height="310" fill="url(#oc-mus-lake)" />
      <rect width="1800" height="420" fill="url(#oc-mus-glow)" />

      <g className="oc-mus-clouds" filter="url(#oc-mus-soft)">
        <path
          d="M-60 124 C105 76 249 104 393 88 C547 70 655 24 812 73 C938 112 1068 101 1194 76 C1351 45 1481 72 1597 128 C1680 168 1757 158 1870 179 L1870 0 L-60 0 Z"
          fill="#ffd39b"
          opacity="0.33"
        />
        <path
          d="M346 255 C467 205 581 226 699 240 C836 256 946 216 1074 234 C1188 250 1288 286 1398 273 C1258 314 1051 317 867 304 C680 291 521 310 312 326 C302 296 313 271 346 255 Z"
          fill="#95556a"
          opacity="0.23"
        />
      </g>

      <path
        d="M0 337 C142 299 298 323 437 302 C593 279 722 315 866 299 C1029 281 1155 317 1316 300 C1468 284 1623 313 1800 288 L1800 424 L0 424 Z"
        fill="#5d5868"
        opacity="0.38"
      />
      <path
        d="M0 376 C139 346 297 365 453 350 C619 335 767 371 930 350 C1092 329 1216 363 1379 350 C1538 338 1664 362 1800 346 L1800 430 L0 430 Z"
        fill="#233b4d"
        opacity="0.72"
      />

      <g className="oc-mus-leaves">
        <AutumnCanopy count={86} baseY={383} radiusBase={13} radiusVariance={18} xOffset={-24} spacing={22} seed={1.9} />
        <AutumnCanopy count={64} baseY={406} radiusBase={17} radiusVariance={24} xOffset={126} spacing={28} seed={4.3} />
        <TreeLine count={56} baseY={420} color="#10252e" heightBase={42} heightVariance={46} opacity={0.74} spacing={32} xOffset={18} seed={20.5} />
      </g>

      <path
        d="M0 458 C92 405 200 394 297 410 C374 423 454 382 549 397 C638 411 710 446 781 485 L0 532 Z"
        fill="url(#oc-mus-rock)"
      />
      <path
        d="M1044 462 C1130 408 1229 392 1328 409 C1417 424 1493 386 1590 404 C1682 421 1748 452 1800 487 L1800 537 L1044 537 Z"
        fill="#152838"
      />
      <path
        d="M172 436 C263 414 351 428 431 438 C332 467 234 464 172 436 Z"
        fill="#e39a65"
        opacity="0.24"
      />

      <g className="oc-mus-fog" filter="url(#oc-mus-blur)">
        <path
          d="M-120 364 C88 342 225 381 417 361 C604 342 753 372 955 365 C1139 358 1302 336 1496 357 C1621 370 1728 358 1920 366 L1920 426 L-120 426 Z"
          fill="url(#oc-mus-fog)"
        />
      </g>

      <g opacity="0.46" transform="translate(0 844) scale(1 -0.72)">
        <path
          d="M0 458 C92 405 200 394 297 410 C374 423 454 382 549 397 C638 411 710 446 781 485 L0 532 Z"
          fill="#132c3c"
        />
        <path
          d="M1044 462 C1130 408 1229 392 1328 409 C1417 424 1493 386 1590 404 C1682 421 1748 452 1800 487 L1800 537 L1044 537 Z"
          fill="#0b1e2d"
        />
      </g>

      <g filter="url(#oc-mus-soft)">
        <ellipse cx="742" cy="475" rx="350" ry="18" fill="#ffc879" opacity="0.22" />
        <ellipse cx="1324" cy="550" rx="285" ry="14" fill="#b6d3d4" opacity="0.12" />
        <path
          d="M88 429 C263 415 420 437 596 426 C792 414 966 438 1154 427 C1382 414 1577 425 1740 437"
          fill="none"
          stroke="#f8d59e"
          strokeOpacity="0.18"
          strokeWidth="2.2"
        />
      </g>
      <g className="oc-mus-ripples" opacity="0.56">
        <WideWaterRipples />
      </g>
      <rect width="1800" height="700" fill="#150d12" opacity="0.05" />
    </svg>
  );
}

function BruceClearwaterScene() {
  return (
    <svg
      className="oc-bruce-svg h-full w-full"
      viewBox="0 0 1800 700"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <style>{`
        .oc-bruce-svg .oc-bruce-clouds {
          animation: ocBruceClouds 42s ease-in-out infinite alternate;
        }
        .oc-bruce-svg .oc-bruce-caustics {
          animation: ocBruceCaustics 11s ease-in-out infinite alternate;
        }
        .oc-bruce-svg .oc-bruce-ripples {
          animation: ocBruceRipples 14s linear infinite alternate;
        }
        .oc-bruce-svg .oc-bruce-cedars {
          animation: ocBruceCedars 12s ease-in-out infinite alternate;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        @keyframes ocBruceClouds {
          from { transform: translate3d(-30px, 3px, 0); }
          to { transform: translate3d(38px, -4px, 0); }
        }
        @keyframes ocBruceCaustics {
          from { opacity: 0.28; transform: translateY(3px) scaleX(0.98); }
          to { opacity: 0.58; transform: translateY(-3px) scaleX(1.03); }
        }
        @keyframes ocBruceRipples {
          from { transform: translateX(-36px); }
          to { transform: translateX(36px); }
        }
        @keyframes ocBruceCedars {
          from { transform: skewX(-0.14deg); }
          to { transform: skewX(0.18deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-bruce-svg * {
            animation: none !important;
          }
        }
      `}</style>

      <defs>
        <linearGradient id="oc-bruce-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#eff6d4" />
          <stop offset="34%" stopColor="#b6e1d5" />
          <stop offset="65%" stopColor="#66cfc6" />
          <stop offset="100%" stopColor="#236f83" />
        </linearGradient>
        <radialGradient id="oc-bruce-glow" cx="36%" cy="22%" r="42%">
          <stop offset="0%" stopColor="#fff8d4" stopOpacity="0.76" />
          <stop offset="42%" stopColor="#e5f2b7" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#6acfc7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="oc-bruce-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#63d6cd" />
          <stop offset="38%" stopColor="#22aeb9" />
          <stop offset="72%" stopColor="#137395" />
          <stop offset="100%" stopColor="#0b385d" />
        </linearGradient>
        <linearGradient id="oc-bruce-cliff" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f5edca" />
          <stop offset="36%" stopColor="#c7c7ab" />
          <stop offset="68%" stopColor="#677a75" />
          <stop offset="100%" stopColor="#233f57" />
        </linearGradient>
        <linearGradient id="oc-bruce-shadow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#9fae93" />
          <stop offset="52%" stopColor="#345861" />
          <stop offset="100%" stopColor="#0b2845" />
        </linearGradient>
        <filter id="oc-bruce-soft" x="-20%" y="-25%" width="140%" height="150%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1800" height="700" fill="url(#oc-bruce-sky)" />
      <rect y="370" width="1800" height="330" fill="url(#oc-bruce-water)" />
      <rect width="1800" height="420" fill="url(#oc-bruce-glow)" />

      <g className="oc-bruce-clouds" filter="url(#oc-bruce-soft)">
        <path
          d="M-80 105 C103 61 260 92 431 76 C586 61 704 24 857 62 C1004 99 1124 87 1261 63 C1424 35 1571 65 1691 112 C1746 134 1801 142 1880 150 L1880 0 L-80 0 Z"
          fill="#fffbe4"
          opacity="0.38"
        />
        <path
          d="M805 240 C922 203 1019 220 1127 236 C1259 255 1372 210 1496 233 C1606 254 1674 276 1822 265 L1822 319 C1640 308 1474 326 1303 310 C1128 294 984 306 778 320 C768 287 777 258 805 240 Z"
          fill="#e8fbff"
          opacity="0.3"
        />
      </g>

      <path
        d="M0 329 C128 302 259 316 405 300 C556 283 684 310 831 294 C993 276 1136 306 1296 292 C1474 276 1611 300 1800 284 L1800 407 L0 407 Z"
        fill="#447c8a"
        opacity="0.28"
      />

      <path
        d="M0 431 C80 360 177 331 293 342 C384 351 438 303 543 323 C634 341 676 394 739 448 L0 510 Z"
        fill="url(#oc-bruce-cliff)"
      />
      <path
        d="M1124 430 C1209 351 1326 317 1454 339 C1541 354 1603 314 1690 334 C1743 347 1775 376 1800 409 L1800 520 L1124 520 Z"
        fill="url(#oc-bruce-shadow)"
      />
      <path
        d="M102 397 C174 369 262 373 336 388 C274 418 171 426 102 397 Z"
        fill="#fff2cd"
        opacity="0.3"
      />
      <path
        d="M1246 392 C1332 358 1434 370 1519 391 C1430 419 1328 424 1246 392 Z"
        fill="#e8e1bc"
        opacity="0.24"
      />

      <g className="oc-bruce-cedars">
        <TreeLine count={30} baseY={366} color="#174641" heightBase={42} heightVariance={42} opacity={0.74} spacing={24} xOffset={72} seed={22.1} />
        <TreeLine count={26} baseY={360} color="#0f3536" heightBase={46} heightVariance={50} opacity={0.84} spacing={27} xOffset={1280} seed={24.4} />
      </g>

      <g opacity="0.42" transform="translate(0 824) scale(1 -0.72)">
        <path
          d="M0 431 C80 360 177 331 293 342 C384 351 438 303 543 323 C634 341 676 394 739 448 L0 510 Z"
          fill="#143e5a"
        />
        <path
          d="M1124 430 C1209 351 1326 317 1454 339 C1541 354 1603 314 1690 334 C1743 347 1775 376 1800 409 L1800 520 L1124 520 Z"
          fill="#0b2c4c"
        />
      </g>

      <g className="oc-bruce-caustics" filter="url(#oc-bruce-soft)">
        <path
          d="M416 455 C566 427 719 450 865 439 C1040 426 1209 440 1392 426"
          fill="none"
          stroke="#eaffd8"
          strokeOpacity="0.3"
          strokeWidth="4"
        />
        <ellipse cx="890" cy="516" rx="420" ry="22" fill="#b7fff2" opacity="0.24" />
        <ellipse cx="512" cy="580" rx="295" ry="15" fill="#fff4c9" opacity="0.12" />
        <path
          d="M236 489 C380 472 529 497 680 485 C846 471 978 496 1138 483 C1320 468 1492 477 1665 491"
          fill="none"
          stroke="#bdfcf1"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
      </g>
      <g className="oc-bruce-ripples" opacity="0.58">
        <WideWaterRipples />
      </g>
      <rect width="1800" height="700" fill="#073047" opacity="0.04" />
    </svg>
  );
}

type TreeLineProps = {
  count: number;
  baseY: number;
  color: string;
  heightBase: number;
  heightVariance: number;
  opacity: number;
  spacing: number;
  xOffset: number;
  seed: number;
};

function TreeLine({
  count,
  baseY,
  color,
  heightBase,
  heightVariance,
  opacity,
  spacing,
  xOffset,
  seed,
}: TreeLineProps) {
  return (
    <g opacity={opacity}>
      {Array.from({ length: count }, (_, index) => {
        const height =
          heightBase +
          Math.abs(Math.sin(index * 1.73 + seed)) * heightVariance +
          Math.abs(Math.cos(index * 0.91 + seed)) * (heightVariance * 0.26);
        const width = height * (0.34 + Math.abs(Math.sin(index + seed)) * 0.16);
        const x = xOffset + index * spacing + Math.sin(index * 2.4 + seed) * 7;
        const y = baseY + Math.cos(index * 1.17 + seed) * 6;

        return <PineTree key={`${x}-${height}`} x={x} baseY={y} height={height} width={width} fill={color} />;
      })}
    </g>
  );
}

type PineTreeProps = {
  x: number;
  baseY: number;
  height: number;
  width: number;
  fill: string;
};

function PineTree({ x, baseY, height, width, fill }: PineTreeProps) {
  const trunkWidth = Math.max(1.4, width * 0.05);

  return (
    <g transform={`translate(${round(x)} ${round(baseY)})`}>
      <rect
        x={round(-trunkWidth / 2)}
        y={round(-height * 0.55)}
        width={round(trunkWidth)}
        height={round(height * 0.56)}
        fill={fill}
        opacity="0.85"
      />
      <path
        d={[
          `M 0 ${round(-height)}`,
          `C ${round(-width * 0.06)} ${round(-height * 0.9)} ${round(-width * 0.18)} ${round(-height * 0.82)} ${round(-width * 0.29)} ${round(-height * 0.7)}`,
          `L ${round(-width * 0.14)} ${round(-height * 0.72)}`,
          `L ${round(-width * 0.44)} ${round(-height * 0.5)}`,
          `L ${round(-width * 0.21)} ${round(-height * 0.53)}`,
          `L ${round(-width * 0.56)} ${round(-height * 0.26)}`,
          `L ${round(-width * 0.21)} ${round(-height * 0.31)}`,
          `L ${round(-width * 0.64)} 0`,
          `L ${round(width * 0.64)} 0`,
          `L ${round(width * 0.21)} ${round(-height * 0.31)}`,
          `L ${round(width * 0.56)} ${round(-height * 0.26)}`,
          `L ${round(width * 0.21)} ${round(-height * 0.53)}`,
          `L ${round(width * 0.44)} ${round(-height * 0.5)}`,
          `L ${round(width * 0.14)} ${round(-height * 0.72)}`,
          `L ${round(width * 0.29)} ${round(-height * 0.7)}`,
          `C ${round(width * 0.18)} ${round(-height * 0.82)} ${round(width * 0.06)} ${round(-height * 0.9)} 0 ${round(-height)}`,
          "Z",
        ].join(" ")}
        fill={fill}
      />
    </g>
  );
}

type BareSnagProps = {
  x: number;
  baseY: number;
  height: number;
  color: string;
};

function BareSnag({ x, baseY, height, color }: BareSnagProps) {
  return (
    <g transform={`translate(${x} ${baseY})`} fill="none" stroke={color} strokeLinecap="round">
      <path d={`M 0 0 C -9 ${-height * 0.28} 6 ${-height * 0.56} -3 ${-height}`} strokeWidth="9" />
      <path d={`M -2 ${-height * 0.55} C -36 ${-height * 0.67} -47 ${-height * 0.78} -67 ${-height * 0.89}`} strokeWidth="5" />
      <path d={`M 1 ${-height * 0.42} C 34 ${-height * 0.54} 50 ${-height * 0.66} 72 ${-height * 0.75}`} strokeWidth="4" />
      <path d={`M -1 ${-height * 0.74} C 20 ${-height * 0.81} 31 ${-height * 0.9} 48 ${-height * 0.98}`} strokeWidth="3" />
    </g>
  );
}

function WaterRipples() {
  return (
    <g fill="none" strokeLinecap="round">
      {Array.from({ length: 28 }, (_, index) => {
        const y = 404 + index * 7.2;
        const opacity = 0.28 - index * 0.006;
        const width = 115 + Math.sin(index * 0.7) * 58;
        const x = 68 + ((index * 139) % 1480);

        return (
          <path
            key={index}
            d={`M ${round(x)} ${round(y)} C ${round(x + width * 0.3)} ${round(y - 3)} ${round(
              x + width * 0.68,
            )} ${round(y + 3)} ${round(x + width)} ${round(y)}`}
            stroke={index % 3 === 0 ? "#f4b98a" : "#b7d6e5"}
            strokeOpacity={Math.max(0.06, opacity)}
            strokeWidth={index % 4 === 0 ? 1.6 : 1}
          />
        );
      })}
    </g>
  );
}

function WideWaterRipples() {
  return (
    <g fill="none" strokeLinecap="round">
      {Array.from({ length: 38 }, (_, index) => {
        const y = 430 + index * 6.8;
        const opacity = 0.2 - index * 0.0037;
        const width = 150 + Math.sin(index * 0.83) * 76;
        const x = 34 + ((index * 173) % 1700);

        return (
          <path
            key={index}
            d={`M ${round(x)} ${round(y)} C ${round(x + width * 0.28)} ${round(y - 2.5)} ${round(
              x + width * 0.72,
            )} ${round(y + 2.5)} ${round(x + width)} ${round(y)}`}
            stroke={index % 4 === 0 ? "#e9ad83" : "#a8cedd"}
            strokeOpacity={Math.max(0.05, opacity)}
            strokeWidth={index % 5 === 0 ? 1.35 : 0.9}
          />
        );
      })}
    </g>
  );
}

function StarField() {
  return (
    <g fill="#f5fbff">
      {Array.from({ length: 66 }, (_, index) => {
        const x = 42 + ((index * 131) % 1710);
        const y = 24 + ((index * 79) % 258);
        const size = 0.9 + Math.abs(Math.sin(index * 1.17)) * 1.7;
        const opacity = 0.28 + Math.abs(Math.cos(index * 0.83)) * 0.56;

        return <circle key={index} cx={x} cy={y} r={round(size)} opacity={round(opacity)} />;
      })}
    </g>
  );
}

type AutumnCanopyProps = {
  count: number;
  baseY: number;
  radiusBase: number;
  radiusVariance: number;
  xOffset: number;
  spacing: number;
  seed: number;
};

const autumnColors = ["#f6c05e", "#d96d37", "#b44335", "#8f3b4e", "#e59343", "#f2d27a"] as const;

function AutumnCanopy({ count, baseY, radiusBase, radiusVariance, xOffset, spacing, seed }: AutumnCanopyProps) {
  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const radius = radiusBase + Math.abs(Math.sin(index * 1.31 + seed)) * radiusVariance;
        const x = xOffset + index * spacing + Math.sin(index * 2.17 + seed) * 11;
        const y = baseY - Math.abs(Math.cos(index * 0.83 + seed)) * 42 + Math.sin(index + seed) * 7;
        const fill = autumnColors[index % autumnColors.length];

        return <circle key={index} cx={round(x)} cy={round(y)} r={round(radius)} fill={fill} opacity="0.86" />;
      })}
    </g>
  );
}

function round(value: number) {
  return Number(value.toFixed(2));
}
