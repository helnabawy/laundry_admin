import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded images go. Phase 1 writes to `public/uploads` (served by
 * Next.js); swap in an S3-compatible driver for production by implementing
 * `StorageDriver`.
 */

export interface StorageDriver {
  /** Stores the file and returns its public path or URL. */
  put(file: { bytes: Uint8Array; contentType: string; folder: string }): Promise<string>;
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

class LocalStorage implements StorageDriver {
  constructor(private readonly root = path.join(process.cwd(), "public", "uploads")) {}

  async put({ bytes, contentType, folder }: { bytes: Uint8Array; contentType: string; folder: string }) {
    const ext = IMAGE_TYPES[contentType] ?? "bin";
    const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
    const dir = path.join(this.root, safeFolder);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(path.join(dir, name), bytes);
    return `/uploads/${safeFolder}/${name}`;
  }
}

export const storage: StorageDriver = new LocalStorage();

export class UploadError extends Error {}

/** Validates and stores an uploaded image `File` (from FormData). */
export async function storeImage(file: unknown, folder: string): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("No file uploaded");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Image must be 5 MB or smaller");
  // Some phones send an empty or generic type for camera photos.
  const type = file.type && file.type !== "application/octet-stream" ? file.type : "image/jpeg";
  if (!IMAGE_TYPES[type]) throw new UploadError("Unsupported image type");
  return storage.put({ bytes: new Uint8Array(await file.arrayBuffer()), contentType: type, folder });
}
