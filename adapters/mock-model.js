/**
 * 本地 mock 适配器：用于 UI 和服务端 API 联调，不连接任何外部模型。
 */
export const mockModelAdapter = {
  id: 'mock',
  name: '本地模拟模型',
  capabilities: {
    parseRequirement: true,
    generateTestPlan: true,
    stream: false
  },

  async parseRequirement(document) {
    const content = String(document?.content ?? '').trim();
    if (!content) throw new Error('需求文档内容不能为空');
    return {
      documentId: document.id ?? 'local-requirement',
      title: document.name ?? '未命名需求',
      content,
      sections: content.split(/\n(?=#{1,3} )/g).map((text) => text.trim()).filter(Boolean)
    };
  },

  async generateTestPlan(analysis, options = {}) {
    const title = analysis.title || '需求文档';
    return {
      id: `plan-${Date.now()}`,
      title: `${title} · 测试方案`,
      modelId: this.id,
      promptVersion: 'mock-v1',
      testPoints: [],
      testCases: [],
      insights: [],
      coverage: 0,
      options,
      createdAt: new Date().toISOString()
    };
  }
};

