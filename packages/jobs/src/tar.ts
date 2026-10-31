/**
 * Just enough of the tar format (POSIX ustar) to write and read the app's backups, so they open with any `tar` and
 * need no dependency. Regular files only, names up to 100 bytes: that's all a backup holds.
 */

const BLOCK = 512;

export interface TarEntry {
  name: string;
  data: Uint8Array;
  /** Unix permissions, e.g. 0o600. */
  mode?: number;
  mtime?: Date;
}

function octal(value: number, width: number): string {
  // width - 1 digits and a NUL, the form every tar accepts.
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function header(entry: TarEntry): Uint8Array {
  const name = Buffer.from(entry.name, 'utf8');
  if (name.length === 0 || name.length > 100) throw new Error(`Tar entry name must be 1–100 bytes: ${entry.name}`);
  const block = Buffer.alloc(BLOCK);
  name.copy(block, 0);
  block.write(octal(entry.mode ?? 0o600, 8), 100, 'ascii');
  block.write(octal(0, 8), 108, 'ascii'); // uid
  block.write(octal(0, 8), 116, 'ascii'); // gid
  block.write(octal(entry.data.length, 12), 124, 'ascii');
  block.write(octal(Math.floor((entry.mtime ?? new Date()).getTime() / 1000), 12), 136, 'ascii');
  block.write('        ', 148, 'ascii'); // checksum placeholder: eight spaces while summing
  block.write('0', 156, 'ascii'); // regular file
  block.write('ustar\0', 257, 'ascii');
  block.write('00', 263, 'ascii');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return block;
}

const padding = (size: number) => new Uint8Array((BLOCK - (size % BLOCK)) % BLOCK);

/** The archive as a sequence of chunks, for streaming into gzip: one entry in memory at a time. */
export async function* tarChunks(entries: Iterable<TarEntry> | AsyncIterable<TarEntry>): AsyncGenerator<Uint8Array> {
  for await (const entry of entries) {
    yield header(entry);
    yield entry.data;
    yield padding(entry.data.length);
  }
  yield new Uint8Array(BLOCK * 2); // end of archive
}

const field = (block: Buffer, start: number, length: number) => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString('utf8');
};

/** Reads every regular file in an (uncompressed) archive. Throws on anything malformed. */
export function readTar(archive: Uint8Array): TarEntry[] {
  const buffer = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + BLOCK <= buffer.length) {
    const block = buffer.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) return entries; // end of archive
    const stored = Number.parseInt(field(block, 148, 8).trim(), 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : block[i]!;
    if (stored !== sum) throw new Error('Not a valid tar archive (bad header checksum).');

    const prefix = field(block, 345, 155);
    const name = (prefix ? `${prefix}/` : '') + field(block, 0, 100);
    const size = Number.parseInt(field(block, 124, 12).trim() || '0', 8);
    const type = field(block, 156, 1) || '0';
    const start = offset + BLOCK;
    if (!Number.isFinite(size) || size < 0 || start + size > buffer.length) throw new Error('Not a valid tar archive (truncated).');
    if (type === '0') {
      entries.push({
        name,
        data: buffer.subarray(start, start + size),
        mode: Number.parseInt(field(block, 100, 8).trim() || '600', 8),
        mtime: new Date(Number.parseInt(field(block, 136, 12).trim() || '0', 8) * 1000),
      });
    }
    offset = start + size + ((BLOCK - (size % BLOCK)) % BLOCK);
  }
  throw new Error('Not a valid tar archive (no end marker).');
}
