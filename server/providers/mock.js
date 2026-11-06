function inferOperator(line) {
  if (/必填|不能为空|必须填写|不得为空/.test(line)) return 'required';
  if (/禁止|不允许|不得|不能/.test(line)) return 'forbidden';
  if (/最多|不超过|至多/.test(line)) return 'max';
  if (/至少|不少于|最少/.test(line)) return 'min';
  if (/\d+\s*(秒|分钟|小时|天)内最多|频率/.test(line)) return 'frequency';
  return 'general';
}

export function parseRequirementMock(requirement) {
  const title = requirement.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() || '需求文档';
  const lines = requirement.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const facts = [];

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) continue;
    const cleanLine = line.replace(/^(?:[-*+]\s+|\d+[.、)]\s+)/, '').trim();
    if (!cleanLine) continue;
    if (/^\d+[.、)]\s+/.test(line) || /规则|限制|必须|不得|不超过|至少|最多|至少|频率|状态/.test(cleanLine)) {
      facts.push({
        kind: 'rule',
        statement: cleanLine,
        rule_type: inferOperator(cleanLine),
        source_quote: cleanLine
      });
    } else {
      facts.push({ kind: 'feature', statement: cleanLine, source_quote: cleanLine });
    }
  }

  if (!facts.length && title !== '需求文档') {
    facts.push({ kind: 'feature', statement: title, source_quote: title });
  }
  return { title, facts };
}
