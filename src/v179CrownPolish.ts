import './v179CrownPolish.css';

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V179_CROWN_POLISH__?: boolean;
};

type SparkSpec = {
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  min: number;
  max: number;
  scale: number;
};

const SPARKS: SparkSpec[] = [
  { x: 12, y: 19, size: 0.22, duration: 5.7, delay: -1.1, min: 0.14, max: 0.98, scale: 1.38 },
  { x: 43, y: 2, size: 0.18, duration: 8.6, delay: -5.3, min: 0.08, max: 0.72, scale: 1.3 },
  { x: 81, y: 14, size: 0.26, duration: 6.9, delay: -2.8, min: 0.18, max: 0.9, scale: 1.36 },
  { x: 99, y: 49, size: 0.2, duration: 9.7, delay: -7.4, min: 0.1, max: 0.68, scale: 1.28 },
  { x: 80, y: 86, size: 0.28, duration: 7.8, delay: -4.6, min: 0.16, max: 1, scale: 1.4 },
  { x: 42, y: 99, size: 0.19, duration: 6.3, delay: -0.7, min: 0.09, max: 0.76, scale: 1.3 },
  { x: 4, y: 70, size: 0.23, duration: 10.4, delay: -6.1, min: 0.12, max: 0.84, scale: 1.34 }
];

function addIndependentSparks(ring: HTMLElement, ringIndex: number) {
  if (ring.querySelector('.taiwan-crown-ring-spark')) return;

  SPARKS.forEach((spark, sparkIndex) => {
    const point = document.createElement('span');
    point.className = 'taiwan-crown-ring-spark';
    point.setAttribute('aria-hidden', 'true');
    point.style.setProperty('--spark-x', `${spark.x}%`);
    point.style.setProperty('--spark-y', `${spark.y}%`);
    point.style.setProperty('--spark-size', `${spark.size}em`);
    point.style.setProperty('--spark-duration', `${spark.duration + ((ringIndex + sparkIndex) % 3) * 0.37}s`);
    point.style.setProperty('--spark-delay', `${spark.delay - (ringIndex % 5) * 0.41}s`);
    point.style.setProperty('--spark-min', String(spark.min));
    point.style.setProperty('--spark-max', String(spark.max));
    point.style.setProperty('--spark-scale', String(spark.scale));
    ring.append(point);
  });
}

function syncV179CrownPolish() {
  document.documentElement.setAttribute('data-echostars-v179-crown-polish', 'true');
  document.querySelectorAll<HTMLElement>('.taiwan-crown-avatar-ring').forEach(addIndependentSparks);
}

function installV179CrownPolish() {
  syncV179CrownPolish();
  const observer = new MutationObserver(syncV179CrownPolish);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (!runtime.__ECHOSTARS_V179_CROWN_POLISH__) {
  runtime.__ECHOSTARS_V179_CROWN_POLISH__ = true;
  if (document.body) installV179CrownPolish();
  else window.addEventListener('DOMContentLoaded', installV179CrownPolish, { once: true });
}
