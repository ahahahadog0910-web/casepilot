import { deflateRawSync } from 'node:zlib';

function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; }
function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value); return buffer; }
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function makeDocx(documentXml) {
  const name = Buffer.from('word/document.xml');
  const plain = Buffer.from(documentXml);
  const compressed = deflateRawSync(plain);
  const checksum = crc32(plain);
  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(checksum),
    u32(compressed.length), u32(plain.length), u16(name.length), u16(0), name, compressed
  ]);
  const centralDirectory = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(checksum),
    u32(compressed.length), u32(plain.length), u16(name.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(0), name
  ]);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(centralDirectory.length),
    u32(localHeader.length), u16(0)
  ]);
  return Buffer.concat([localHeader, centralDirectory, end]);
}
