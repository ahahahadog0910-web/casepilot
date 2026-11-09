import { inflateRawSync } from 'node:zlib';

const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 20 * 1024 * 1024;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes) {
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('文件不是有效的 DOCX 文档（缺少 ZIP 目录）');
}

function readDocumentXml(bytes) {
  if (!bytes.length) throw new Error('DOCX 文件为空，请选择有内容的文档');
  if (bytes.length > MAX_DOCX_BYTES) throw new Error('DOCX 文件不能超过 10 MB');

  const endOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = bytes.readUInt16LE(endOffset + 4);
  const directoryDisk = bytes.readUInt16LE(endOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const directorySize = bytes.readUInt32LE(endOffset + 12);
  const directoryOffset = bytes.readUInt32LE(endOffset + 16);
  if (diskNumber || directoryDisk || entriesOnDisk !== entryCount || directoryOffset + directorySize > endOffset) {
    throw new Error('暂不支持分卷或损坏的 DOCX 文件');
  }

  let offset = directoryOffset;
  let documentEntry;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('DOCX 文件的 ZIP 目录已损坏');
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const checksum = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > bytes.length) throw new Error('DOCX 文件的 ZIP 目录已损坏');
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength).replaceAll('\\', '/');
    if (name === 'word/document.xml') documentEntry = { flags, method, checksum, compressedSize, uncompressedSize, localOffset };
    offset = entryEnd;
  }

  if (!documentEntry) throw new Error('DOCX 中没有找到正文内容');
  if (documentEntry.flags & 1) throw new Error('不支持读取设置了密码的 DOCX 文件');
  if (documentEntry.uncompressedSize > MAX_XML_BYTES) throw new Error('DOCX 正文解压后过大，无法安全读取');
  if (documentEntry.method !== 0 && documentEntry.method !== 8) throw new Error('DOCX 使用了暂不支持的压缩格式');

  const { localOffset, checksum, compressedSize, uncompressedSize, method } = documentEntry;
  if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error('DOCX 正文数据已损坏');
  }
  const nameLength = bytes.readUInt16LE(localOffset + 26);
  const extraLength = bytes.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + compressedSize;
  if (dataEnd > bytes.length) throw new Error('DOCX 正文数据已损坏');

  try {
    const compressed = bytes.subarray(dataOffset, dataEnd);
    const xml = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_XML_BYTES });
    if (xml.length !== uncompressedSize) throw new Error('DOCX 正文长度校验失败');
    if (crc32(xml) !== checksum) throw new Error('DOCX 正文校验失败');
    return xml.toString('utf8');
  } catch (error) {
    if (error.message.includes('校验失败')) throw error;
    throw new Error('DOCX 正文解压失败，文件可能已损坏');
  }
}

function decodeXmlText(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name) => {
    if (name[0] === '#') {
      const codePoint = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()];
  });
}

function extractParagraphs(xml) {
  const paragraphs = [];
  const tokenPattern = /<[^>]+>|[^<]+/g;
  let paragraph = null;
  let deletedDepth = 0;
  for (const token of xml.match(tokenPattern) || []) {
    if (token.startsWith('</')) {
      const tagName = token.slice(2).match(/^([\w:.-]+)/)?.[1]?.split(':').at(-1);
      if (tagName === 'del' && deletedDepth) deletedDepth -= 1;
      if (tagName === 'p' && paragraph !== null) {
        const text = paragraph.replace(/[ \u00a0]+/g, ' ').trim();
        if (text) paragraphs.push(text);
        paragraph = null;
      }
      continue;
    }
    if (token.startsWith('<')) {
      const tagName = token.slice(1).match(/^([\w:.-]+)/)?.[1]?.split(':').at(-1);
      if (tagName === 'del') deletedDepth += 1;
      if (tagName === 'p' && !token.endsWith('/>')) paragraph = '';
      if (paragraph !== null && deletedDepth === 0 && tagName === 'tab') paragraph += '\t';
      if (paragraph !== null && deletedDepth === 0 && tagName === 'br') paragraph += '\n';
      continue;
    }
    if (paragraph !== null && deletedDepth === 0) paragraph += decodeXmlText(token);
  }
  return paragraphs.join('\n');
}

export function extractDocxText(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const text = extractParagraphs(readDocumentXml(bytes)).replace(/\r/g, '').trim();
  if (!text) throw new Error('DOCX 中没有可提取的正文文字，请确认文件不是扫描图片或空文档');
  if (text.length > 20000) throw new Error(`提取到 ${text.length.toLocaleString()} 个字符，超过平台 20,000 字符限制；请精简文档后再上传`);
  return text;
}
