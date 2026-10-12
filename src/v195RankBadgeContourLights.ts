import './v195RankBadgeContourLights.css';

const SAMPLE_SIZE = 220;
const ALPHA_THRESHOLDS = [220, 180, 140] as const;
const CONTOUR_POINT_COUNT = 52;
const CONTOUR_OUTSET_PX = 2.8;
const MIN_COMPONENT_PIXELS = 180;
const EDGE_BAND_PX = 5;
const RAY_COUNT = 360;

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__?: boolean;
};

type Point = { x: number; y: number };

type PulseSpec = {
  size: number;
  duration: number;
  delay: number;
  min: number;
  max: number;
  scale: number;
};

type Component = {
  mask: Uint8Array;
  count: number;
  centerX: number;
  centerY: number;
};

// 沿用皇冠大使 v179 的明暗、縮放與不同步節奏，但稍微縮小光點，避免小獎章形成 LED 燈帶。
const CROWN_PULSES: PulseSpec[] = [
  { size: 2.8, duration: 5.7, delay: -1.1, min: 0.12, max: 0.96, scale: 1.38 },
  { size: 2.3, duration: 8.6, delay: -5.3, min: 0.07, max: 0.70, scale: 1.30 },
  { size: 3.0, duration: 6.9, delay: -2.8, min: 0.16, max: 0.88, scale: 1.36 },
  { size: 2.4, duration: 9.7, delay: -7.4, min: 0.08, max: 0.66, scale: 1.28 },
  { size: 3.2, duration: 7.8, delay: -4.6, min: 0.14, max: 0.98, scale: 1.40 },
  { size: 2.2, duration: 6.3, delay: -0.7, min: 0.08, max: 0.74, scale: 1.30 },
  { size: 2.7, duration: 10.4, delay: -6.1, min: 0.10, max: 0.82, scale: 1.34 }
];

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('badge image load failed')); };
    const cleanup = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
  });
}

function alphaAt(pixels: Uint8ClampedArray, x: number, y: number) {
  return pixels[(y * SAMPLE_SIZE + x) * 4 + 3];
}

function buildAlphaMask(pixels: Uint8ClampedArray, threshold: number) {
  const mask = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      if (alphaAt(pixels, x, y) >= threshold) mask[y * SAMPLE_SIZE + x] = 1;
    }
  }
  return mask;
}

function largestConnectedComponent(mask: Uint8Array): Component | null {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let bestMembers: number[] | null = null;
  let bestScore = -1;
  let bestSumX = 0;
  let bestSumY = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const members: number[] = [];
    let sumX = 0;
    let sumY = 0;
    let edgeCount = 0;

    while (head < tail) {
      const current = queue[head++];
      members.push(current);
      const x = current % SAMPLE_SIZE;
      const y = Math.floor(current / SAMPLE_SIZE);
      sumX += x;
      sumY += y;
      if (
        x < EDGE_BAND_PX || y < EDGE_BAND_PX ||
        x >= SAMPLE_SIZE - EDGE_BAND_PX || y >= SAMPLE_SIZE - EDGE_BAND_PX
      ) edgeCount += 1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SAMPLE_SIZE || ny >= SAMPLE_SIZE) continue;
          const next = ny * SAMPLE_SIZE + nx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    if (members.length < MIN_COMPONENT_PIXELS) continue;

    // 矩形光暈／圖片邊界常大量貼著畫布四周；對這類 component 降權，優先取中央的獎章實體。
    const edgeRatio = edgeCount / members.length;
    const score = members.length * (1 - Math.min(0.88, edgeRatio * 2.2));
    if (score <= bestScore) continue;

    bestScore = score;
    bestMembers = members;
    bestSumX = sumX;
    bestSumY = sumY;
  }

  if (!bestMembers) return null;
  const componentMask = new Uint8Array(mask.length);
  bestMembers.forEach(index => { componentMask[index] = 1; });
  return {
    mask: componentMask,
    count: bestMembers.length,
    centerX: bestSumX / bestMembers.length,
    centerY: bestSumY / bestMembers.length
  };
}

function choosePrimaryComponent(pixels: Uint8ClampedArray) {
  for (const threshold of ALPHA_THRESHOLDS) {
    const component = largestConnectedComponent(buildAlphaMask(pixels, threshold));
    if (component) return component;
  }
  return null;
}

function traceRadialContour(component: Component): Point[] {
  const raw: Point[] = [];
  const maxRadius = Math.hypot(SAMPLE_SIZE, SAMPLE_SIZE);

  for (let index = 0; index < RAY_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / RAY_COUNT;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let lastOpaque: Point | null = null;

    for (let radius = 0; radius <= maxRadius; radius += 0.55) {
      const x = Math.round(component.centerX + cos * radius);
      const y = Math.round(component.centerY + sin * radius);
      if (x < 0 || y < 0 || x >= SAMPLE_SIZE || y >= SAMPLE_SIZE) break;
      if (component.mask[y * SAMPLE_SIZE + x]) lastOpaque = { x, y };
    }

    if (!lastOpaque) continue;
    const previous = raw[raw.length - 1];
    if (!previous || previous.x !== lastOpaque.x || previous.y !== lastOpaque.y) raw.push(lastOpaque);
  }

  if (raw.length > 1) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (first.x === last.x && first.y === last.y) raw.pop();
  }
  return raw;
}

function smoothClosedContour(points: Point[]) {
  if (points.length < 5) return points;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return {
      x: (previous.x + point.x * 2 + next.x) / 4,
      y: (previous.y + point.y * 2 + next.y) / 4
    };
  });
}

function resampleClosedContour(points: Point[], count: number) {
  if (points.length < 12) return null;
  const smoothed = smoothClosedContour(points);
  const lengths: number[] = [];
  let total = 0;

  for (let index = 0; index < smoothed.length; index += 1) {
    const current = smoothed[index];
    const next = smoothed[(index + 1) % smoothed.length];
    const length = Math.hypot(next.x - current.x, next.y - current.y);
    lengths.push(length);
    total += length;
  }

  if (total < 20) return null;
  const result: Point[] = [];
  let segment = 0;
  let segmentStartDistance = 0;

  for (let sample = 0; sample < count; sample += 1) {
    const target = (total * sample) / count;
    while (segment < lengths.length - 1 && segmentStartDistance + lengths[segment] < target) {
      segmentStartDistance += lengths[segment];
      segment += 1;
    }
    const current = smoothed[segment];
    const next = smoothed[(segment + 1) % smoothed.length];
    const length = Math.max(lengths[segment], 0.001);
    const t = Math.min(1, Math.max(0, (target - segmentStartDistance) / length));
    result.push({
      x: current.x + (next.x - current.x) * t,
      y: current.y + (next.y - current.y) * t
    });
  }
  return result;
}

function contourPercentPoints(component: Component) {
  const contour = resampleClosedContour(traceRadialContour(component), CONTOUR_POINT_COUNT);
  if (!contour) return null;

  return contour.map(point => {
    const dx = point.x - component.centerX;
    const dy = point.y - component.centerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const x = point.x + (dx / distance) * CONTOUR_OUTSET_PX;
    const y = point.y + (dy / distance) * CONTOUR_OUTSET_PX;
    return {
      x: (x / SAMPLE_SIZE) * 100,
      y: (y / SAMPLE_SIZE) * 100
    };
  });
}

function sampleAlphaContour(image: HTMLImageElement): Point[] | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !image.naturalWidth || !image.naturalHeight) return null;

  try {
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // 與 CSS object-fit: contain 相同：保留 PNG 原始長寬比，不再把長方形獎章硬拉成正方形。
    const scale = Math.min(SAMPLE_SIZE / image.naturalWidth, SAMPLE_SIZE / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const offsetX = (SAMPLE_SIZE - drawWidth) / 2;
    const offsetY = (SAMPLE_SIZE - drawHeight) / 2;
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    const component = choosePrimaryComponent(pixels);
    return component ? contourPercentPoints(component) : null;
  } catch {
    // 跨來源圖片可能使 Canvas tainted；decorateBadge 會再嘗試以 Blob 重新解碼。
    return null;
  }
}

async function sampleAlphaContourViaBlob(source: string) {
  try {
    const response = await fetch(source, { credentials: 'same-origin', cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const probe = new Image();
      probe.src = objectUrl;
      await waitForImage(probe);
      return sampleAlphaContour(probe);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function createContourLayer(points: Point[]) {
  const layer = document.createElement('span');
  layer.className = 'v195-rank-badge-contour-layer';
  layer.dataset.v195RankContour = '1';
  layer.setAttribute('aria-hidden', 'true');

  points.forEach((point, index) => {
    const pulse = CROWN_PULSES[index % CROWN_PULSES.length];
    const light = document.createElement('span');
    light.className = 'v195-rank-badge-contour-light';
    light.style.setProperty('--contour-x', `${point.x}%`);
    light.style.setProperty('--contour-y', `${point.y}%`);
    light.style.setProperty('--contour-size', `${pulse.size}px`);
    light.style.setProperty('--contour-duration', `${pulse.duration + (index % 5) * 0.11}s`);
    light.style.setProperty('--contour-delay', `${pulse.delay - (index % 11) * 0.17}s`);
    light.style.setProperty('--contour-min', String(pulse.min));
    light.style.setProperty('--contour-max', String(pulse.max));
    light.style.setProperty('--contour-scale', String(pulse.scale));
    layer.appendChild(light);
  });

  return layer;
}

let fallbackId = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function createSvgContourFallback(image: HTMLImageElement) {
  fallbackId += 1;
  const suffix = `v196-${fallbackId}`;
  const filterId = `${suffix}-outline`;
  const maskId = `${suffix}-mask`;
  const patternId = `${suffix}-dots`;

  const svg = svgElement('svg');
  svg.classList.add('v195-rank-badge-contour-svg');
  svg.dataset.v195RankContour = '1';
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const defs = svgElement('defs');
  const filter = svgElement('filter');
  filter.id = filterId;
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('x', '-8');
  filter.setAttribute('y', '-8');
  filter.setAttribute('width', '116');
  filter.setAttribute('height', '116');

  // 備援也先做高 alpha 門檻 + opening，消除 PNG 四周的淡矩形光暈與零碎亮點。
  const threshold = svgElement('feComponentTransfer');
  threshold.setAttribute('in', 'SourceAlpha');
  threshold.setAttribute('result', 'thresholded');
  const alpha = svgElement('feFuncA');
  alpha.setAttribute('type', 'discrete');
  alpha.setAttribute('tableValues', '0 0 0 0 1');
  threshold.appendChild(alpha);
  filter.appendChild(threshold);

  const erode = svgElement('feMorphology');
  erode.setAttribute('in', 'thresholded');
  erode.setAttribute('operator', 'erode');
  erode.setAttribute('radius', '1.1');
  erode.setAttribute('result', 'eroded');
  filter.appendChild(erode);

  const reopen = svgElement('feMorphology');
  reopen.setAttribute('in', 'eroded');
  reopen.setAttribute('operator', 'dilate');
  reopen.setAttribute('radius', '1.1');
  reopen.setAttribute('result', 'opened');
  filter.appendChild(reopen);

  const dilate = svgElement('feMorphology');
  dilate.setAttribute('in', 'opened');
  dilate.setAttribute('operator', 'dilate');
  dilate.setAttribute('radius', '2.4');
  dilate.setAttribute('result', 'dilated');
  filter.appendChild(dilate);

  const outline = svgElement('feComposite');
  outline.setAttribute('in', 'dilated');
  outline.setAttribute('in2', 'opened');
  outline.setAttribute('operator', 'out');
  filter.appendChild(outline);
  defs.appendChild(filter);

  const mask = svgElement('mask');
  mask.id = maskId;
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '-8');
  mask.setAttribute('y', '-8');
  mask.setAttribute('width', '116');
  mask.setAttribute('height', '116');
  mask.style.maskType = 'alpha';

  const maskImage = svgElement('image');
  maskImage.setAttribute('href', image.currentSrc || image.src);
  maskImage.setAttribute('x', '0');
  maskImage.setAttribute('y', '0');
  maskImage.setAttribute('width', '100');
  maskImage.setAttribute('height', '100');
  maskImage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  maskImage.setAttribute('filter', `url(#${filterId})`);
  mask.appendChild(maskImage);
  defs.appendChild(mask);

  const pattern = svgElement('pattern');
  pattern.id = patternId;
  pattern.setAttribute('width', '10');
  pattern.setAttribute('height', '10');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  [
    { cx: 2.0, cy: 2.2, r: 1.05, variant: 0 },
    { cx: 7.1, cy: 6.7, r: 0.78, variant: 4 }
  ].forEach(spec => {
    const circle = svgElement('circle');
    circle.setAttribute('cx', String(spec.cx));
    circle.setAttribute('cy', String(spec.cy));
    circle.setAttribute('r', String(spec.r));
    circle.classList.add('v195-rank-badge-contour-svg-dot', `v195-rank-badge-contour-svg-dot--${spec.variant}`);
    pattern.appendChild(circle);
  });
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const rect = svgElement('rect');
  rect.setAttribute('x', '-5');
  rect.setAttribute('y', '-5');
  rect.setAttribute('width', '110');
  rect.setAttribute('height', '110');
  rect.setAttribute('fill', `url(#${patternId})`);
  rect.setAttribute('mask', `url(#${maskId})`);
  svg.appendChild(rect);

  return svg;
}

async function decorateBadge(image: HTMLImageElement) {
  const source = image.currentSrc || image.src;
  if (!source || image.dataset.v195ContourPending === source) return;

  const motion = image.closest<HTMLElement>('.v190-rank-badge-motion');
  if (!motion) return;
  if (image.dataset.v195ContourSource === source && motion.querySelector('[data-v195-rank-contour="1"]')) return;

  image.dataset.v195ContourPending = source;
  try {
    await waitForImage(image);
    if ((image.currentSrc || image.src) !== source) return;

    motion.querySelectorAll<HTMLElement>('[data-v195-rank-contour="1"]').forEach(node => node.remove());
    motion.classList.add('v195-rank-badge-contour-host');

    let points = sampleAlphaContour(image);
    if (!points) points = await sampleAlphaContourViaBlob(source);

    if (points) {
      motion.appendChild(createContourLayer(points));
      motion.dataset.v196ContourMode = 'primary-alpha-component';
    } else {
      motion.appendChild(createSvgContourFallback(image));
      motion.dataset.v196ContourMode = 'thresholded-svg-fallback';
    }
    image.dataset.v195ContourSource = source;
  } catch {
    // 保留獎章本體；圖片暫時失敗時不阻擋詳細頁其他功能。
  } finally {
    delete image.dataset.v195ContourPending;
  }
}

function syncV195ContourLights() {
  document.querySelectorAll<HTMLImageElement>('img.v190-rank-badge-image').forEach(image => {
    void decorateBadge(image);
  });
}

if (!runtime.__ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__) {
  runtime.__ECHOSTARS_V195_RANK_BADGE_CONTOUR_LIGHTS__ = true;
  document.documentElement.setAttribute('data-echostars-v195-rank-badge-contour-lights', 'true');
  document.documentElement.setAttribute('data-echostars-v196-rank-badge-contour-fix', 'true');
  syncV195ContourLights();
  window.setInterval(syncV195ContourLights, 700);
  window.addEventListener('focus', syncV195ContourLights);
}
