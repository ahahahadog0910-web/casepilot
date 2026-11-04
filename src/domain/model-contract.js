/**
 * CasePilot 的最小领域数据结构。
 * 目前使用 JSDoc 作为无构建 MVP 的类型约定，后续迁移到 TypeScript 时可直接转换。
 */

/**
 * @typedef {Object} RequirementDocument
 * @property {string} id
 * @property {string} name
 * @property {string} content
 * @property {'txt'|'md'|'docx'|'pdf'|'design'} sourceType
 * @property {string=} version
 */

/**
 * @typedef {Object} RequirementTrace
 * @property {string=} documentId
 * @property {string=} section
 * @property {string=} quote
 * @property {number=} startOffset
 * @property {number=} endOffset
 */

/**
 * @typedef {Object} TestPoint
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {'functional'|'boundary'|'security'|'usability'|'performance'|'risk'} type
 * @property {'low'|'medium'|'high'|undefined} priority
 * @property {RequirementTrace=} trace
 */

/**
 * @typedef {Object} TestCase
 * @property {string} id
 * @property {string} title
 * @property {string} type
 * @property {'low'|'medium'|'high'} priority
 * @property {string=} preconditions
 * @property {string[]} steps
 * @property {string[]} expectedResults
 * @property {'draft'|'review'|'approved'|'deprecated'} status
 * @property {string=} testPointId
 * @property {RequirementTrace=} trace
 */

/**
 * @typedef {Object} TestPlan
 * @property {string} id
 * @property {string} title
 * @property {string} modelId
 * @property {string=} promptVersion
 * @property {TestPoint[]} testPoints
 * @property {TestCase[]} testCases
 * @property {Object[]} insights
 * @property {number=} coverage
 * @property {string} createdAt
 */

/**
 * @typedef {Object} GenerationOptions
 * @property {string[]} focusAreas
 * @property {'compact'|'standard'|'deep'} detailLevel
 * @property {'system'|'integration'|'api'|'ui'} testLevel
 * @property {string=} modelId
 */

export {};

