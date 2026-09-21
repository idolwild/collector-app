/* Collector — image utilities: dominant color extraction + resizing (vanilla) */
(function () {
  function rgbToHex(r, g, b) {
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function luminance(rgb) {
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  }

  function saturate(rgb) {
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    return max === 0 ? 0 : (max - min) / max;
  }

  function distance(a, b) {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  async function loadImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
      });
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function extractPalette(blob, count = 4) {
    try {
      const img = await loadImage(blob);
      const scale = Math.max(1, Math.min(img.width, img.height) / 250);
      const w = Math.max(40, Math.round(img.width / scale));
      const h = Math.max(40, Math.round(img.height / scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return [];
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 125) continue;
        const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
        const existing = buckets.get(key);
        if (existing) existing.n++;
        else buckets.set(key, { rgb: { r: data[i], g: data[i + 1], b: data[i + 2] }, n: 1 });
      }

      const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
      const result = [];

      for (const { rgb } of sorted) {
        if (result.length >= count) break;
        if (luminance(rgb) < 18 && saturate(rgb) < 0.07) continue;
        if (luminance(rgb) > 238 && saturate(rgb) < 0.03) continue;
        if (result.some((s) => distance(s, rgb) < 40)) continue;
        result.push(rgb);
      }

      for (const { rgb } of sorted) {
        if (result.length >= count) break;
        if (luminance(rgb) < 25) continue;
        if (result.some((s) => distance(s, rgb) < 40)) continue;
        result.push(rgb);
      }

      return result.slice(0, count).map((c) => rgbToHex(c.r, c.g, c.b));
    } catch {
      return [];
    }
  }

  async function resizeImage(blob, maxDim = 2000, quality = 0.9) {
    try {
      const img = await loadImage(blob);
      const largest = Math.max(img.width, img.height);
      if (largest <= maxDim) return blob;

      const scale = maxDim / largest;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0, w, h);

      return await new Promise((resolve) => {
        canvas.toBlob(
          (b) => resolve(b && b.size > 0 ? b : blob),
          'image/jpeg',
          quality
        );
      });
    } catch {
      return blob;
    }
  }

  window.ColorUtil = { extractPalette, resizeImage, hexToRgb };
})();