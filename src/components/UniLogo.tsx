import type { University } from '../data/types';

const letters = (u: Pick<University, 'short'>) => u.short.replace(/[^A-Z]/g, '').slice(0, 3) || u.short.slice(0, 3).toUpperCase();

/** A university's logo, or its initials on a tinted tile until an admin adds one. */
export function UniLogo({ uni, size = 36, className = '' }: { uni: Pick<University, 'short' | 'logo' | 'name'> | undefined | null; size?: number; className?: string }) {
  if (!uni) return null;
  const s = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.3)) };
  return uni.logo
    ? <span className={'uni-logo has-img ' + className} style={s}><img src={uni.logo} alt="" /></span>
    : <span className={'uni-logo ' + className} style={s} aria-hidden="true">{letters(uni)}</span>;
}

/** Reads a logo file into a small square-friendly data URL. PNG and SVG keep their transparent background. */
export function readLogo(file: File, max = 256): Promise<string> {
  if (file.size > 2_000_000) return Promise.reject(new Error('Use a logo smaller than 2 MB.'));
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return Promise.reject(new Error('Use a PNG, JPG, WebP or SVG file.'));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.onload = () => {
      const src = String(r.result);
      if (file.type === 'image/svg+xml') return resolve(src);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
      };
      img.onerror = () => reject(new Error('That file is not an image we can read.'));
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}
