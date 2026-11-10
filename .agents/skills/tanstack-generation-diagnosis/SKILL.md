---
name: tanstack-generation-diagnosis
description: Diagnose a reproduced TanStack route-tree, Convex codegen, or Better Auth generated-schema failure; do not load for ordinary feature work or before a generator failure exists.
---

# Generated output diagnosis

Use only after a generator fails reproducibly or generated output is inconsistent with its source. Generated files are outputs, not repair locations.

1. Record the exact generator command, package versions, input files and error. Preserve existing generated and user files.
2. Classify the output owner: TanStack route tree, Convex API/schema output, or Better Auth schema. Read that generator's installed version-matched documentation and source contract.
3. Reproduce using the narrowest local command that does not affect a remote deployment. If Convex component discovery needs a target context, resolve the exact authorized development target first. Do not use a production deployment to make generation pass.
4. Compare source configuration and generated output. Fix the source configuration, generator inputs, version incompatibility, or check prerequisite order. Never hand-edit generated output, call a private generator API, or weaken a type/lint rule.
5. Run only the affected generator/check sequence and adjacent focused test. If regeneration pushes or changes a remote deployment, stop: that is a separate transition requiring exact target and task authorization.
6. Record the root cause, native fix, generator version, commands and evidence. Add a lasting rule only when it prevents the demonstrated failure from recurring; do not broaden this into a general codegen ritual.
