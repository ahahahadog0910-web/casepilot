/**
 * 统一模型适配器的接口约定。
 * 这是文档化的 JavaScript 合约，便于当前无构建前端和后续服务端共用同一套概念。
 */

/**
 * @typedef {import('./model-contract.js').RequirementDocument} RequirementDocument
 * @typedef {import('./model-contract.js').GenerationOptions} GenerationOptions
 * @typedef {import('./model-contract.js').TestPlan} TestPlan
 */

/**
 * @typedef {Object} ModelAdapter
 * @property {string} id
 * @property {string} name
 * @property {{parseRequirement: boolean, generateTestPlan: boolean, stream: boolean}} capabilities
 * @property {(document: RequirementDocument, options?: Object) => Promise<Object>} parseRequirement
 * @property {(analysis: Object, options?: GenerationOptions) => Promise<TestPlan>} generateTestPlan
 */

export {};

