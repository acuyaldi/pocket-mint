# Graph Report - pocket-mint-backend  (2026-08-01)

## Corpus Check
- 445 files · ~513,800 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 10661 nodes · 18813 edges · 338 communities (219 shown, 119 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 562 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41406565`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.d.ts
- library.d.ts
- runtime/client.d.ts
- react-native.js
- runtime/client.js
- wasm-compiler-edge.js
- runtime/edge.js
- errorHandler
- library.js
- Decimal
- wasm-engine-edge.js
- inbound.worker.ts
- getAuthenticatedUserId
- edge-esm.js
- assistant/index.ts
- entity-resolution/index.ts
- config/index.ts
- application.service.ts
- analytics.controller.ts
- transaction.controller.ts
- account.controller.ts
- telegram-channel.integration.test.ts
- provider-types.ts
- categorization/index.ts
- r
- slice
- addErrorMessage
- budget-query.service.ts
- interpretNode
- t
- reportingTime.ts
- prisma/client.js
- addErrorMessage
- context.assembler.ts
- addErrorMessage
- addErrorMessage
- installment-payment.service.ts
- addErrorMessage
- transaction
- r
- addErrorMessage
- addErrorMessage
- routes/index.ts
- query_compiler_fast_bg.js
- a
- transactionBalance.ts
- .slice
- slice
- recurringTransaction.controller.ts
- a
- ro
- jo
- transaction
- savingGoal.controller.ts
- r
- Sa
- slice
- clarification.service.ts
- r
- co
- PrismaClient
- toString
- T
- wo
- .includes
- Ca
- ys
- a
- interpretNode
- xn
- fs
- write
- query_engine_bg.js
- applyEnv
- toString
- r
- write
- logger.ts
- constructor
- toString
- toString
- .slice
- notification.service.ts
- What You Must Do When Invoked
- c
- Fe
- dependencies
- Assistant observability runbook
- financial-draft.service.ts
- constructor
- compilerOptions
- prismaAdapter.integration.test.ts
- requestInternal
- devDependencies
- recurringReminderEngine.service.ts
- ja
- $transaction
- ai
- Ut
- Prisma__UserClient
- AssistantConversationDelegate
- AssistantFinancialDraftDelegate
- AssistantIdempotencyRecordDelegate
- AssistantMessageDelegate
- AssistantProviderExecutionDelegate
- AssistantToolExecutionDelegate
- AssistantTurnDelegate
- BudgetDelegate
- CategoryDelegate
- ChannelAssistantOperationDelegate
- ChannelCallbackTokenDelegate
- ChannelConnectionDelegate
- ChannelInboundJobDelegate
- ChannelLinkTokenDelegate
- ChannelOutboundDeliveryDelegate
- ClarificationOptionDelegate
- ClarificationRequestDelegate
- InstallmentDelegate
- MerchantMappingDelegate
- RecurringReminderEventDelegate
- RecurringTransactionTemplateDelegate
- SavingGoalDelegate
- TransactionDelegate
- UserDelegate
- WalletDelegate
- ze
- constructor
- Git Workflow — Pocket Mint Backend
- Prisma migration baseline reconstruction & reconciliation
- write
- T
- write
- write
- SqlDriverAdapter
- .includes
- Backend deployment runbook — JWT-only auth (Sprint 3I)
- PrismaPromise
- write
- ln
- write
- Vo
- St
- Assistant Core — Pocket Mint Backend
- requestInternal
- digest
- ei
- Financial Logic — Pocket Mint Backend
- Wallet Command & Query Service Architecture (Sprints 3C–3D)
- cc
- Deployment & Operations
- HTTP & Application Boundary Architecture (Sprint 3F)
- k
- Wn
- UI System — Pocket Mint
- Prisma__AssistantConversationClient
- Prisma__TransactionClient
- g
- get
- Span
- Span
- go
- Dashboard Query Service Architecture (Sprint 3E)
- Installment Query Service Architecture (Sprint 3G)
- Database Integration Testing (PM-STAB-010A)
- Sprint 2C Reporting and Timezone Correctness Design
- scripts
- exports
- MergedExtensionsList
- Fr
- MergedExtensionsList
- Et
- Authentication & Security — JWT-Only
- prisma/package.json
- index.js
- Prisma__AssistantFinancialDraftClient
- Prisma__AssistantTurnClient
- Prisma__ClarificationRequestClient
- import
- require
- Engine
- design.md
- Agent Rules — Pocket Mint Backend
- Backend API — HTTP Boundary & Service Layer
- graphify reference: extra exports and benchmark
- Prisma & Database — Prisma 7 Adapter Architecture
- Frontend migration to JWT-only authentication (Sprint 3I)
- run-integration-tests.mjs
- Pocket Mint — Backend
- Prisma__CategoryClient
- Prisma__WalletClient
- a
- RequestHandler
- dp
- NullTypesEnumValue
- RequestHandler
- from
- Database backup & restore runbook (PM-STAB-010C)
- Global Constraints
- renderer.ts
- Prisma__ChannelConnectionClient
- Prisma__InstallmentClient
- Prisma__RecurringTransactionTemplateClient
- ./runtime/client
- #wasm-compiler-loader
- Engine
- vo
- index-browser.d.ts
- telegramAdapterBoundary.test.ts
- Pocket Mint — Session Task Prompt
- 3. Transaction Effects
- 4. Credit / PayLater Expense (Installment Creation)
- Transaction Service Architecture (Sprints 3A + 3B)
- 5. Pending Prisma migrations
- Prisma runtime connection & pooling (pg driver adapter)
- Global Constraints
- package.json
- 20260710000000_baseline/migration.sql
- Prisma__AssistantIdempotencyRecordClient
- Prisma__AssistantProviderExecutionClient
- Prisma__AssistantToolExecutionClient
- Prisma__RecurringReminderEventClient
- PrismaClientKnownRequestError
- graphify reference: query, path, explain
- Layers
- db-backup.mjs
- db-restore.mjs
- prisma/edge.js
- Prisma__AssistantMessageClient
- Prisma__BudgetClient
- Prisma__ChannelCallbackTokenClient
- Prisma__ChannelInboundJobClient
- Prisma__MerchantMappingClient
- PrismaPromise_2
- TracingHelper
- PrismaPromise_2
- Sql
- TracingHelper
- ou
- wasm.js
- copy-prisma-client.cjs
- 20260722201000_add_assistant_conversation_persistence/migration.sql
- 20260726185156_add_durable_channel_processing/migration.sql
- 20260727000000_add_telegram_interactive_callbacks/migration.sql
- Prisma__ChannelLinkTokenClient
- Prisma__ClarificationOptionClient
- ./edge
- ./extension
- ./index
- ./runtime/index-browser
- ./runtime/wasm-compiler-edge
- l
- E
- TraceState
- TraceState
- 10. Analytics Rules
- 1. Wallet Classification
- 2. Net Worth (PD-001 — Approved)
- 5. Installment Payment (Debt Settlement)
- 9. Reporting Cutoff and Timezone
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- 20260726152156_add_channel_foundation/migration.sql
- ./generator-build
- Context
- DataLoader
- TypedSql
- Context
- DataLoader
- MetricsClient
- TypedSql
- express.d.ts
- prismaBillingMigration.test.ts
- prismaFactory.test.ts
- Pocket Mint Backend — Agent Instructions
- 11. Installment Lifecycle (Current Implementation)
- 12. Admin Fee and Interest
- 13. Money Precision and Rounding
- 8. Transaction Update and Delete
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- 20260717000000_generalize_wallets_and_bills/migration.sql
- 20260722233000_add_assistant_financial_drafts/migration.sql
- "clarification_requests"
- db-verify.mjs
- Skip
- PrismaClientInitializationError
- PrismaClientRustPanicError
- PrismaClientValidationError
- Skip
- CLAUDE.md
- frontend/README.md
- .claude/CLAUDE.md
- extraction-spec.md
- 20260711172700_remove_local_user_password/migration.sql
- 20260711223000_add_transaction_to_wallet/migration.sql
- 20260718000000_drop_unused_transfer_model/migration.sql
- 20260719001706_add_recurring_transaction_templates/migration.sql
- 20260719101529_add_recurring_amount_mode/migration.sql
- 20260719120000_add_recurring_reminder_settings/migration.sql
- 20260719130000_add_recurring_reminder_events/migration.sql
- 20260719150918_add_recurring_reminder_read_state/migration.sql
- 20260719160000_add_recurring_reminder_completion/migration.sql
- 20260719173135_add_installment_reminder_events/migration.sql
- 20260719181136_add_saving_goals/migration.sql
- 20260721012908_add_budget/migration.sql
- 20260721231432_add_merchant_mapping/migration.sql
- 20260723123000_add_assistant_provider_executions/migration.sql
- 20260725000000_add_clarification_expiry/migration.sql
- AnyNull
- DbNull
- JsonNull
- AccelerateEngineConfig
- CallSite
- DecimalJsLike
- ExtendedSpanOptions
- JsonConvertible
- CallSite
- getResources
- DecimalJsLike
- ErrorCapturingInterface
- ErrorRegistry
- JsonConvertible
- strip-prisma-whitespace.cjs

## God Nodes (most connected - your core abstractions)
1. `Decimal` - 117 edges
2. `getAuthenticatedUserId()` - 67 edges
3. `sendError()` - 67 edges
4. `forwardError()` - 66 edges
5. `sendSuccess()` - 60 edges
6. `AssistantError` - 58 edges
7. `a()` - 57 edges
8. `a()` - 57 edges
9. `a()` - 55 edges
10. `r()` - 51 edges

## Surprising Connections (you probably didn't know these)
- `buildApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  test/budgetController.test.ts → src/middlewares/error.middleware.ts
- `buildApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  test/httpBoundaryGuards.test.ts → src/middlewares/error.middleware.ts
- `buildApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  test/merchantMapping/merchantMappingController.test.ts → src/middlewares/error.middleware.ts
- `buildApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  test/transactionControllerBoundary.test.ts → src/middlewares/error.middleware.ts
- `buildApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  test/transactionQueryControllerBoundary.test.ts → src/middlewares/error.middleware.ts

## Import Cycles
- None detected.

## Communities (338 total, 119 thin omitted)

### Community 0 - "index.d.ts"
Cohesion: 0.00
Nodes (3254): AdminFeeType, AggregateAssistantConversation, AggregateAssistantFinancialDraft, AggregateAssistantIdempotencyRecord, AggregateAssistantMessage, AggregateAssistantProviderExecution, AggregateAssistantToolExecution, AggregateAssistantTurn (+3246 more)

### Community 1 - "library.d.ts"
Cohesion: 0.01
Nodes (343): AccelerateEngineConfig, AccelerateExtensionFetch, AccelerateExtensionFetchDecorator, AccelerateUtils, Action, ActiveConnectorType, Aggregate, AllModelsToStringIndex (+335 more)

### Community 2 - "runtime/client.d.ts"
Cohesion: 0.01
Nodes (309): AccelerateExtensionFetch, AccelerateExtensionFetchDecorator, Action, ActiveConnectorType, Aggregate, AllModelsToStringIndex, ApplyOmit, Args (+301 more)

### Community 3 - "react-native.js"
Cohesion: 0.02
Nodes (60): An(), applyPendingMigrations(), be(), buildQueryError(), connect(), constructor(), consumeError(), cp() (+52 more)

### Community 4 - "runtime/client.js"
Cohesion: 0.02
Nodes (83): Ad(), addItem(), ai(), Am(), an(), ar(), bc(), bn() (+75 more)

### Community 5 - "wasm-compiler-edge.js"
Cohesion: 0.02
Nodes (59): Jm(), ap(), Bn(), bs(), Cl(), clone(), _cloneInto(), cp() (+51 more)

### Community 6 - "runtime/edge.js"
Cohesion: 0.02
Nodes (62): al(), ao(), bn(), bs(), bu(), Ci(), constructor(), dispatchBatches() (+54 more)

### Community 7 - "errorHandler"
Cohesion: 0.05
Nodes (81): createAssistantApplicationService(), createClarificationService(), createAssistantConversationService(), categoryConstraintsForType(), createCategoryResolver(), createMerchantResolver(), MERCHANT_TRANSACTION_CREATE_CONSTRAINTS, EntityResolverRegistry (+73 more)

### Community 8 - "library.js"
Cohesion: 0.03
Nodes (64): an(), Bc(), bi(), Bm(), cl(), Cm(), dispatchEngineSpans(), dm() (+56 more)

### Community 10 - "wasm-engine-edge.js"
Cohesion: 0.03
Nodes (55): Ai(), as(), Bo(), cn(), constructor(), ct(), da(), dispatchEngineSpans() (+47 more)

### Community 11 - "inbound.worker.ts"
Cohesion: 0.04
Nodes (77): AssistantProviderRuntime, ChannelCallbackInteractionType, claimCallbackToken(), createCallbackToken(), CreateCallbackTokenInput, digestCallbackToken(), expireCallbackToken(), findCallbackTokenByRaw() (+69 more)

### Community 12 - "getAuthenticatedUserId"
Cohesion: 0.06
Nodes (55): AnalyticsController, mapPeriodQuery(), BudgetController, respondWithUsage(), toBudgetDto(), getSuggestions(), VALID_TYPES, getCategories() (+47 more)

### Community 13 - "edge-esm.js"
Cohesion: 0.03
Nodes (45): Bl(), bo(), dispatchEngineSpans(), du(), fn(), fp(), fs(), Ge() (+37 more)

### Community 14 - "assistant/index.ts"
Cohesion: 0.04
Nodes (35): terminalizeOrReportActual(), terminalStatusError(), AssistantError, executeTool(), HandlerRegistry, logExecution(), ToolHandler, withTimeout() (+27 more)

### Community 15 - "entity-resolution/index.ts"
Cohesion: 0.06
Nodes (64): boundedNonEmpty(), compareText(), createEntityCandidate(), CreateEntityCandidateInput, revalidateEntityCandidate(), safeDisplay(), aliasesFromCategoryName(), CATEGORY_TRANSACTION_CREATE_CONSTRAINTS (+56 more)

### Community 16 - "config/index.ts"
Cohesion: 0.04
Nodes (53): app, channelConnectionService, channelLinkTokenService, workerOwnerId, LoopOptions, runWorkerLoop(), sleep(), AssistantProviderConfig (+45 more)

### Community 17 - "application.service.ts"
Cohesion: 0.05
Nodes (49): AssistantApplicationResult, AssistantApplicationService, TxClient, assistantApplicationService, assistantContextService, assistantConversationService, assistantFinancialDraftService, assistantProviderAuditService (+41 more)

### Community 18 - "analytics.controller.ts"
Cohesion: 0.06
Nodes (44): reportingConfig, num(), serializeBudgetPerformance(), serializeCategories(), serializeOverview(), serializePercentageChange(), serializeTrends(), serializeWallets() (+36 more)

### Community 19 - "transaction.controller.ts"
Cohesion: 0.05
Nodes (48): csvField(), csvSanitizeText(), EXPORT_PERIOD_MONTHS, exportFilename(), ExportPeriod, mapCreateTransactionRequest(), mapUpdateTransactionRequest(), serializeSummary() (+40 more)

### Community 20 - "account.controller.ts"
Cohesion: 0.06
Nodes (42): createWallet(), CreateWalletBody, CREDIT_TYPES, deleteWallet(), getAllWallets(), getWalletSparkline(), LIABILITY_TYPES, mapCreateWalletRequest() (+34 more)

### Community 21 - "telegram-channel.integration.test.ts"
Cohesion: 0.05
Nodes (34): ChannelConnectionService, ChannelConnectionSummary, createChannelConnectionService(), ChannelError, ChannelLinkTokenService, createChannelLinkTokenService(), ChannelProviderName, InboundChannelMessage (+26 more)

### Community 22 - "provider-types.ts"
Cohesion: 0.06
Nodes (44): AssistantContext, buildAssistantSystemInstruction(), replyLanguageDirective(), RULES, exactKeys(), FORBIDDEN_KEYS, inspect(), invalid() (+36 more)

### Community 23 - "categorization/index.ts"
Cohesion: 0.07
Nodes (40): computeConfidence(), groupByCategory(), KIND_CONFIDENCE, pickBest(), ScoredMatch, scoreMatches(), findMatches(), KeywordMatch (+32 more)

### Community 24 - "r"
Cohesion: 0.06
Nodes (63): _a(), as(), bc(), Bt(), cancelAllTransactions(), cm(), connect(), dispatchBatches() (+55 more)

### Community 25 - "slice"
Cohesion: 0.05
Nodes (57): et(), addItem(), alloc(), allocUnsafe(), allocUnsafeSlow(), am(), ao(), byteLength() (+49 more)

### Community 26 - "addErrorMessage"
Cohesion: 0.11
Nodes (55): addErrorMessage(), addField(), addItem(), addSuggestion(), al(), asObject(), bl(), cl() (+47 more)

### Community 27 - "budget-query.service.ts"
Cohesion: 0.06
Nodes (38): APPROACHING_THRESHOLD, BudgetStatus, BudgetUsage, computeBudgetUsage(), HUNDRED, BudgetError, budgetQueryService, createBudgetQueryService() (+30 more)

### Community 28 - "interpretNode"
Cohesion: 0.07
Nodes (53): #a(), apiKey(), Ba(), br(), cl(), commitTransaction(), Da(), deserialize() (+45 more)

### Community 29 - "t"
Cohesion: 0.05
Nodes (53): A(), au(), ca(), constructor(), cp(), e(), Ei(), get() (+45 more)

### Community 30 - "reportingTime.ts"
Cohesion: 0.10
Nodes (45): handleMonthlySpendingSummary(), MonthlyCategoryBreakdown, MonthlySpendingSummaryInput, num(), parseMonth(), ZERO, resolveExportRange(), ANALYTICS_PERIODS (+37 more)

### Community 31 - "prisma/client.js"
Cohesion: 0.07
Nodes (32): getAggregateCashFlowEffect(), getWalletReportingEffect(), persistedWalletAmount(), ReportingTransaction, FinancialTxType, createWalletQueryService(), walletQueryService, GetNetWorthInput (+24 more)

### Community 32 - "addErrorMessage"
Cohesion: 0.10
Nodes (48): addErrorMessage(), addSuggestion(), asObject(), bu(), Do(), fu(), getDeepField(), getDeepFieldValue() (+40 more)

### Community 33 - "context.assembler.ts"
Cohesion: 0.08
Nodes (35): assembleAssistantContext(), canonicalSafeValue(), compareNewest(), compareText(), DEFAULT_ASSISTANT_CONTEXT_LIMITS, draftContext(), HIDDEN_KEYS, isHiddenKey() (+27 more)

### Community 34 - "addErrorMessage"
Cohesion: 0.12
Nodes (47): addErrorMessage(), addField(), addSuggestion(), ap(), asObject(), at(), Do(), ec() (+39 more)

### Community 35 - "addErrorMessage"
Cohesion: 0.13
Nodes (47): ac(), addErrorMessage(), addField(), addSuggestion(), asObject(), bc(), cc(), dc() (+39 more)

### Community 36 - "installment-payment.service.ts"
Cohesion: 0.07
Nodes (32): computeFinalMonthlyAmount(), computeInstallmentPlan(), HUNDRED, InstallmentPlan, InstallmentPlanInput, toMoney(), InstallmentError, ALLOWED_SOURCE_TYPES (+24 more)

### Community 37 - "addErrorMessage"
Cohesion: 0.14
Nodes (46): ac(), addErrorMessage(), addField(), addSuggestion(), asObject(), Be(), cc(), co() (+38 more)

### Community 38 - "transaction"
Cohesion: 0.07
Nodes (46): Aa(), bf(), buildQueryError(), consumeError(), convertProtocolErrorsToClientError(), df(), dispatchBatches(), dr() (+38 more)

### Community 39 - "r"
Cohesion: 0.06
Nodes (44): ae(), ai(), Ba(), br(), co(), Do(), _e(), enabled() (+36 more)

### Community 40 - "addErrorMessage"
Cohesion: 0.13
Nodes (45): ad(), addErrorMessage(), addField(), addItem(), addSuggestion(), asObject(), bd(), cd() (+37 more)

### Community 41 - "addErrorMessage"
Cohesion: 0.14
Nodes (45): ac(), addErrorMessage(), addField(), addSuggestion(), asObject(), _c(), cc(), dc() (+37 more)

### Community 42 - "routes/index.ts"
Cohesion: 0.11
Nodes (26): bearerToken(), requireUser(), requireVerifiedJwt(), unauthorized(), verifyBearer(), VerifyResult, ipKey(), mutationLimiter (+18 more)

### Community 43 - "query_compiler_fast_bg.js"
Cohesion: 0.07
Nodes (15): F, g, ge(), I(), J(), k(), l(), le() (+7 more)

### Community 44 - "a"
Cohesion: 0.08
Nodes (16): a(), ar(), bi(), fromContent(), g(), gl(), hn(), Je() (+8 more)

### Community 45 - "transactionBalance.ts"
Cohesion: 0.09
Nodes (33): AuditOptions, AuditReport, AuditTransaction, auditWalletBalances(), AuditWalletSnapshot, classify(), Confidence, DriftClassification (+25 more)

### Community 46 - ".slice"
Cohesion: 0.07
Nodes (36): cn(), Da(), enabled(), Er(), eu(), Fa(), Fl(), gi() (+28 more)

### Community 47 - "slice"
Cohesion: 0.07
Nodes (40): Ye(), bn(), Ci(), ed(), fn(), fp(), Fs(), Gc() (+32 more)

### Community 48 - "recurringTransaction.controller.ts"
Cohesion: 0.09
Nodes (27): mapCreateRequest(), mapUpdateRequest(), CreateRecurringTransactionDto, RecurrenceFrequency, RecurringAmountMode, RecurringTransactionType, UpdateRecurringTransactionDto, RecurringTransactionError (+19 more)

### Community 49 - "a"
Cohesion: 0.08
Nodes (11): C(), a(), Ai(), Le(), re(), Ri(), $s(), Ti() (+3 more)

### Community 50 - "ro"
Cohesion: 0.09
Nodes (38): ae(), At(), de(), Et(), Fe(), findField(), getArgumentName(), getArgumentPath() (+30 more)

### Community 51 - "jo"
Cohesion: 0.09
Nodes (38): ac(), addItem(), au(), be(), bn(), cc(), ec(), findField() (+30 more)

### Community 52 - "transaction"
Cohesion: 0.09
Nodes (38): Be(), buildQueryError(), consumeError(), convertProtocolErrorsToClientError(), Cu(), deref(), dispatchBatches(), dt() (+30 more)

### Community 53 - "savingGoal.controller.ts"
Cohesion: 0.09
Nodes (24): mapCreateRequest(), mapProgressRequest(), mapUpdateRequest(), CreateSavingGoalDto, SavingGoalStatus, UpdateSavingGoalDto, UpdateSavingGoalProgressDto, SavingGoalError (+16 more)

### Community 54 - "r"
Cohesion: 0.08
Nodes (33): Ba(), cn(), cr(), Da(), de(), ea(), Ei(), es() (+25 more)

### Community 55 - "Sa"
Cohesion: 0.10
Nodes (37): ar(), Ea(), em(), eo(), Et(), findField(), ga(), getArgumentName() (+29 more)

### Community 56 - "slice"
Cohesion: 0.08
Nodes (36): v(), aa(), Ae(), byteLength(), concat(), enabled(), eo(), equals() (+28 more)

### Community 57 - "clarification.service.ts"
Cohesion: 0.09
Nodes (29): ClarificationRequestClient, digestToken(), generateToken(), KNOWN_ENTITY_TYPES, TokenPair, tokenToDigest(), TransactionClient, TransactionOption (+21 more)

### Community 58 - "r"
Cohesion: 0.08
Nodes (35): a(), R(), $l(), an(), au(), Bi(), e(), el() (+27 more)

### Community 59 - "co"
Cohesion: 0.09
Nodes (35): jl(), at(), br(), Ce(), co(), ds(), fs(), ft() (+27 more)

### Community 61 - "toString"
Cohesion: 0.07
Nodes (34): bl(), Bu(), $c(), Di(), el(), en(), enabled(), fm() (+26 more)

### Community 62 - "T"
Cohesion: 0.09
Nodes (34): Dd(), destroy(), digest(), digestInto(), e(), Ei(), finish(), Gs() (+26 more)

### Community 63 - "wo"
Cohesion: 0.12
Nodes (33): bc(), be(), bo(), dc(), Er(), fc(), findField(), gc() (+25 more)

### Community 64 - ".includes"
Cohesion: 0.08
Nodes (32): Aa(), ai(), ar(), Ca(), d(), Et(), g(), getURLAndAPIKey() (+24 more)

### Community 65 - "Ca"
Cohesion: 0.08
Nodes (30): Aa(), as(), Ca(), Ce(), ci(), Da(), di(), Ei() (+22 more)

### Community 66 - "ys"
Cohesion: 0.11
Nodes (34): bp(), concat(), da(), de(), dt(), ep(), findField(), Gc() (+26 more)

### Community 67 - "a"
Cohesion: 0.10
Nodes (7): a(), bi(), Ei(), Le(), re(), W(), xi()

### Community 68 - "interpretNode"
Cohesion: 0.08
Nodes (33): Sa(), aa(), Ae(), commitTransaction(), cr(), disconnect(), em(), getGlobalOmit() (+25 more)

### Community 69 - "xn"
Cohesion: 0.07
Nodes (32): ap(), bo(), cp(), ee(), es(), Fd(), getAllClientExtensions(), getAllComputedFields() (+24 more)

### Community 70 - "fs"
Cohesion: 0.07
Nodes (31): bp(), bs(), ds(), fs(), ge(), getAllClientExtensions(), getAllComputedFields(), getAllModelExtensions() (+23 more)

### Community 71 - "write"
Cohesion: 0.12
Nodes (32): addMarginSymbol(), afterNextNewline(), compare(), copy(), G(), getCurrentLineLength(), getPrintWidth(), hc() (+24 more)

### Community 72 - "query_engine_bg.js"
Cohesion: 0.07
Nodes (3): ce(), H(), m

### Community 73 - "applyEnv"
Cohesion: 0.12
Nodes (20): buildApp(), { findUnique }, UNIFORM, buildApp(), { findUnique }, buildApp(), applyEnv(), key (+12 more)

### Community 74 - "toString"
Cohesion: 0.09
Nodes (29): zl(), addItem(), bn(), De(), dr(), es(), getAllBatchQueryCallbacks(), getGlobalOmit() (+21 more)

### Community 75 - "r"
Cohesion: 0.09
Nodes (29): addField(), ap(), bc(), Bt(), _c(), dr(), fo(), getAllClientExtensions() (+21 more)

### Community 76 - "write"
Cohesion: 0.14
Nodes (29): addMarginSymbol(), afterNextNewline(), compare(), copy(), getCurrentLineLength(), getPrintWidth(), indent(), J() (+21 more)

### Community 77 - "logger.ts"
Cohesion: 0.12
Nodes (22): safeEqual(), telegramWebhook(), verifyTelegramWebhookSecret(), telegramWebhookLimiter, telegramRouter, TelegramCallOutcome, TelegramClientDeps, TelegramSendOutcome (+14 more)

### Community 78 - "constructor"
Cohesion: 0.08
Nodes (28): At(), constructor(), cs(), dc(), e(), Ee(), es(), fc() (+20 more)

### Community 79 - "toString"
Cohesion: 0.08
Nodes (28): Zc(), rp(), ap(), bl(), Bo(), el(), eu(), getAllQueryCallbacks() (+20 more)

### Community 80 - "toString"
Cohesion: 0.10
Nodes (25): At, $c(), d(), Ee(), g(), getAllClientExtensions(), getAllModelExtensions(), gl() (+17 more)

### Community 81 - ".slice"
Cohesion: 0.10
Nodes (24): br(), cu(), di(), enabled(), He(), j(), ja(), Jl() (+16 more)

### Community 82 - "notification.service.ts"
Cohesion: 0.12
Nodes (18): NotificationError, createNotificationService(), notificationService, ConfirmReminderInput, ConfirmReminderResult, DecimalInput, ListNotificationsInput, ListNotificationsResult (+10 more)

### Community 83 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 84 - "c"
Cohesion: 0.09
Nodes (20): {
  Decimal,
  DbNull,
  JsonNull,
  AnyNull,
  NullTypes,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
}, Prisma, PrismaClient, S, c(), k(), Bu(), Cs() (+12 more)

### Community 85 - "Fe"
Cohesion: 0.09
Nodes (24): au(), Bm(), _d(), dispatchEngineSpans(), #f(), Fe(), fl(), generate() (+16 more)

### Community 86 - "dependencies"
Cohesion: 0.09
Nodes (23): cors, dotenv, express, express-rate-limit, @google/genai, helmet, jose, morgan (+15 more)

### Community 87 - "Assistant observability runbook"
Cohesion: 0.09
Nodes (21): Archive, Assistant Conversations API, Cancel, Clarification selection and cancellation, Conversation state and recovery, Execute, Financial transaction drafts, List and history (+13 more)

### Community 88 - "financial-draft.service.ts"
Cohesion: 0.13
Nodes (13): renderTransactionDraftPreview(), DraftReadyTransactionInput, validateIdempotencyKey(), isCalendarDay(), MonthlyCategoryBreakdown, MonthlySpendingSummaryOutput, TRANSACTION_KEYS, TransactionCreateInput (+5 more)

### Community 89 - "constructor"
Cohesion: 0.09
Nodes (23): Ca(), constructor(), dispatchEngineSpans(), #f(), forSql(), getActiveContext(), getAllBatchQueryCallbacks(), getConnectionInfo() (+15 more)

### Community 90 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, ES2020, node_modules, src/**/*.ts, compilerOptions, baseUrl, declaration, esModuleInterop (+13 more)

### Community 91 - "prismaAdapter.integration.test.ts"
Cohesion: 0.15
Nodes (11): getDashboardSummary(), serializeDashboardSummary(), createDashboardQueryService(), dashboardQueryService, DashboardQueryPrismaClient, DashboardSummaryResult, GetDashboardSummaryInput, buildApp() (+3 more)

### Community 92 - "requestInternal"
Cohesion: 0.14
Nodes (22): convertProtocolErrorsToClientError(), cp(), handleError(), Hr(), ip(), je(), json(), metrics() (+14 more)

### Community 93 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, prisma, supertest, ts-node-dev, @types/cors, @types/express, @types/morgan, @types/node (+13 more)

### Community 94 - "recurringReminderEngine.service.ts"
Cohesion: 0.18
Nodes (14): addBillingMonth(), assertBillingDay(), BillingCycleInput, calculateFirstDueDate(), CalendarDate, clampDay(), formatDate(), nextMonthlyOccurrence() (+6 more)

### Community 95 - "ja"
Cohesion: 0.14
Nodes (21): am(), ba(), Fr(), getAllClientExtensions(), getAllComputedFields(), getAllModelExtensions(), getComputedFields(), he() (+13 more)

### Community 96 - "$transaction"
Cohesion: 0.11
Nodes (7): AdapterInfo, DriverAdapterFactory, Queryable, SqlDriverAdapter, SqlDriverAdapterFactory, SqlQueryable, $transaction()

### Community 97 - "ai"
Cohesion: 0.17
Nodes (20): ai(), ec(), hr(), ic(), Jo(), Jt(), nc(), otherwise() (+12 more)

### Community 98 - "Ut"
Cohesion: 0.12
Nodes (20): eu(), fn(), getAllClientExtensions(), getAllComputedFields(), getAllModelExtensions(), it(), iu(), Lr() (+12 more)

### Community 125 - "ze"
Cohesion: 0.14
Nodes (18): as(), Bd(), cs(), Id(), kd(), kr(), ls(), Lt() (+10 more)

### Community 126 - "constructor"
Cohesion: 0.11
Nodes (18): bu(), constructor(), deserialize(), du(), execute(), forSql(), im(), ju() (+10 more)

### Community 127 - "Git Workflow — Pocket Mint Backend"
Cohesion: 0.12
Nodes (16): After Creating a Normal Development PR, Backend-Specific Release Validation, Before Starting Any Task That May Create Commits, Branch Model, Common Mistakes, "Create a PR" — Default Interpretation, Dev Branch Protections, Explicit Override (+8 more)

### Community 128 - "Prisma migration baseline reconstruction & reconciliation"
Cohesion: 0.12
Nodes (17): 0. Quick reference — production migration runbook (7 steps), 10. Rollback limitations, 11. What remains manual (nothing auto-executed), 1. The blocker, 2. Root cause, 3. Remote `_prisma_migrations` metadata (read-only), 4. Schema equivalence — proven against the live database, 5. The reconstructed baseline (+9 more)

### Community 129 - "write"
Cohesion: 0.22
Nodes (17): addMarginSymbol(), afterNextNewline(), getCurrentLineLength(), getPrintWidth(), indent(), lu(), newLine(), setColor() (+9 more)

### Community 130 - "T"
Cohesion: 0.12
Nodes (17): bp(), h(), handleRequestError(), I(), is(), Lr(), renderAllMessages(), Rn() (+9 more)

### Community 131 - "write"
Cohesion: 0.22
Nodes (17): addMarginSymbol(), afterNextNewline(), getCurrentLineLength(), getPrintWidth(), indent(), newLine(), setColor(), su() (+9 more)

### Community 132 - "write"
Cohesion: 0.24
Nodes (17): Cr(), addMarginSymbol(), afterNextNewline(), getCurrentLineLength(), getPrintWidth(), indent(), newLine(), setColor() (+9 more)

### Community 133 - "SqlDriverAdapter"
Cohesion: 0.12
Nodes (7): AdapterInfo, DriverAdapterFactory, Queryable, SqlDriverAdapter, SqlDriverAdapterFactory, SqlQueryable, $transaction()

### Community 134 - ".includes"
Cohesion: 0.13
Nodes (15): Ct(), ep(), getLocation(), gi(), gp(), hi(), isPreviewFeatureOn(), isRawAction() (+7 more)

### Community 135 - "Backend deployment runbook — JWT-only auth (Sprint 3I)"
Cohesion: 0.12
Nodes (16): 0. Quick reference (build, start, health, Node version), 10.1 Database-password rotation checklist — evidence required, 10. Credential rotation, 11. Git-history purge plan — PENDING EXPLICIT APPROVAL (do not execute), 12. Backend release tagging, 13. GitHub Release procedure, 1. Environment variable inventory, 2. JWT verification mode (+8 more)

### Community 136 - "PrismaPromise"
Cohesion: 0.12
Nodes (4): Prisma__ChannelAssistantOperationClient, Prisma__ChannelOutboundDeliveryClient, Prisma__SavingGoalClient, PrismaPromise

### Community 137 - "write"
Cohesion: 0.24
Nodes (16): addMarginSymbol(), afterNextNewline(), getCurrentLineLength(), getPrintWidth(), indent(), newLine(), setColor(), underline() (+8 more)

### Community 138 - "ln"
Cohesion: 0.20
Nodes (14): an(), ba(), de(), di(), Ea(), fi(), hc(), ln() (+6 more)

### Community 139 - "write"
Cohesion: 0.24
Nodes (16): addMarginSymbol(), afterNextNewline(), getCurrentLineLength(), getPrintWidth(), indent(), newLine(), setColor(), underline() (+8 more)

### Community 140 - "Vo"
Cohesion: 0.23
Nodes (16): _c(), findField(), getArgumentName(), getArgumentPath(), getOutputTypeDescription(), getSelectionPath(), Kt(), nc() (+8 more)

### Community 141 - "St"
Cohesion: 0.14
Nodes (16): Bd(), cu(), equals(), Hd(), jd(), ki(), Ks(), lu() (+8 more)

### Community 142 - "Assistant Core — Pocket Mint Backend"
Cohesion: 0.13
Nodes (14): 10. HTTP Endpoints, 11. Cross-Skill Ownership, 13. Observability, 14. Prohibited Regressions, 1. Scope and Source of Truth, 2. Architectural Boundary, 3. Existing Assistant Core, 4. Entity Resolution (+6 more)

### Community 143 - "requestInternal"
Cohesion: 0.22
Nodes (15): convertProtocolErrorsToClientError(), ep(), handleError(), je(), json(), metrics(), prometheus(), propagateResponseExtensions() (+7 more)

### Community 144 - "digest"
Cohesion: 0.17
Nodes (15): cd(), destroy(), digest(), digestInto(), finish(), keccak(), ld(), pd() (+7 more)

### Community 145 - "ei"
Cohesion: 0.18
Nodes (15): ei(), fp(), getAllClientExtensions(), getAllModelExtensions(), ie(), Ke(), Ms(), rp() (+7 more)

### Community 146 - "Financial Logic — Pocket Mint Backend"
Cohesion: 0.14
Nodes (13): 0. Assistant-Originated Transactions, 14. Operations That Must Be Atomic, 15. Reconciliation, 16. Transfer Representation (PM-STAB-009A — Resolved), 17. Ledger Integrity, 18. Quick Reference — Common Mistakes, 6. Installment Settlement (SETTLED Status), 7. Double Deduction Prevention (+5 more)

### Community 147 - "Wallet Command & Query Service Architecture (Sprints 3C–3D)"
Cohesion: 0.14
Nodes (14): Dependency injection, No `isDefault` / default-wallet behavior, No `$transaction` here — on purpose, No wallet-detail endpoint, Project status, Serialization boundary, Typed errors, Wallet Command & Query Service Architecture (Sprints 3C–3D) (+6 more)

### Community 148 - "cc"
Cohesion: 0.15
Nodes (14): as(), cc(), Ic(), ft(), getAllComputedFields(), getOrCreate(), ls(), pc() (+6 more)

### Community 149 - "Deployment & Operations"
Cohesion: 0.15
Nodes (12): CI/CD, Common Mistakes, Cost-Conscious Defaults (<~10 users), Deployment & Operations, Deployment Stability Status, Environments (never mix), Manual rollout conventions vs. CI enforcement, Migrations Against Shared Databases (+4 more)

### Community 150 - "HTTP & Application Boundary Architecture (Sprint 3F)"
Cohesion: 0.15
Nodes (13): Auth middleware contract, Canonical authenticated request context, Defense-in-depth change (the one identified hardening), Deliberate non-goals (deferred, with rationale), Files, HTTP & Application Boundary Architecture (Sprint 3F), Operational error forwarding (`src/http/forwardError.ts`), Query parsing (`src/http/queryParsers.ts`) (+5 more)

### Community 152 - "Wn"
Cohesion: 0.15
Nodes (12): addItem(), bi(), cs(), kc(), Kr(), l(), Mc(), mi() (+4 more)

### Community 153 - "UI System — Pocket Mint"
Cohesion: 0.17
Nodes (11): Anti-patterns — NEVER do these, Card Component Rules, Dashboard Layout, Design Tokens, Financial Display Rules, Sidebar Rules, Spacing & Scale, Stack (+3 more)

### Community 156 - "g"
Cohesion: 0.17
Nodes (12): ae(), fe(), ft(), g(), ge(), ke(), le(), ot() (+4 more)

### Community 157 - "get"
Cohesion: 0.18
Nodes (12): aa(), Do(), Ep(), get(), il(), Io(), it(), ji() (+4 more)

### Community 160 - "go"
Cohesion: 0.17
Nodes (12): bo(), get(), go(), highlight(), ic(), jc(), Nt(), qn() (+4 more)

### Community 161 - "Dashboard Query Service Architecture (Sprint 3E)"
Cohesion: 0.18
Nodes (11): Controller — `src/controllers/dashboard.controller.ts`, Dashboard Query Service Architecture (Sprint 3E), Grounding: what the dashboard actually is, Query contracts — `src/services/dashboard-query.types.ts`, Query count — before and after, Query service — `src/services/dashboard-query.service.ts`, Serialization boundary, Wallet / transaction service relationship (+3 more)

### Community 162 - "Installment Query Service Architecture (Sprint 3G)"
Cohesion: 0.18
Nodes (11): Controller — `src/controllers/installment.controller.ts`, Deprecated identity mirror, Grounding: what the installment surface actually is, Installment Query Service Architecture (Sprint 3G), Query contracts — `src/services/installment-query.types.ts`, Query service — `src/services/installment-query.service.ts`, Relationship with the transaction command service, Serialization boundary (+3 more)

### Community 163 - "Database Integration Testing (PM-STAB-010A)"
Cohesion: 0.18
Nodes (5): Database Integration Testing (PM-STAB-010A), How it's gated, Rules, Running in CI, Running locally

### Community 164 - "Sprint 2C Reporting and Timezone Correctness Design"
Cohesion: 0.18
Nodes (10): Dashboard and Net Worth, Error Handling and Compatibility, Historical Limitations, Monthly Reporting, Reporting Effects, Scope, Sparkline, Sprint 2C Reporting and Timezone Correctness Design (+2 more)

### Community 165 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:backup, db:restore, db:verify, dev, prisma:generate, start (+3 more)

### Community 166 - "exports"
Cohesion: 0.18
Nodes (11): default, exports, ./client, ./index-browser, ./package.json, ./sql, default, import (+3 more)

### Community 168 - "Fr"
Cohesion: 0.18
Nodes (11): dispatchBatches(), En(), Fr(), handleAndLogRequestError(), handleRequestError(), request(), sanitizeMessage(), Xs() (+3 more)

### Community 170 - "Et"
Cohesion: 0.24
Nodes (11): ap(), Et(), ip(), is(), Jr(), lp(), ns(), op() (+3 more)

### Community 171 - "Authentication & Security — JWT-Only"
Cohesion: 0.20
Nodes (9): Assistant & Clarification Ownership, Authentication & Security — JWT-Only, Common Mistakes, CORS (`src/middleware/cors.ts`), Identity, JWT Configuration (`src/config/index.ts`, `src/utils/supabaseJwt.ts`), Logging & Errors, Rate Limiting (`src/middleware/rateLimit.ts`) (+1 more)

### Community 172 - "prisma/package.json"
Cohesion: 0.20
Nodes (9): @prisma/client-runtime-utils, browser, dependencies, @prisma/client-runtime-utils, main, name, sideEffects, types (+1 more)

### Community 173 - "index.js"
Cohesion: 0.20
Nodes (6): config, path, Prisma, PrismaClient, {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  DbNull,
  JsonNull,
  AnyNull,
  NullTypes,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime,
  createParam,
}, empty()

### Community 177 - "import"
Cohesion: 0.33
Nodes (10): import, browser, default, edge-light, node, types, worker, workerd (+2 more)

### Community 178 - "require"
Cohesion: 0.33
Nodes (10): require, require, browser, default, edge-light, node, types, worker (+2 more)

### Community 180 - "design.md"
Cohesion: 0.22
Nodes (8): Brand & Style, Colors, Components, Elevation & Depth, Layout & Spacing, Shapes, Source of Truth, Typography

### Community 181 - "Agent Rules — Pocket Mint Backend"
Cohesion: 0.22
Nodes (8): Agent Rules — Pocket Mint Backend, Common Mistakes, Environment Isolation, Focus, Git Branch Roles, Secrets, Skill Load Order, Verification

### Community 182 - "Backend API — HTTP Boundary & Service Layer"
Cohesion: 0.22
Nodes (8): Assistant & Clarification HTTP Integration, Backend API — HTTP Boundary & Service Layer, Command/Query Boundaries, Common Mistakes, Purpose, Response Contracts (audit before changing anything), Rules, Verification

### Community 183 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 184 - "Prisma & Database — Prisma 7 Adapter Architecture"
Cohesion: 0.22
Nodes (8): Common Mistakes, Generated Client Packaging, Migration State — Derive, Don't Assume, Prisma & Database — Prisma 7 Adapter Architecture, Runtime, Schema Changes, URLs, Verification

### Community 185 - "Frontend migration to JWT-only authentication (Sprint 3I)"
Cohesion: 0.22
Nodes (9): 1. Read the access token from the Supabase session, 2. Attach it on every request, 3. `/users/sync` uses the same Bearer auth, 4. Session refresh, 5. Handle the uniform 401, 6. CORS / preflight expectations, Do not, Frontend migration to JWT-only authentication (Sprint 3I) (+1 more)

### Community 186 - "run-integration-tests.mjs"
Cohesion: 0.28
Nodes (8): embedded-postgres, embedded-postgres, assertTestDatabaseUrl(), BLOCKED_DATABASE_NAMES, BLOCKED_HOST_PATTERNS, integrationTests, main(), run()

### Community 187 - "Pocket Mint — Backend"
Cohesion: 0.22
Nodes (9): Backup & restore, Build & deploy, Environment variables, Local setup, Migration policy, Pocket Mint — Backend, Project structure, Stack (+1 more)

### Community 190 - "a"
Cohesion: 0.33
Nodes (9): a(), at(), dt(), gt(), lt(), st(), x(), xe() (+1 more)

### Community 192 - "dp"
Cohesion: 0.25
Nodes (9): Af(), dp(), gp(), ot(), pp(), Ps(), Sp(), Tr() (+1 more)

### Community 193 - "NullTypesEnumValue"
Cohesion: 0.22
Nodes (5): AnyNull, DbNull, JsonNull, NullTypesEnumValue, ObjectEnumValue

### Community 195 - "from"
Cohesion: 0.28
Nodes (9): alloc(), allocUnsafe(), allocUnsafeSlow(), construct(), fill(), from(), ho(), zn() (+1 more)

### Community 196 - "Database backup & restore runbook (PM-STAB-010C)"
Cohesion: 0.25
Nodes (8): 1. Three distinct things — don't confuse them, 2. Prerequisites, 3. Backup, 4. Restore, 5. Verification, 6. RPO / RTO (simple), 7. Test evidence (non-production drill, run 2026-07-18), Database backup & restore runbook (PM-STAB-010C)

### Community 197 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Global Constraints, Sprint 2C Reporting and Timezone Correctness Implementation Plan, Task 1: Reporting Time Domain, Task 2: Reporting Financial Effects, Task 3: Monthly Reporting and Date Input Integration, Task 4: Seven-Day End-of-Day Wallet Sparkline, Task 5: Regression, Multi-Timezone Verification, and Build Artifacts

### Community 198 - "renderer.ts"
Cohesion: 0.39
Nodes (5): MonthlySpendingSummaryOutput, formatMonthId(), formatRupiah(), MONTH_NAMES_ID, renderMonthlySpendingSummary()

### Community 202 - "./runtime/client"
Cohesion: 0.25
Nodes (8): ./runtime/client, default, require, default, import, node, require, types

### Community 203 - "#wasm-compiler-loader"
Cohesion: 0.25
Nodes (8): imports, #main-entry-point, #wasm-compiler-loader, default, default, edge-light, worker, workerd

### Community 205 - "vo"
Cohesion: 0.25
Nodes (8): Vl(), ao(), getAllQueryCallbacks(), isEmpty(), jo(), Lo(), qo(), vo()

### Community 206 - "index-browser.d.ts"
Cohesion: 0.25
Nodes (7): Args, Exact, GetRuntimeOutput, Narrowable, Operation, Public, RuntimeName

### Community 207 - "telegramAdapterBoundary.test.ts"
Cohesion: 0.25
Nodes (5): ALLOWED_ASSISTANT_IMPORTS, ASSISTANT_IMPORT_ALLOWED_FILES, CHANNELS_DIR, FORBIDDEN_IMPORT_SUFFIXES, TELEGRAM_DIR

### Community 208 - "Pocket Mint — Session Task Prompt"
Cohesion: 0.29
Nodes (6): 0. Fix Backend Port Conflict (EADDRINUSE :::5001), 1. Fix Wallet CRUD, 2. Fix Active Installments on Dashboard, 3. Monthly P&L Reset, 4. Implementation Order, Pocket Mint — Session Task Prompt

### Community 209 - "3. Transaction Effects"
Cohesion: 0.29
Nodes (7): 3. Transaction Effects, EXPENSE, INCOME, Summary: Which transactions affect Net Worth?, TRANSFER (asset-to-asset), TRANSFER (debt repayment / installment payment), TRANSFER destination hardening note

### Community 210 - "4. Credit / PayLater Expense (Installment Creation)"
Cohesion: 0.29
Nodes (7): 4. Credit / PayLater Expense (Installment Creation), Balance effect at creation, Credit limit check, Example (principal 100.000, rate 2.6%, 3 months), Installment plan arithmetic, Two billing modes, Validation summary

### Community 211 - "Transaction Service Architecture (Sprints 3A + 3B)"
Cohesion: 0.29
Nodes (7): Dependency injection, Error propagation, How future modules should follow this, Serialization boundary, Transaction Service Architecture (Sprints 3A + 3B), Why a repository layer is still deferred, Why this is not full CQRS

### Community 212 - "5. Pending Prisma migrations"
Cohesion: 0.29
Nodes (7): `20260711172700_remove_local_user_password` — DESTRUCTIVE, `20260711223000_add_transaction_to_wallet` — ADDITIVE / SAFE, `20260717000000_generalize_wallets_and_bills` — MIXED (additive + in-place enum/data change), `20260718000000_drop_unused_transfer_model` — SAFE / NON-DESTRUCTIVE (dead table), `20260719001706_add_recurring_transaction_templates` through `20260719181136_add_saving_goals` — ADDITIVE / SAFE, 5. Pending Prisma migrations, ⚠️ Migration-history drift — provisioning blocker for a FRESH database (RESOLVED, re-verified 2026-07-18)

### Community 213 - "Prisma runtime connection & pooling (pg driver adapter)"
Cohesion: 0.29
Nodes (6): Composition, Connection budget, Environment variables, Prisma runtime connection & pooling (pg driver adapter), Verification (disposable PostgreSQL), Which URL to use

### Community 214 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Bottom Nav Dock Morph Implementation Plan, Global Constraints, Task 1: Build the reusable dock component, Task 2: Refactor bottom nav to use the dock, Task 3: Polish motion, spacing, and accessibility, Task 4: Final verification

### Community 215 - "package.json"
Cohesion: 0.29
Nodes (6): engines, node, main, name, private, version

### Community 216 - "20260710000000_baseline/migration.sql"
Cohesion: 0.76
Nodes (6): "categories", "installments", "transactions", "transfers", "users", "wallets"

### Community 221 - "PrismaClientKnownRequestError"
Cohesion: 0.29
Nodes (3): ErrorWithBatchIndex, PrismaClientKnownRequestError, PrismaClientUnknownRequestError

### Community 222 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 223 - "Layers"
Cohesion: 0.33
Nodes (6): Command service — `src/services/transaction.service.ts`, Controller — `src/controllers/transaction.controller.ts`, Domain / reporting helpers (reused, unchanged), Layers, Query service — `src/services/transaction-query.service.ts`, Why the summary aggregates in the database

### Community 224 - "db-backup.mjs"
Cohesion: 0.33
Nodes (5): outFile, result, { size }, start, timestamp

### Community 225 - "db-restore.mjs"
Cohesion: 0.47
Nodes (5): assertRestoreTargetUrl(), assertTargetIsEmpty(), BLOCKED_DATABASE_NAMES, BLOCKED_HOST_PATTERNS, main()

### Community 226 - "prisma/edge.js"
Cohesion: 0.33
Nodes (5): config, Prisma, PrismaClient, {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  DbNull,
  JsonNull,
  AnyNull,
  NullTypes,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime,
  createParam,
}, empty()

### Community 237 - "ou"
Cohesion: 0.40
Nodes (6): ku(), lt(), nu(), ou(), uo(), xr()

### Community 238 - "wasm.js"
Cohesion: 0.33
Nodes (5): empty(), config, Prisma, PrismaClient, {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime,
  createParam,
}

### Community 239 - "copy-prisma-client.cjs"
Cohesion: 0.33
Nodes (5): { cpSync, existsSync, mkdirSync }, destination, destinationRoot, { resolve }, source

### Community 241 - "20260722201000_add_assistant_conversation_persistence/migration.sql"
Cohesion: 0.90
Nodes (4): "assistant_conversations", "assistant_messages", "assistant_tool_executions", "assistant_turns"

### Community 242 - "20260726185156_add_durable_channel_processing/migration.sql"
Cohesion: 0.50
Nodes (4): "channel_assistant_operations", "channel_inbound_jobs", "channel_outbound_deliveries", "channel_update_dedups"

### Community 243 - "20260727000000_add_telegram_interactive_callbacks/migration.sql"
Cohesion: 0.50
Nodes (4): "channel_assistant_operations", "channel_callback_tokens", "channel_inbound_jobs", "channel_outbound_deliveries"

### Community 246 - "./edge"
Cohesion: 0.40
Nodes (5): default, import, require, types, ./edge

### Community 247 - "./extension"
Cohesion: 0.40
Nodes (5): ./extension, default, import, require, types

### Community 248 - "./index"
Cohesion: 0.40
Nodes (5): ./index, default, import, require, types

### Community 249 - "./runtime/index-browser"
Cohesion: 0.40
Nodes (5): ./runtime/index-browser, default, import, require, types

### Community 250 - "./runtime/wasm-compiler-edge"
Cohesion: 0.40
Nodes (5): ./runtime/wasm-compiler-edge, default, import, require, types

### Community 251 - "l"
Cohesion: 0.40
Nodes (5): be(), ee(), l(), q(), se()

### Community 252 - "E"
Cohesion: 0.40
Nodes (5): E(), it(), W(), y(), ze()

### Community 255 - "10. Analytics Rules"
Cohesion: 0.50
Nodes (4): 10. Analytics Rules, Cash flow aggregation, Known limitation (PM-STAB-002), Wallet-level reporting

### Community 256 - "1. Wallet Classification"
Cohesion: 0.50
Nodes (4): 1. Wallet Classification, Asset wallets, Debt wallets, Wallet create rules

### Community 257 - "2. Net Worth (PD-001 — Approved)"
Cohesion: 0.50
Nodes (4): 2. Net Worth (PD-001 — Approved), Concrete example, Historical note (deprecated), Rules

### Community 258 - "5. Installment Payment (Debt Settlement)"
Cohesion: 0.50
Nodes (4): 5. Installment Payment (Debt Settlement), finalMonthlyAmount in payment, Payment rules, Term progression

### Community 259 - "9. Reporting Cutoff and Timezone"
Cohesion: 0.50
Nodes (4): 9. Reporting Cutoff and Timezone, Reporting month, Sparkline, Transaction date semantics

### Community 260 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 261 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 262 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 263 - "20260726152156_add_channel_foundation/migration.sql"
Cohesion: 0.50
Nodes (3): "channel_connections", "channel_link_tokens", "channel_update_dedups"

### Community 264 - "./generator-build"
Cohesion: 0.50
Nodes (4): ./generator-build, default, import, require

### Community 272 - "express.d.ts"
Cohesion: 0.67
Nodes (3): AuthContext, Express, Request

### Community 273 - "prismaBillingMigration.test.ts"
Cohesion: 0.50
Nodes (3): migrationPath, root, schemaPath

### Community 276 - "11. Installment Lifecycle (Current Implementation)"
Cohesion: 0.67
Nodes (3): 11. Installment Lifecycle (Current Implementation), Implemented, Not yet implemented (PD-003 Draft)

### Community 277 - "12. Admin Fee and Interest"
Cohesion: 0.67
Nodes (3): 12. Admin Fee and Interest, Admin fee, Interest

### Community 278 - "13. Money Precision and Rounding"
Cohesion: 0.67
Nodes (3): 13. Money Precision and Rounding, Common mistake, Rules

### Community 279 - "8. Transaction Update and Delete"
Cohesion: 0.67
Nodes (3): 8. Transaction Update and Delete, Delete rules, Update rules

## Knowledge Gaps
- **4663 isolated node(s):** `name`, `version`, `private`, `main`, `node` (+4658 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **119 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v()` connect `slice` to `wasm-engine-edge.js`, `runtime/client.js`, `St`, `Ut`?**
  _High betweenness centrality (0.333) - this node is a cross-community bridge._
- **Why does `collectAllKeys()` connect `slice` to `errorHandler`?**
  _High betweenness centrality (0.288) - this node is a cross-community bridge._
- **Why does `Decimal` connect `Decimal` to `getResources`, `library.d.ts`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _4663 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0006144393241167435 - nodes in this community are weakly interconnected._
- **Should `library.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.005479452054794521 - nodes in this community are weakly interconnected._
- **Should `runtime/client.d.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.006060606060606061 - nodes in this community are weakly interconnected._