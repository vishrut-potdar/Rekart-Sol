/**
 * Pure-JS binary EXIF / metadata stripper for JPEG, PNG, and WebP images.
 * Removes GPS coordinates, camera serials, software comments, and XMP packets
 * without altering pixel payloads or requiring native dependencies.
 */

function stripJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks = [buffer.subarray(0, 2)]; // SOI 0xFFD8
  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Unexpected stream alignment; append remainder safely
      chunks.push(buffer.subarray(offset));
      return Buffer.concat(chunks);
    }

    // Skip padding 0xFF bytes
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;

    // SOS (0xDA) starts entropy-coded scan data until EOI (0xD9)
    if (marker === 0xda) {
      chunks.push(Buffer.from([0xff, marker]), buffer.subarray(offset));
      return Buffer.concat(chunks);
    }

    // Standalone markers without length field (TEM 0x01, RST0..7 0xD0..0xD7, EOI 0xD9)
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      chunks.push(Buffer.from([0xff, marker]));
      if (marker === 0xd9) return Buffer.concat(chunks);
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const segLen = buffer.readUInt16BE(offset);
    if (segLen < 2 || offset + segLen > buffer.length) {
      chunks.push(Buffer.from([0xff, marker]), buffer.subarray(offset));
      return Buffer.concat(chunks);
    }

    // Drop APP1 (0xE1: EXIF/XMP), APP13 (0xED: IPTC), COM (0xFE: comment)
    const isMetadataSegment = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!isMetadataSegment) {
      chunks.push(Buffer.from([0xff, marker]), buffer.subarray(offset, offset + segLen));
    }
    offset += segLen;
  }

  return Buffer.concat(chunks);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STRIP_PNG_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPngMetadata(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIG)) {
    return buffer;
  }

  const chunks = [buffer.subarray(0, 8)];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const totalChunkLen = 12 + length;

    if (offset + totalChunkLen > buffer.length) {
      chunks.push(buffer.subarray(offset));
      return Buffer.concat(chunks);
    }

    if (!STRIP_PNG_CHUNKS.has(type)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkLen));
    }
    offset += totalChunkLen;
    if (type === 'IEND') break;
  }

  return Buffer.concat(chunks);
}

const STRIP_WEBP_CHUNKS = new Set(['EXIF', 'XMP ']);

function stripWebpMetadata(buffer) {
  if (
    buffer.length < 12 ||
    buffer.toString('latin1', 0, 4) !== 'RIFF' ||
    buffer.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    return buffer;
  }

  const bodyChunks = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const fourCC = buffer.toString('latin1', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalLen = 8 + paddedSize;

    if (offset + totalLen > buffer.length) {
      bodyChunks.push(buffer.subarray(offset));
      break;
    }

    if (!STRIP_WEBP_CHUNKS.has(fourCC)) {
      bodyChunks.push(buffer.subarray(offset, offset + totalLen));
    }
    offset += totalLen;
  }

  const payload = Buffer.concat(bodyChunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + payload.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, payload]);
}

/**
 * Strips EXIF/XMP/IPTC/comment metadata from JPEG, PNG, and WebP buffers.
 */
export function stripExifMetadata(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return buffer;
  if (mimeType === 'image/jpeg') return stripJpegMetadata(buffer);
  if (mimeType === 'image/png') return stripPngMetadata(buffer);
  if (mimeType === 'image/webp') return stripWebpMetadata(buffer);
  return buffer;
}
