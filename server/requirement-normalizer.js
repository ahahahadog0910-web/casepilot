import {
  STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
  assertStructuredRequirement
} from './schemas.js';

function parseJson(value) {
  if (typeof value === 'object' && value !== null) return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('需求解析模型返回的内容不是合法 JSON');
  }
}

const text = (value) => String(value ?? '').trim();
function validateQuote(candidate, source) {
  const quote = text(candidate?.source_quote || candidate?.sourceQuote || candidate?.quote);
  return quote && source.includes(quote) ? quote : '';
}

function collectCandidates(raw) {
  const candidates = Array.isArray(raw.facts) ? raw.facts.filter((item) => item && typeof item === 'object') : [];
  for (const item of Array.isArray(raw.features) ? raw.features : []) {
    if (item && typeof item === 'object') candidates.push({ ...item, rule_type: item.rule_type || 'feature' });
  }
  for (const item of Array.isArray(raw.businessRules) ? raw.businessRules : []) {
    if (item && typeof item === 'object') candidates.push({ ...item, rule_type: item.rule_type || item.operator || 'general' });
  }
  for (const workflow of Array.isArray(raw.workflows) ? raw.workflows : []) {
    for (const step of Array.isArray(workflow?.steps) ? workflow.steps : []) {
      if (step && typeof step === 'object') candidates.push({ ...step, rule_type: 'workflow_step' });
    }
  }
  return candidates;
}

function sourceSegments(source) {
  const segments = [];
  let inBackgroundSection = false;
  let sawDocumentContent = false;
  const backgroundHeadings = /^(?:背景|项目背景|方案背景|需求概述|项目概述|现状|竞品|数据盘点|历史说明)$/;
  const requirementHeadings = /^(?:需求详情|需求一|需求二|功能点概述|功能需求|业务规则|验收标准|方案|测试范围)$/;
  for (const lineMatch of source.matchAll(/[^\r\n]+/g)) {
    const line = lineMatch[0];
    const lineOffset = lineMatch.index;
    const markdownHeading = line.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    const plainHeading = line.trim().match(/^([^：:]{2,24})[：:]?$/)?.[1];
    const heading = (markdownHeading || plainHeading || '').trim().replace(/[：:]$/, '');
    if (markdownHeading) {
      inBackgroundSection = backgroundHeadings.test(heading);
      continue;
    }
    if (backgroundHeadings.test(heading)) {
      inBackgroundSection = true;
    } else if (requirementHeadings.test(heading)) {
      inBackgroundSection = false;
    }
    if (inBackgroundSection) continue;
    // Ignore empty/format-only table rows copied from product specs. Keep rows
    // with actual cell content available for exact source tracing.
    if (/^\s*(?:\|\s*)+$/.test(line) || /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) continue;
    // Common wiki-copy navigation and author metadata are document chrome.
    if (/^\s*(?:转至|Skip to|Go to|由.{0,80}创建|最后由.{0,80}修改|E编辑|F收藏|观看|S分享|页面[.…]*|基建)\b/i.test(line)) continue;
    // Plain-text exports often put the document title before any Markdown
    // heading. Exclude that first short, non-actionable line without suppressing
    // a first-line acceptance criterion such as “手机号必须填写”。
    const firstLine = line.trim();
    const looksLikeDocumentTitle = !sawDocumentContent
      && firstLine.length <= 48
      && !/^[-*+\d]/.test(firstLine)
      && !/[。！？!?；;]$/.test(firstLine)
      && !/(?:必须|应当|应该|支持|可以|能够|点击|进入|展示|显示|保存|生成|更新|删除|发送|接收|不少于|至少|最多|不超过|>=|<=|≥|≤|\d+\s*(?:个|条|人|位|次|天|小时|分钟|点))/.test(firstLine);
    if (looksLikeDocumentTitle) {
      sawDocumentContent = true;
      continue;
    }
    sawDocumentContent = true;
    // Discard purpose-only prose when it does not state an observable behavior.
    // Numbered acceptance items and lines with explicit behavior remain eligible.
    const purposeOnly = /^\s*(?:为确保|为了避免|为了提升|本次(?:目标|重点)|旨在|计划通过)/.test(line)
      && !/(?:必须|应当|应该|支持|能够|可以|点击|进入|展示|显示|保存|生成|更新|删除|发送|接收|触发|不少于|至少|最多|不超过|>=|<=|≥|≤|must|shall|should|can\s+)/i.test(line);
    if (purposeOnly && !/^\s*(?:[-*+]\s+|\d+[.、)]\s+)/.test(line)) continue;
    const listItem = /^\s*(?:[-*+]\s+|\d+[.、)]\s+)/.test(line);
    // Semicolons may join a guard with its outcome. Keep them until
    // splitClauses can determine whether the condition must stay intact.
    for (const sentenceMatch of line.matchAll(/[^。！？!?]+(?:[。！？!?]+|$)/g)) {
      const rawPart = sentenceMatch[0];
      let start = sentenceMatch.index + (rawPart.match(/^\s*/)?.[0].length || 0);
      const end = sentenceMatch.index + rawPart.length - (rawPart.match(/\s*$/)?.[0].length || 0);
      const prefix = line.slice(start, end).match(/^(?:#{1,6}\s+|[-*+]\s+|\d+[.、)]\s+)/);
      if (prefix) start += prefix[0].length;
      start += line.slice(start, end).length - line.slice(start, end).trimStart().length;
      const quote = line.slice(start, end).trimEnd();
      if (quote && !/(?:^|\s)(?:待确认|待讨论|待定)(?:\s|$)/.test(quote)) segments.push({
        quote,
        start: lineOffset + start,
        end: lineOffset + start + quote.length,
        lineStart: lineOffset,
        listItem
      });
    }
  }
  return segments;
}

function referencedSegments(candidates, source, segments) {
  const selected = new Map();
  for (const candidate of candidates) {
    const quote = validateQuote(candidate, source);
    if (!quote) continue;
    // Candidate labels and granularity are hints only; source grammar is authoritative.
    let from = 0;
    while (from <= source.length - quote.length) {
      const occurrence = source.indexOf(quote, from);
      if (occurrence < 0) break;
      const occurrenceEnd = occurrence + quote.length;
      segments.forEach((segment, index) => {
        if (occurrence < segment.end && occurrenceEnd > segment.start) selected.set(index, segments[index]);
      });
      from = occurrence + 1;
    }
  }
  const unresolved = new Set();
  segments.forEach((segment, index) => {
    if (!/(?:待定|待确认|待讨论|尚未确认|尚未确定|可能)/.test(segment.quote)) return;
    unresolved.add(index);
    // A standalone parenthetical such as “（待定）” qualifies the immediately
    // preceding semicolon-delimited clause on the same source line.
    const previous = segments[index - 1];
    if (previous && previous.lineStart === segment.lineStart && /[；;]\s*$/.test(previous.quote)) {
      unresolved.add(index - 1);
    }
  });
  return [...selected.keys()]
    .filter((index) => !unresolved.has(index))
    .sort((left, right) => left - right)
    .map((index) => segments[index]);
}

function classifyRuleType(statement) {
  if (/(?:頻率|频率|每.{0,12}(?:最多|至多|不得超过|不超过)|\d+\s*(?:秒|分钟|分|小时|天)内.{0,12}(?:最多|至多|不超过)|只发送一次|仅发送一次|rate\s*limit)/i.test(statement)) return 'frequency';
  if (/(?:无权|仅.{0,12}(?:访问|操作)|只有.{0,20}(?:可以|才能|方可).{0,12}(?:访问|操作)|只有.{0,12}(?:角色|用户).{0,8}(?:可以|才能)|permission|authorized|role-based)/i.test(statement)) return 'permission';
  if (/(?:从.{0,20}(?:变为|转换为|进入)|(?:变为|转换为|进入).{0,12}(?:状态|成功|失败)|state\s+transition)/i.test(statement)) return 'transition';
  if (/(?:范围|区间|介于|between\s+.+\s+and\s+.+|\d+(?:\.\d+)?\s*(?:至|到|~|～|—|-)\s*\d+(?:\.\d+)?)/i.test(statement)) return 'range';
  if (/(?:大于等于|不少于|不低于|至少|最小值|最低|不得少于|>=|≥|minimum|at\s+least|no\s+less\s+than)/i.test(statement)) return 'min';
  if (/(?:小于等于|不大于|最多|至多|不超过|不得超过|不高于|最大值|最高|<=|≤|maximum|at\s+most|no\s+more\s+than)/i.test(statement)) return 'max';
  if (/(?:大于(?!等于)|(?<!<)>(?!=)|超过|多于)/i.test(statement)) return 'min';
  if (/(?:小于(?!等于)|(?<!>)<(?!=)|少于)/i.test(statement)) return 'max';
  if (/(?:达到|完成|累计)\s*(?:不少于|至少)?\s*\d+(?:\.\d+)?\s*(?:个|条|人|位|次|天|篇|字符|字节)/.test(statement)) return 'min';
  if (/(?:必填|不能为空|必须填写|不得为空|必须存在|required|mandatory)/i.test(statement)) return 'required';
  if (/(?:禁止|不允许|不得|不能|不可|forbidden|prohibited|must\s+not)/i.test(statement)) return 'forbidden';
  if (/(?:枚举|仅支持|只能选择|只能为|可选值|以下.{0,6}之一|one\s+of|enum)/i.test(statement)) return 'enum';
  if (/(?:等于|固定为|必须为|应为|equals?\s+)/i.test(statement)) return 'equality';
  return 'general';
}

function independentlyClassifiable(statement) {
  return classifyRuleType(statement) !== 'general';
}

function splitClauses(segment) {
  // Keep a guarded outcome, scheduled action, or state-lifecycle statement
  // intact so splitting does not discard the condition that determines it.
  const hasGuard = /(?:若|如果|当|只要|除非).{1,64}(?:则|就|才|時|时|，|,)/.test(segment.quote)
    && /(?:不再|停止|保持|回退|执行|触发|发送|生成|更新|展示|显示|隐藏|通过|失败|生效)/.test(segment.quote);
  const hasSchedule = /(?:第\s*\d+\s*(?:天|周|月)|\d+\s*(?:天|小时|分钟)后).{0,32}(?:(?:上午|下午|早上|晚上)?\s*\d{1,2}(?:[:：]\d{2}|点))/.test(segment.quote)
    && /(?:执行|触发|发送|通知|提醒|更新|生成)/.test(segment.quote);
  const hasStateLifecycle = /(?:取消|撤销|删除|移除).{0,36}(?:状态|进度|回退|保持|不变)/.test(segment.quote)
    && /(?:状态|进度)/.test(segment.quote);
  if (hasGuard || hasSchedule || hasStateLifecycle) {
    return [{ statement: segment.quote, start: segment.start, listItem: segment.listItem }];
  }
  const clauses = [];
  let cursor = 0;
  for (const match of segment.quote.matchAll(/[，,；;]|并且|同时|且|另外/g)) {
    clauses.push({ text: segment.quote.slice(cursor, match.index), offset: cursor });
    cursor = match.index + match[0].length;
  }
  clauses.push({ text: segment.quote.slice(cursor), offset: cursor });

  const normalized = clauses.map(({ text: clause, offset }) => {
    const leading = clause.match(/^\s*/)?.[0].length || 0;
    let statement = clause.slice(leading);
    const conjunction = statement.match(/^(?:并且|同时|且|另外)\s*/);
    const conjunctionLength = conjunction?.[0].length || 0;
    statement = statement.slice(conjunctionLength);
    const statementLeading = statement.length - statement.trimStart().length;
    statement = statement.trim();
    return {
      statement,
      start: segment.start + offset + leading + conjunctionLength + statementLeading,
      listItem: segment.listItem
    };
  }).filter((clause) => clause.statement);

  if (normalized.length < 2) return [{ statement: segment.quote, start: segment.start, listItem: segment.listItem }];
  const meaningful = (statement) => independentlyClassifiable(statement)
    || /(?:用户|系统|管理员|客户|服务|页面|用户界面|接口)?\s*(?:可以|可|能够|支持|提供|展示|查询|创建|新增|修改|删除|提交|登录|退出|查看|选择|上传|下载|发送|接收|保存|允许|返回|进入|完成|取消|判定|计算|更新|刷新|读取|触发|回退)/.test(statement);
  if (normalized.filter((clause) => meaningful(clause.statement)).length < 2) {
    return [{ statement: segment.quote, start: segment.start, listItem: segment.listItem }];
  }
  return normalized;
}

function sectionAt(source, offset) {
  const before = source.slice(0, offset);
  const headings = [...before.matchAll(/^\s*#{1,6}\s+(.+)\s*$/gm)];
  return headings.at(-1)?.[1]?.trim() || '';
}

function inferField(statement, ruleType) {
  const markers = {
    required: /(?:必填|不能为空|必须填写|不得为空|必须存在|required|mandatory)/i,
    forbidden: /(?:禁止|不允许|不得|不能|不可|forbidden|prohibited|must\s+not)/i,
    min: /(?:大于等于|大于(?!等于)|不少于|不低于|至少|最小值|最低|不得少于|超过|多于|>=|(?<!<)>(?!=)|≥|minimum|at\s+least|no\s+less\s+than)/i,
    max: /(?:小于等于|小于(?!等于)|不大于|最多|至多|不超过|不得超过|不高于|最大值|最高|少于|<=|(?<!>)<(?!=)|≤|maximum|at\s+most|no\s+more\s+than)/i,
    frequency: /(?:频率|每.{0,12}(?:最多|至多|不得超过|不超过)|\d+\s*(?:秒|分钟|分|小时|天)内)/i,
    equality: /(?:必须为|应为|固定为|等于|equals?\s+)/i
  };
  let prefix = '';
  if (markers[ruleType]) prefix = statement.split(markers[ruleType])[0];
  if (!prefix) {
    const metric = statement.match(/^(.{0,30}?)(长度|范围|区间|金额|数量|次数|频率)/);
    if (metric) prefix = metric[1] || metric[2];
  }
  if (!prefix) {
    const beforeValue = statement.match(/^(.{1,24}?)(?:在|为|从|不得|不能|只能)/);
    if (beforeValue) prefix = beforeValue[1];
  }
  const field = prefix.replace(/^[\s\d.、#*\-]+|[\s:：的]+$/g, '').trim();
  return field || '业务规则';
}

function valuesFromStatement(statement, ruleType) {
  const numbers = [...statement.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const numericUnits = [...statement.matchAll(/\d+(?:\.\d+)?\s*(毫秒|秒|分钟|分|小时|天|元|个|人|位|次|条|字符|字节|%|％)/g)];
  const units = statement.match(/(?:毫秒|秒|分钟|分|小时|天|元|个|人|位|次|条|字符|字节|%|％)/);
  let unit = numericUnits.at(-1)?.[1] || units?.[0] || '';
  if (ruleType === 'range' && numbers.length >= 2) return { minimum: numbers[0], maximum: numbers[1], unit };
  if (ruleType === 'frequency' && /(?:(?:只|仅).{0,8}一次|(?:once\s+only))/i.test(statement)) {
    return { value: 1, unit: '次' };
  }
  if (ruleType === 'frequency' && numbers.length >= 2) return { value: numbers.at(-1), maximum: numbers[0], unit: statement.match(/(?:毫秒|秒|分钟|分|小时|天)/)?.[0] || '' };
  if (ruleType === 'frequency' && numbers.length === 1) return { value: numbers[0], unit: statement.match(/(?:次|条|个)/)?.[0] || '' };
  if (ruleType === 'min' && numbers.length) return { value: numbers[0], minimum: numbers[0], unit };
  if (ruleType === 'max' && numbers.length) return { value: numbers[0], maximum: numbers[0], unit };
  if (ruleType === 'enum') {
    const values = [...statement.matchAll(/[“「『"]([^”」』"]+)[”」』"]/g)].map((match) => match[1]);
    if (values.length) return { values, unit };
    const marker = statement.match(/(?:仅支持|只能选择|只能为|可选值(?:为|包括)?|枚举(?:值)?(?:为|包括)?|以下(?:取值)?(?:状态)?(?:之一|中)?[:：]?)/);
    if (marker) {
      const list = statement.slice(marker.index + marker[0].length).replace(/[。；;！？!?]+$/g, '');
      const inferred = list.split(/[、，,|或和]/).map((value) => value.trim()).filter(Boolean);
      if (inferred.length) return { values: inferred, unit };
    }
  }
  return { unit };
}

function transitionValues(statement) {
  const match = statement.match(/从[“「『]?(.+?)[”」』]?(?:状态)?(?:变为|转换为|进入)[“「『]?(.+?)[”」』]?(?:状态|$|[，,。；;])/);
  return match ? { from: match[1].trim(), to: match[2].trim() } : {};
}

function permissionRoles(statement) {
  const match = statement.match(/(?:只有|仅限|仅允许|仅)(.{1,40}?)(?:可以|才能|方可|访问|操作)/);
  if (!match) return [];
  return match[1].split(/[、，,和及]/).map((role) => role.trim()).filter(Boolean);
}

function canonicalFacts(source, selected) {
  const facts = [];
  for (const segment of selected) {
    let inheritedRuleField = '业务规则';
    for (const atom of splitClauses(segment)) {
      const ruleType = classifyRuleType(atom.statement);
      const kind = ruleType !== 'general' ? 'rule' : atom.listItem ? 'workflow_step' : 'feature';
      const parsedValues = valuesFromStatement(atom.statement, ruleType);
      const detectedField = kind === 'rule' ? inferField(atom.statement, ruleType) : '';
      if (detectedField && detectedField !== '业务规则') inheritedRuleField = detectedField;
      const fact = {
        kind,
        rule_type: ruleType,
        field: kind === 'rule' ? (detectedField === '业务规则' ? inheritedRuleField : detectedField) : '业务行为',
        statement: atom.statement,
        value: null,
        minimum: null,
        maximum: null,
        values: [],
        unit: '',
        from: null,
        to: null,
        roles: [],
        ...parsedValues,
        ...(ruleType === 'transition' ? transitionValues(atom.statement) : {}),
        ...(ruleType === 'permission' ? { roles: permissionRoles(atom.statement) } : {}),
        trace: {
          documentId: null,
          section: sectionAt(source, atom.start),
          quote: atom.statement,
          startOffset: atom.start,
          endOffset: atom.start + atom.statement.length
        }
      };
      facts.push(fact);
    }
  }

  const deduplicated = new Map();
  for (const fact of facts) {
    const key = JSON.stringify([
      fact.kind, fact.rule_type, fact.field,
      fact.statement.toLowerCase().replace(/[\s。；;！？!?，,]+/g, ''),
      fact.value, fact.minimum, fact.maximum, fact.values
    ]);
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, { ...fact, traces: [fact.trace] });
    } else if (!existing.traces.some((trace) => trace.startOffset === fact.trace.startOffset)) {
      existing.traces.push(fact.trace);
    }
  }

  return [...deduplicated.values()]
    .sort((left, right) => left.trace.startOffset - right.trace.startOffset || (left.rule_type < right.rule_type ? -1 : left.rule_type > right.rule_type ? 1 : 0))
    .map((fact, index) => ({
      id: `fact-${String(index + 1).padStart(3, '0')}`,
      ...fact,
      traces: fact.traces.map((trace) => ({ ...trace }))
    }));
}

export function normalizeRequirement(rawValue, source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('需求原文不能为空');
  const raw = parseJson(rawValue);
  const candidates = collectCandidates(raw);
  const segments = sourceSegments(source);
  const selected = referencedSegments(candidates, source, segments);
  const facts = canonicalFacts(source, selected);

  if (!facts.length) {
    throw new Error('模型未能提取到可追溯的需求事实，请补充文档内容后重试');
  }

  const heading = source.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  const normalized = {
    schemaVersion: STRUCTURED_REQUIREMENT_SCHEMA_VERSION,
    title: heading || '需求文档',
    facts
  };
  assertStructuredRequirement(normalized);
  return normalized;
}
