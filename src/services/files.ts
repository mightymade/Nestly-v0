/**
 * Hostel photos in live mode. The editor works with images as data URLs (like the demo);
 * before saving, new ones are uploaded to the "hostel-photos" storage bucket and replaced by their web address.
 * That keeps the hostels table small, so Explore stays fast.
 */
import { ApiError } from './errors';
import { friendly } from './remote';
import { sb } from './supabase';

const BUCKET = 'hostel-photos';
const dataUrlToBlob = async (d: string) => (await fetch(d)).blob();
const fileName = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
/** The storage path of a photo uploaded here, or null for other addresses. */
const pathOf = (url: string) => { const m = url.match(/\/storage\/v1\/object\/public\/hostel-photos\/(.+)$/); return m ? decodeURIComponent(m[1]!) : null; };

/** Uploads every photo that is still a data URL. Returns the list with web addresses, in the same order. */
export async function uploadHostelPhotos(hostelId: string, photos: string[]): Promise<string[]> {
  return Promise.all(photos.map(async p => {
    if (!p.startsWith('data:')) return p;
    const path = `${hostelId}/${fileName()}`;
    const blob = await dataUrlToBlob(p);
    const { error } = await sb!.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
    if (error) throw new ApiError(/security|Unauthorized/i.test(error.message) ? 'You do not have permission to add photos to this hostel.' : friendly(error));
    return sb!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }));
}

/** Deletes uploaded photos that are no longer used. Failures are ignored: an unused file does no harm. */
export async function removeHostelPhotos(before: string[], after: string[]) {
  const gone = before.filter(p => !after.includes(p)).map(pathOf).filter((x): x is string => !!x);
  if (gone.length) await sb!.storage.from(BUCKET).remove(gone).catch(() => undefined);
}

/* ---------- Owner documents (private) ---------- */
const DOCS = 'docs';
/** How a document's file is stored in the database: "storage:" and its path in the private docs bucket. */
export const DOC_PREFIX = 'storage:';
const safeName = (n: string) => n.replace(/[^\w.-]+/g, '-').slice(-60) || 'file';

/** Uploads an ID, selfie or ownership paper into the owner's own folder. Returns the value to save as the document's url. */
export async function uploadDocFile(ownerId: string, docId: string, fileName: string, dataUrl: string, file?: File): Promise<string> {
  const blob = file ?? await dataUrlToBlob(dataUrl);
  const path = `${ownerId}/${docId}-${safeName(fileName)}`;
  const { error } = await sb!.storage.from(DOCS).upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw new ApiError(/security|Unauthorized/i.test(error.message) ? 'You can only upload your own documents.' : friendly(error));
  return DOC_PREFIX + path;
}
/** Short-lived links to view private documents, for the owner and admins. Takes stored urls, returns a map from stored url to link. */
export async function docLinks(stored: string[]): Promise<Map<string, string>> {
  const paths = stored.filter(u => u.startsWith(DOC_PREFIX)).map(u => u.slice(DOC_PREFIX.length));
  const out = new Map<string, string>(); if (!paths.length) return out;
  const { data } = await sb!.storage.from(DOCS).createSignedUrls(paths, 60 * 60 * 6);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(DOC_PREFIX + d.path, d.signedUrl);
  return out;
}
/** Deletes a replaced document's file. Failures are ignored. */
export async function removeDocFile(stored: string) {
  if (stored.startsWith(DOC_PREFIX)) await sb!.storage.from(DOCS).remove([stored.slice(DOC_PREFIX.length)]).catch(() => undefined);
}
