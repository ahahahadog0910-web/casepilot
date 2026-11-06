/**
 * 统一需求解析模型适配器的接口约定。
 * 模型适配器只负责把文档解析为标准化需求；TestPlan 由规则引擎单独生成。
 */

/**
 * @typedef {import('./model-contract.js').RequirementDocument} RequirementDocument
 * @typedef {import('./model-contract.js').StructuredRequirement} StructuredRequirement
 */

/**
 * @typedef {Object} ModelAdapter
 * @property {string} id
 * @property {string} name
 * @property {{parseRequirement: true}} capabilities
 * @property {(document: RequirementDocument) => Promise<StructuredRequirement>} parseRequirement
 */

export {};

