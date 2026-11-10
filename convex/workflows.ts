import { WorkflowManager } from '@convex-dev/workflow'

import { components } from './_generated/api'

// Keep workflow orchestration deterministic. Run Effect programs inside the
// queries, mutations, and actions invoked by the workflow's durable steps.
export const workflow = new WorkflowManager(components.workflow)
