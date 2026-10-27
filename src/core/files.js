import { AttachmentBuilder } from 'discord.js';
import { gzipSync } from 'node:zlib';
export function downloadFile(data, name) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return bytes.length > 7500000
    ? new AttachmentBuilder(gzipSync(bytes), { name: name + '.gz' })
    : new AttachmentBuilder(bytes, { name });
}
