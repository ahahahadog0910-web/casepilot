import assert from 'node:assert/strict';
import test from 'node:test';
import { extractDocxText } from '../server/docx.js';
import { makeDocx } from './helpers/docx.js';

test('extracts readable paragraphs, table cells, tabs, breaks, and XML entities from DOCX', () => {
  const xml = '<w:document xmlns:w="urn:w"><w:body>'
    + '<w:p><w:r><w:t>需求标题：</w:t></w:r><w:r><w:t>账户 &amp; 登录</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>手机号必须填写。</w:t><w:tab/><w:t>密码至少 8 位。</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格字段</w:t></w:r></w:p></w:tc>'
    + '<w:tc><w:p><w:r><w:t>必填</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:del><w:r><w:delText>已删除内容</w:delText></w:r></w:del><w:r><w:t>保留内容</w:t></w:r></w:p>'
    + '</w:body></w:document>';

  assert.equal(extractDocxText(makeDocx(xml)), '需求标题：账户 & 登录\n手机号必须填写。\t密码至少 8 位。\n表格字段\n必填\n保留内容');
});

test('rejects invalid, empty, and over-limit DOCX files with actionable errors', () => {
  assert.throws(() => extractDocxText(Buffer.from('not a docx')), /不是有效的 DOCX/);
  assert.throws(() => extractDocxText(makeDocx('<w:document><w:body><w:p/></w:body></w:document>')), /没有可提取的正文文字/);
  const oversized = makeDocx(`<w:document><w:body><w:p><w:r><w:t>${'字'.repeat(20001)}</w:t></w:r></w:p></w:body></w:document>`);
  assert.throws(() => extractDocxText(oversized), /超过平台 20,000 字符限制/);
});
