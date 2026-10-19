/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZipReader, BlobReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { decompress } from 'fzstd';
import { PoolNote } from '../types/pool';
import {
  MediaRecord,
  MediaImportStats,
  MediaStorageSummary,
  ApkgImportProgress,
  NeededMediaItem,
} from '../types/media';
import { mediaStore } from '../store/mediaStore';

/**
 * Checks if byte stream starts with Zstandard magic bytes (0x28 0xB5 0x2F 0xFD)
 */
export function isZstd(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  );
}

/**
 * Assigns proper MIME type from file extension.
 * Essential for Safari / iOS audio and image rendering.
 */
export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    value += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
    if ((b & 0x80) === 0) break;
    if (shift > 42) break; // safety
  }
  return [value, pos];
}

/**
 * Parses Anki `media` file content into an ordered array of filenames.
 * Supports both modern Zstandard protobuf (Anki 2.1.50+) and legacy JSON.
 * The order in this array corresponds to the zip entries "0", "1", "2", ...
 */
export function parseMediaIndex(bytes: Uint8Array): string[] {
  const decoder = new TextDecoder('utf-8');

  // Check if uncompressed content starts with JSON '{'
  const preview = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 64))).trim();
  if (preview.startsWith('{')) {
    try {
      const fullText = decoder.decode(bytes);
      const json = JSON.parse(fullText);
      // Key can be "0", "1", ...
      const entries = Object.entries(json)
        .map(([k, v]) => ({ index: parseInt(k, 10), name: String(v) }))
        .sort((a, b) => a.index - b.index);

      // In case keys are non-consecutive or 0-indexed
      const maxIdx = entries.reduce((max, e) => Math.max(max, isNaN(e.index) ? 0 : e.index), -1);
      if (maxIdx >= 0) {
        const result: string[] = new Array(maxIdx + 1);
        for (const e of entries) {
          if (!isNaN(e.index)) {
            result[e.index] = e.name;
          }
        }
        return result;
      }
      return entries.map((e) => e.name);
    } catch (err) {
      console.warn('Failed to parse media as JSON, trying protobuf:', err);
    }
  }

  // Protobuf parser
  const names: string[] = [];
  let pos = 0;

  while (pos < bytes.length) {
    const [tag, tagPos] = readVarint(bytes, pos);
    pos = tagPos;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;

    if (wireType === 2) {
      // Length-delimited (submessage or string)
      const [len, lenPos] = readVarint(bytes, pos);
      const sub = bytes.subarray(lenPos, lenPos + len);
      pos = lenPos + len;

      // If submessage (MediaEntry) starts with 0x0A (field 1 = name)
      if (sub.length > 2 && sub[0] === 0x0a) {
        let subPos = 0;
        let foundName = '';

        while (subPos < sub.length) {
          const [inTag, inTagPos] = readVarint(sub, subPos);
          subPos = inTagPos;
          const inField = inTag >>> 3;
          const inWire = inTag & 0x7;

          if (inField === 1 && inWire === 2) {
            const [nameLen, namePos] = readVarint(sub, subPos);
            foundName = decoder.decode(sub.subarray(namePos, namePos + nameLen));
            subPos = namePos + nameLen;
          } else if (inWire === 0) {
            const [, next] = readVarint(sub, subPos);
            subPos = next;
          } else if (inWire === 1) {
            subPos += 8;
          } else if (inWire === 2) {
            const [skipLen, next] = readVarint(sub, subPos);
            subPos = next + skipLen;
          } else if (inWire === 5) {
            subPos += 4;
          } else {
            break;
          }
        }

        if (foundName) {
          names.push(foundName);
        }
      } else {
        // Direct string
        const candidate = decoder.decode(sub);
        if (candidate && !/[\x00-\x1f]/.test(candidate)) {
          names.push(candidate);
        }
      }
    } else if (wireType === 0) {
      const [, next] = readVarint(bytes, pos);
      pos = next;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }

  return names;
}

/**
 * Extracts all needed media references from pool notes' front, back, and hint fields.
 */
export function extractNeededMediaFromNotes(notes: PoolNote[]): {
  neededMap: Map<string, NeededMediaItem>;
  matchItem: (candidateName: string) => NeededMediaItem | null;
  totalNeeded: number;
} {
  const neededMap = new Map<string, NeededMediaItem>();

  const addRef = (fileName: string, deck: string, headword: string, guid: string) => {
    const clean = fileName.trim();
    if (!clean) return;

    if (!neededMap.has(clean)) {
      neededMap.set(clean, {
        originalName: clean,
        decks: new Set(),
        headwords: new Set(),
        guids: new Set(),
      });
    }

    const item = neededMap.get(clean)!;
    if (deck) item.decks.add(deck);
    if (headword) item.headwords.add(headword);
    if (guid) item.guids.add(guid);
  };

  const soundRegex = /\[sound:([^\]]+)\]/gi;
  const imgRegex = /<img\b[^>]*?\bsrc=["']?([^"'\s>]+)["']?[^>]*>/gi;

  for (const note of notes) {
    const textPool = `${note.front} ${note.back} ${note.hint || ''}`;
    const headword = note.headwords[0] || '';

    // 1. [sound:file.ext]
    let soundMatch: RegExpExecArray | null;
    soundRegex.lastIndex = 0;
    while ((soundMatch = soundRegex.exec(textPool)) !== null) {
      const fn = soundMatch[1];
      if (fn) {
        addRef(fn, note.deck, headword, note.guid);
      }
    }

    // 2. <img src="file.ext">
    let imgMatch: RegExpExecArray | null;
    imgRegex.lastIndex = 0;
    while ((imgMatch = imgRegex.exec(textPool)) !== null) {
      const src = imgMatch[1];
      if (
        src &&
        !/^(https?:\/\/|data:|javascript:|blob:|file:)/i.test(src) &&
        !src.includes('<') &&
        !src.includes('>')
      ) {
        addRef(src, note.deck, headword, note.guid);
      }
    }
  }

  // Build secondary lookup maps for matching
  const exactMap = new Map<string, NeededMediaItem>();
  const decodedMap = new Map<string, NeededMediaItem>();
  const lowerMap = new Map<string, NeededMediaItem>();
  const lowerDecodedMap = new Map<string, NeededMediaItem>();

  for (const [key, item] of neededMap) {
    exactMap.set(key, item);

    try {
      const dec = decodeURIComponent(key);
      decodedMap.set(dec, item);
      lowerDecodedMap.set(dec.toLowerCase(), item);
    } catch {
      // Ignore
    }

    lowerMap.set(key.toLowerCase(), item);
  }

  const matchItem = (candidateName: string): NeededMediaItem | null => {
    if (!candidateName) return null;
    const clean = candidateName.trim();
    if (!clean) return null;

    // 1. Exact match
    if (exactMap.has(clean)) return exactMap.get(clean)!;

    // 2. Decoded match
    try {
      const dec = decodeURIComponent(clean);
      if (decodedMap.has(dec)) return decodedMap.get(dec)!;
      if (exactMap.has(dec)) return exactMap.get(dec)!;
    } catch {
      // Ignore
    }

    // 3. Lowercase match
    const lower = clean.toLowerCase();
    if (lowerMap.has(lower)) return lowerMap.get(lower)!;

    // 4. Lowercase decoded match
    try {
      const decLower = decodeURIComponent(clean).toLowerCase();
      if (lowerDecodedMap.has(decLower)) return lowerDecodedMap.get(decLower)!;
    } catch {
      // Ignore
    }

    return null;
  };

  return {
    neededMap,
    matchItem,
    totalNeeded: neededMap.size,
  };
}

export interface ImportApkgOptions {
  file: File;
  allNotes: PoolNote[];
  onProgress?: (progress: ApkgImportProgress) => void;
  abortSignal?: AbortSignal;
}

/**
 * Main importer for `.apkg` file:
 * - Reads zip entries without loading full file into memory
 * - Decompresses media index and checks protobuf / JSON
 * - Extracts only referenced media files
 * - Writes in batches of 20 to IndexedDB
 * - Supports incremental skip of already existing files
 * - Supports cancellation via AbortSignal
 */
export async function importApkgMedia({
  file,
  allNotes,
  onProgress,
  abortSignal,
}: ImportApkgOptions): Promise<{
  stats: MediaImportStats;
  storage: MediaStorageSummary;
  cancelled: boolean;
}> {
  if (allNotes.length === 0) {
    throw new Error('Önce All_Decks.txt ile havuzu yükleyin.');
  }

  // 1. Extract needed media items from notes
  onProgress?.({
    phase: 'analyzing',
    processedCount: 0,
    totalNeededCount: 0,
    processedBytes: 0,
    totalBytes: file.size,
    currentFileName: 'Kartlardaki ses ve resim referansları taranıyor...',
  });

  const { neededMap, matchItem, totalNeeded } = extractNeededMediaFromNotes(allNotes);

  if (totalNeeded === 0) {
    const storage = await mediaStore.getStorageSummary();
    return {
      stats: {
        addedCount: 0,
        alreadyExistedCount: 0,
        unusedSkippedCount: 0,
        missingInApkgCount: 0,
        totalInApkg: 0,
        totalNeeded: 0,
        missingList: [],
      },
      storage,
      cancelled: false,
    };
  }

  // 2. Open zip with BlobReader
  onProgress?.({
    phase: 'reading-index',
    processedCount: 0,
    totalNeededCount: totalNeeded,
    processedBytes: 0,
    totalBytes: file.size,
    currentFileName: '.apkg arşivi ve medya indeksi açılıyor...',
  });

  const zipReader = new ZipReader(new BlobReader(file));
  let entries: any[] = [];
  try {
    entries = await zipReader.getEntries();
  } catch (err: any) {
    await zipReader.close();
    throw new Error(`.apkg zip dosyası okunamadı: ${err?.message || 'Geçersiz arşiv'}`);
  }

  // Find 'media' entry
  const mediaEntry = entries.find(
    (e) => e.filename === 'media' || e.filename.toLowerCase() === 'media'
  );

  if (!mediaEntry) {
    await zipReader.close();
    throw new Error("Geçersiz .apkg dosyası: 'media' indeksi bulunamadı.");
  }

  // Read media file data
  const rawMediaBytes = await mediaEntry.getData(new Uint8ArrayWriter());
  let decompressedMediaBytes: Uint8Array;
  if (isZstd(rawMediaBytes)) {
    try {
      decompressedMediaBytes = decompress(rawMediaBytes);
    } catch (e: any) {
      await zipReader.close();
      throw new Error(`Medya indeksi zstd açma hatası: ${e?.message || e}`);
    }
  } else {
    decompressedMediaBytes = rawMediaBytes;
  }

  const mediaList = parseMediaIndex(decompressedMediaBytes);
  if (mediaList.length === 0) {
    await zipReader.close();
    throw new Error('.apkg dosyasında medya kaydı bulunamadı.');
  }

  // Build entry lookup map by filename
  const zipEntriesByFilename = new Map<string, any>();
  for (const entry of entries) {
    zipEntriesByFilename.set(entry.filename, entry);
  }

  // 3. Load existing media to support incremental imports
  const existingMap = await mediaStore.getExistingMediaMap();

  const satisfiedNeededOriginalNames = new Set<string>();
  let alreadyExistedCount = 0;
  let unusedSkippedCount = 0;

  // Plan extraction queue
  interface QueueItem {
    index: number;
    apkgFileName: string;
    originalName: string;
  }

  const queue: QueueItem[] = [];

  for (let i = 0; i < mediaList.length; i++) {
    const apkgFileName = mediaList[i];
    if (!apkgFileName) continue;

    const matchedItem = matchItem(apkgFileName);
    if (!matchedItem) {
      unusedSkippedCount++;
      continue;
    }

    // Found a needed file!
    satisfiedNeededOriginalNames.add(matchedItem.originalName);

    // Incremental check: already in IndexedDB?
    if (existingMap.has(matchedItem.originalName) && (existingMap.get(matchedItem.originalName) || 0) > 0) {
      alreadyExistedCount++;
      continue;
    }

    // Also check if stored under apkgFileName
    if (existingMap.has(apkgFileName) && (existingMap.get(apkgFileName) || 0) > 0) {
      alreadyExistedCount++;
      continue;
    }

    queue.push({
      index: i,
      apkgFileName,
      originalName: matchedItem.originalName,
    });
  }

  // 4. Extract queued files in small batches (max 20)
  let addedCount = 0;
  let processedBytes = 0;
  let batch: MediaRecord[] = [];
  let isCancelled = false;

  const totalToExtract = queue.length;

  for (let qIdx = 0; qIdx < totalToExtract; qIdx++) {
    if (abortSignal?.aborted) {
      isCancelled = true;
      break;
    }

    const item = queue[qIdx];
    const zipEntry = zipEntriesByFilename.get(String(item.index));

    if (!zipEntry) {
      console.warn(`Zip entry "${item.index}" for file "${item.apkgFileName}" not found.`);
      continue;
    }

    try {
      const rawData = await zipEntry.getData(new Uint8ArrayWriter());
      let fileBytes: Uint8Array;
      if (isZstd(rawData)) {
        try {
          fileBytes = decompress(rawData);
        } catch {
          fileBytes = rawData;
        }
      } else {
        fileBytes = rawData;
      }

      const mime = getMimeTypeFromFilename(item.originalName || item.apkgFileName);
      const blob = new Blob([fileBytes as unknown as BlobPart], { type: mime });
      const now = Date.now();

      // Primary record with original name referenced by cards
      batch.push({
        name: item.originalName,
        blob,
        size: blob.size,
        mime,
        importedAt: now,
      });

      // If apkg name is different, also save alias
      if (item.apkgFileName !== item.originalName) {
        batch.push({
          name: item.apkgFileName,
          blob,
          size: blob.size,
          mime,
          importedAt: now,
        });
      }

      addedCount++;
      processedBytes += blob.size;

      // Commit batch if reaches 20
      if (batch.length >= 20) {
        await mediaStore.addMediaBatch(batch);
        batch = [];
      }

      // Notify progress
      onProgress?.({
        phase: 'extracting',
        processedCount: qIdx + 1,
        totalNeededCount: totalToExtract,
        processedBytes,
        totalBytes: file.size,
        currentFileName: item.originalName,
      });

      // Yield event loop
      await new Promise((r) => setTimeout(r, 0));
    } catch (extractErr) {
      console.warn(`Failed extracting item "${item.originalName}":`, extractErr);
    }
  }

  // Commit remaining items
  if (batch.length > 0) {
    try {
      await mediaStore.addMediaBatch(batch);
    } catch (batchErr) {
      console.warn('Failed committing final media batch:', batchErr);
    }
    batch = [];
  }

  await zipReader.close();

  // 5. Calculate missing items (needed by cards, but not found in .apkg)
  const missingList: Array<{ fileName: string; deck?: string; headword?: string }> = [];

  for (const [origName, item] of neededMap) {
    if (!satisfiedNeededOriginalNames.has(origName) && !existingMap.has(origName)) {
      missingList.push({
        fileName: origName,
        deck: Array.from(item.decks).join(', ') || undefined,
        headword: Array.from(item.headwords).slice(0, 3).join(', ') || undefined,
      });
    }
  }

  // Request persistent storage
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      // Ignore
    }
  }

  const storage = await mediaStore.getStorageSummary();

  const stats: MediaImportStats = {
    addedCount,
    alreadyExistedCount,
    unusedSkippedCount,
    missingInApkgCount: missingList.length,
    totalInApkg: mediaList.length,
    totalNeeded,
    missingList,
  };

  onProgress?.({
    phase: isCancelled ? 'cancelled' : 'completed',
    processedCount: addedCount,
    totalNeededCount: totalToExtract,
    processedBytes,
    totalBytes: file.size,
    currentFileName: isCancelled ? 'İptal edildi' : 'Tamamlandı',
  });

  return {
    stats,
    storage,
    cancelled: isCancelled,
  };
}
