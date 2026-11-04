const sampleRequirement = `# 会员登录功能

## 功能描述
用户可以通过手机号和密码登录会员中心。未注册用户可以通过手机号注册后登录。

## 业务规则
1. 手机号必须为中国大陆 11 位手机号，密码长度为 8-20 位。
2. 连续 5 次密码错误后，账号锁定 30 分钟。
3. 登录成功后跳转至会员首页，并保留登录状态 7 天。
4. 验证码发送频率为同一手机号 60 秒内最多 1 次。
5. 短信服务异常时，需要给出明确提示，用户可以重新尝试。

## 权限与异常
未登录用户访问会员中心时跳转到登录页；已登录用户再次访问登录页时直接进入会员首页。`;

const testPoints = [
  { title: '手机号 + 密码登录成功', desc: '输入合法手机号和正确密码，验证跳转及登录状态', type: 'functional', label: '功能' },
  { title: '新用户注册后完成登录', desc: '手机号注册、验证码校验与首次登录链路', type: 'functional', label: '功能' },
  { title: '登录状态与首页跳转', desc: '成功后跳转会员首页，并保持 7 天登录状态', type: 'functional', label: '功能' },
  { title: '手机号格式校验', desc: '覆盖位数不足、超长、非数字及非大陆号段', type: 'boundary', label: '边界' },
  { title: '密码长度与特殊字符', desc: '覆盖 7 位、21 位、空密码与边界长度', type: 'boundary', label: '边界' },
  { title: '连续错误锁定机制', desc: '第 5 次失败锁定 30 分钟，验证提示与解锁行为', type: 'risk', label: '风险' },
  { title: '短信服务异常降级', desc: '模拟第三方超时、失败，验证用户提示和重试', type: 'risk', label: '风险' }
];

const cases = [
  ['登录-001', '使用正确手机号和密码登录', '功能', '高', '待评审', 'functional'],
  ['登录-002', '未注册手机号注册后登录', '功能', '中', '待评审', 'functional'],
  ['登录-003', '手机号为空时提交登录', '边界', '高', '待评审', 'boundary'],
  ['登录-004', '输入非 11 位手机号', '边界', '中', '待评审', 'boundary'],
  ['登录-005', '连续 5 次密码错误后账号锁定', '风险', '高', '待评审', 'risk'],
  ['登录-006', '短信服务异常时重新发送验证码', '风险', '高', '待评审', 'risk'],
  ['登录-007', '登录成功后刷新页面保持登录状态', '功能', '中', '待评审', 'functional'],
  ['登录-008', '已登录用户访问登录页直接进入首页', '功能', '中', '待评审', 'functional']
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let generated = false;
let exportFormat = 'excel';

function showToast(message) {
  $('#toast-text').textContent = message;
  $('#toast').classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => $('#toast').classList.remove('show'), 2400);
}

function renderTestPoints() {
  $('#testpoint-list').innerHTML = testPoints.map((point, index) => `
    <div class="testpoint-item">
      <span class="point-no">${String(index + 1).padStart(2, '0')}</span>
      <div class="point-main"><strong>${point.title}</strong><p>${point.desc}</p></div>
      <span class="point-tag ${point.type}">${point.label}</span>
    </div>`).join('');
}

function renderCases(filter = '') {
  const normalized = filter.trim().toLowerCase();
  const filtered = cases.filter((item) => item[1].toLowerCase().includes(normalized) || item[0].toLowerCase().includes(normalized));
  $('#case-table-body').innerHTML = filtered.map((item) => `
    <tr>
      <td>${item[0]}</td><td class="case-title">${item[1]}</td>
      <td><span class="type-badge ${item[5] === 'boundary' ? 'boundary' : ''}">${item[2]}</span></td>
      <td><span class="priority-badge ${item[3] === '高' ? 'high' : 'medium'}">${item[3]}优先级</span></td>
      <td><span class="state-badge">${item[4]}</span></td><td><button class="row-more">•••</button></td>
    </tr>`).join('');
  $('#table-result-count').textContent = normalized ? `找到 ${filtered.length} 条匹配用例` : '显示 1-6 条，共 56 条';
}

function updateCount() {
  $('#char-count').textContent = `${$('#requirement-input').value.length.toLocaleString()} / 20,000`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportExcel() {
  const rows = cases.map((item) => `<tr><td>${item[0]}</td><td>${item[1]}</td><td>${item[2]}</td><td>${item[3]}优先级</td><td>${item[4]}</td><td>${item[5] === 'risk' ? '需重点评审' : '正常'}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif}th,td{border:1px solid #d9dce5;padding:8px 12px}th{background:#f0efff;color:#4f46b5}td{color:#454957}</style></head><body><table><thead><tr><th>编号</th><th>用例标题</th><th>类型</th><th>优先级</th><th>状态</th><th>评审建议</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), 'CasePilot-测试用例.xls');
  showToast('Excel 测试用例已导出');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function writeU32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => { output.set(part, offset); offset += part.length; });
  return output;
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = concatBytes([new Uint8Array([80, 75, 3, 4]), writeU16(20), writeU16(0), writeU16(0), writeU16(0), writeU16(0), writeU32(crc), writeU32(data.length), writeU32(data.length), writeU16(nameBytes.length), writeU16(0), nameBytes, data]);
    localParts.push(local);
    const central = concatBytes([new Uint8Array([80, 75, 1, 2]), writeU16(20), writeU16(20), writeU16(0), writeU16(0), writeU16(0), writeU16(0), writeU32(crc), writeU32(data.length), writeU32(data.length), writeU16(nameBytes.length), writeU16(0), writeU16(0), writeU16(0), writeU16(0), writeU32(0), writeU32(offset), nameBytes]);
    centralParts.push(central);
    offset += local.length;
  });
  const centralDirectory = concatBytes(centralParts);
  const localDirectory = concatBytes(localParts);
  const end = concatBytes([new Uint8Array([80, 75, 5, 6]), writeU16(0), writeU16(0), writeU16(entries.length), writeU16(entries.length), writeU32(centralDirectory.length), writeU32(localDirectory.length), writeU16(0)]);
  return concatBytes([localDirectory, centralDirectory, end]);
}

function exportXMind() {
  const groups = { functional: '功能测试点', boundary: '边界与异常', risk: '风险测试点' };
  const topic = (id, title, description = '') => ({ id, title, ...(description ? { notes: { plain: { content: description } } } : {}) });
  const branches = Object.entries(groups).map(([type, title]) => ({
    ...topic(`group-${type}`, title),
    children: { attached: testPoints.filter((point) => point.type === type).map((point, index) => topic(`${type}-${index}`, point.title, point.desc)) }
  }));
  const rootTitle = $('#results-title').textContent.replace(' · 测试方案', '');
  const content = [{ id: 'casepilot-sheet', class: 'sheet', title: $('#results-title').textContent, rootTopic: { ...topic('casepilot-root', rootTitle), children: { attached: branches } } }];
  const metadata = { creator: 'CasePilot', title: $('#results-title').textContent, version: '1.0' };
  const manifest = { 'file-entries': { 'content.json': {}, 'metadata.json': {} } };
  const zip = createZip([
    ['content.json', JSON.stringify(content, null, 2)],
    ['metadata.json', JSON.stringify(metadata, null, 2)],
    ['manifest.json', JSON.stringify(manifest, null, 2)]
  ]);
  downloadBlob(new Blob([zip], { type: 'application/xmind' }), 'CasePilot-测试点.xmind');
  showToast('XMind 测试点已导出');
}

function goToResults() {
  if (!$('#requirement-input').value.trim()) {
    $('#requirement-input').focus();
    showToast('请先输入或上传一份需求文档');
    return;
  }
  const title = $('#requirement-input').value.includes('会员') ? '会员登录功能 · 测试方案' : '需求文档 · 测试方案';
  $('#results-title').textContent = title;
  $('#results-subtitle').textContent = `基于需求文档生成 · 刚刚 · ${$('#detail-level').selectedOptions[0].textContent}`;
  $('#dashboard-page').classList.add('hidden');
  $('#placeholder-page').classList.add('hidden');
  $('#results-page').classList.remove('hidden');
  $('#breadcrumb-current').textContent = '测试方案';
  generated = true;
  renderTestPoints();
  renderCases();
  showToast('测试方案生成完成');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToDashboard() {
  $('#results-page').classList.add('hidden');
  $('#placeholder-page').classList.add('hidden');
  $('#dashboard-page').classList.remove('hidden');
  $('#breadcrumb-current').textContent = '智能生成';
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === 'dashboard'));
}

$('#requirement-input').addEventListener('input', updateCount);
$('#sample-btn').addEventListener('click', () => { $('#requirement-input').value = sampleRequirement; updateCount(); showToast('已填入示例需求'); });
$('#generate-btn').addEventListener('click', () => {
  const button = $('#generate-btn');
  button.disabled = true;
  button.querySelector('span:nth-child(2)').textContent = '正在分析需求…';
  window.setTimeout(() => { button.disabled = false; button.querySelector('span:nth-child(2)').textContent = '生成测试方案'; goToResults(); }, 650);
});
$('#back-to-dashboard').addEventListener('click', goToDashboard);
$('#regenerate-btn').addEventListener('click', () => { showToast('已根据当前配置重新生成'); });
$('#export-btn').addEventListener('click', () => { if (exportFormat === 'xmind') exportXMind(); else exportExcel(); });
$('#export-toggle').addEventListener('click', (event) => { event.stopPropagation(); $('#export-menu').classList.toggle('open'); });
$$('.export-option').forEach((option) => option.addEventListener('click', () => {
  exportFormat = option.dataset.exportFormat;
  $$('.export-option').forEach((item) => item.classList.toggle('selected', item === option));
  $('#export-btn').textContent = exportFormat === 'xmind' ? '↓ 导出 XMind' : '↓ 导出 Excel';
  $('#export-menu').classList.remove('open');
  showToast(exportFormat === 'xmind' ? '已切换为 XMind 测试点' : '已切换为 Excel 测试用例');
}));
document.addEventListener('click', (event) => { if (!event.target.closest('.export-control')) $('#export-menu').classList.remove('open'); });
$('#case-search').addEventListener('input', (event) => renderCases(event.target.value));
$('#reset-config').addEventListener('click', () => { $$('.check-chip').forEach((chip, index) => { chip.classList.toggle('selected', index < 2); chip.querySelector('input').checked = index < 2; }); $('#detail-level').value = 'standard'; $('#test-level').value = '系统测试'; showToast('配置已重置'); });

$$('.check-chip').forEach((chip) => chip.addEventListener('click', () => { const input = chip.querySelector('input'); input.checked = !input.checked; chip.classList.toggle('selected', input.checked); }));
$('#upload-trigger').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) { $('#requirement-input').value = file.name.endsWith('.docx') ? `已上传：${file.name}\n\n（DOCX 文档将在接入解析服务后自动提取内容）` : sampleRequirement; updateCount(); showToast(`已读取 ${file.name}`); } });
['dragenter', 'dragover'].forEach((name) => $('#drop-zone').addEventListener(name, (event) => { event.preventDefault(); $('#drop-zone').classList.add('dragover'); }));
['dragleave', 'drop'].forEach((name) => $('#drop-zone').addEventListener(name, (event) => { event.preventDefault(); $('#drop-zone').classList.remove('dragover'); }));
$('#drop-zone').addEventListener('drop', (event) => { const file = event.dataTransfer.files[0]; if (file) { $('#requirement-input').value = file.name.endsWith('.docx') ? `已上传：${file.name}` : sampleRequirement; updateCount(); showToast(`已读取 ${file.name}`); } });

$$('.nav-item').forEach((item) => item.addEventListener('click', () => {
  const page = item.dataset.page;
  $$('.nav-item').forEach((nav) => nav.classList.toggle('active', nav === item));
  if (page === 'dashboard') { goToDashboard(); return; }
  $('#dashboard-page').classList.add('hidden'); $('#results-page').classList.add('hidden'); $('#placeholder-page').classList.remove('hidden');
  $('#placeholder-title').textContent = item.querySelector('span:nth-child(2)').textContent;
  $('#breadcrumb-current').textContent = item.querySelector('span:nth-child(2)').textContent;
}));
$('#placeholder-back').addEventListener('click', goToDashboard);
$('#new-project-card').addEventListener('click', () => { $('#requirement-input').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); showToast('开始创建一个新的测试项目'); });

renderTestPoints();
renderCases();
