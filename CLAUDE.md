## Tooling
- Always use the secure and latest version
- For services, always use Fastify with TypeScript
- If implementing/maintaining microservices, keep low coupling, high cohesion
- If there is a plan, remember about update after implementation

## Code Style & Simplicity
- Don't use abbreviation for naming parameters, values, functions, etc. Ever!
- Write simple, readable code. Avoid overengineering and excessive abstraction.
- Do not separate each small piece of logic into separate functions. Keep related logic together.
- Methods should be readable but not over-granular. A method can be 30–50 lines if the logic flows clearly.
- Keep services, classes not longer than 500 lines.
- Before you will add new property/field to some business model, check if it more valuable to remodel current one, to don't overgrow current one.
- Always try to find common patterns for same business domain or logic and extract it to underlying classes or services.
- Never use `as any` type assertions. Use proper types or `as never` if absolutely necessary.
- Inline simple logic and conditions. Don't create separate methods for trivial checks.
- Use early returns to avoid deep nesting.
- Never use Polish wording in code, always use English, Polish, and others only as translations.
- Remember about SOLID, KISS, DRY and YAGNI.
- Never use abbreviation for naming things.
- Never create helpers, utils, always try to found a proper business naming for functions, classes, variables.
- Always looks for documentation starting from README.md, docs and spec folders.
- After implementation always update README.md and docs/spec dedicated files. If there are no dedicated files create them.
- Always use mermaid for diagrams documentations.

## Database & Queries
- Minimize database round trips by fetching all necessary data in one query when possible.

## Error Handling
- Prefer `.catch()` pattern over try/catch blocks when handling async operations.
- Use try/catch only when you need to handle errors complexly or have cleanup logic.
- Don't transform error messages unnecessarily. Use `error.message` directly.
- Log only essential errors. Avoid verbose debug logging in production code.

## Testing
- Test only public methods; do not test private methods directly or separately.
- Group tests by method using `describe('<methodName>()')`.
- Keep test suites focused on important scenarios (core happy path and key failure/validation paths).
- Avoid adding many low-value or repetitive test cases.
- Use `builder-pattern` for test data and mocks.
- Create mocks inside each test case (or the nearest local scope), not as large global mock sets.
- In each mock, include only fields needed for that test case.
- Use `as unknown as Type` for complex type assertions in tests, never `as any`.
- Use `as never` when mocking functions that return complex types.
- Prefer full payload assertions (`toEqual`, full `toHaveBeenCalledWith`) over broad partial matching when possible.
- Validate behavior via public method calls, including retry/error behavior, instead of asserting private internals.
- Keep tests simple, readable, and aligned with current service signatures and contracts.
- This repository uses a `pnpm` workspace monorepo. Run tests using `pnpm --filter <package-name> test -- <path-to-test-file>`

## Logging
- Log only at the start / end of main operations and actual errors.
- Don't log every single step or condition check.
- Error logs should include context (IDs, operation names) and the error message.
- Avoid excessive debug/verbose logging that clutters production logs.
