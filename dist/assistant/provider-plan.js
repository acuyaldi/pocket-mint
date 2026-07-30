"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAssistantPlan = validateAssistantPlan;
const policy_1 = require("./policy");
const provider_types_1 = require("./provider-types");
const rupiah_amount_recovery_1 = require("./rupiah-amount-recovery");
const TOP_LEVEL_KEYS = ['arguments', 'clarification', 'intent', 'kind', 'userMessage'];
const FORBIDDEN_KEYS = new Set([
    '__proto__', 'prototype', 'constructor',
    'analysis', 'reasoning', 'chainofthought', 'scratchpad',
    'userid', 'ownerid', 'authorized', 'validated', 'walletowned',
    'transactioncreated', 'confirmationcomplete',
]);
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_PLAN_DEPTH = 6;
const SAFE_CLARIFICATION = 'Mohon lengkapi informasi transaksi yang masih diperlukan.';
const SAFE_AMOUNT_CLARIFICATION = 'Berapa nominal transaksi yang ingin dicatat?';
const SAFE_UNSUPPORTED = 'Permintaan tersebut belum didukung oleh Assistant.';
const SECRET_REQUEST = /\b(api[- ]?key|password|passcode|kata sandi|pin|otp|one[- ]?time password|secret|credential|bank login|bearer|access[- ]?token|refresh[- ]?token|recovery (?:code|phrase)|kode pemulihan|seed phrase|mnemonic|private key|frasa pemulihan|disable security|nonaktifkan keamanan|skip (?:security|verification)|lewati verifikasi)\b/i;
const UNSAFE_MARKUP = /[<>]|!?\[[^\]]*\]\s*\(|(?:https?:\/\/|javascript:|data:)/i;
const UNSAFE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const MONEY_RE = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
function invalid() {
    throw provider_types_1.AssistantProviderError.invalidResponse();
}
function inspect(value, depth = 0) {
    if (depth > MAX_PLAN_DEPTH)
        invalid();
    if (value === null || typeof value !== 'object')
        return;
    if (Array.isArray(value))
        invalid();
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key.normalize('NFKC').toLowerCase()))
            invalid();
        inspect(child, depth + 1);
    }
}
function plainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}
function normalizeProviderAmount(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'string') {
        if (MONEY_RE.test(value))
            return value;
        return (0, rupiah_amount_recovery_1.recoverSingleExplicitIndonesianAmount)(value) ?? value;
    }
    if (typeof value !== 'number' || !Number.isFinite(value))
        return undefined;
    const text = String(value);
    if (!MONEY_RE.test(text) || text === '0' || /^0(?:\.0{1,2})?$/.test(text))
        return undefined;
    return text;
}
function normalizeTransactionCreateArguments(argumentsValue) {
    const amount = normalizeProviderAmount(argumentsValue.amount);
    if (amount === null)
        return null;
    if (amount === undefined)
        invalid();
    const normalized = {};
    for (const [key, value] of Object.entries(argumentsValue)) {
        if (key === 'amount') {
            normalized.amount = amount;
            continue;
        }
        if (key === 'categoryId') {
            if (value === null)
                continue;
            invalid();
        }
        if ((key === 'categoryReference' || key === 'date' || key === 'description') && value === null) {
            continue;
        }
        normalized[key] = value;
    }
    return normalized;
}
function validateAssistantPlan(output, registry) {
    let serialized;
    try {
        serialized = JSON.stringify(output);
    }
    catch {
        invalid();
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES)
        invalid();
    inspect(output);
    if (!plainObject(output) || !exactKeys(output, TOP_LEVEL_KEYS))
        invalid();
    if (typeof output.userMessage !== 'string' || output.userMessage.length > 2000)
        invalid();
    if (!plainObject(output.arguments))
        invalid();
    if (output.kind === 'intent') {
        if (typeof output.intent !== 'string' || output.clarification !== null)
            invalid();
        const contract = registry.get(output.intent);
        if (!contract || !contract.enabled)
            invalid();
        if (output.intent === 'transaction.create') {
            const normalized = normalizeTransactionCreateArguments(output.arguments);
            if (normalized === null) {
                return { kind: 'clarification', question: SAFE_AMOUNT_CLARIFICATION };
            }
            output.arguments = normalized;
        }
        const providerArguments = output.arguments;
        const providerKeys = new Set(Object.keys(contract.providerArguments.properties));
        if (Object.keys(providerArguments).some((key) => !providerKeys.has(key))
            || contract.providerArguments.required.some((key) => !Object.prototype.hasOwnProperty.call(providerArguments, key))) {
            invalid();
        }
        let validatedArguments;
        try {
            validatedArguments = contract.validateInput(providerArguments);
        }
        catch {
            invalid();
        }
        const policy = (0, policy_1.evaluatePolicy)(contract);
        if (policy.action !== 'EXECUTE_IMMEDIATELY' && policy.action !== 'DRAFT_AND_CONFIRM')
            invalid();
        return { kind: 'intent', intent: output.intent, arguments: validatedArguments, policy };
    }
    if (output.kind === 'clarification') {
        if (output.intent !== null || Object.keys(output.arguments).length !== 0 || !plainObject(output.clarification))
            invalid();
        if (!exactKeys(output.clarification, ['question']))
            invalid();
        const question = output.clarification.question;
        if (typeof question !== 'string' || !question.trim() || question.length > 500 || /[\r\n]/.test(question))
            invalid();
        const unsafeQuestion = SECRET_REQUEST.test(question)
            || UNSAFE_MARKUP.test(question)
            || UNSAFE_CONTROL.test(question);
        return {
            kind: 'clarification',
            question: unsafeQuestion ? SAFE_CLARIFICATION : question.trim(),
        };
    }
    if (output.kind === 'unsupported') {
        if (output.intent !== null || Object.keys(output.arguments).length !== 0 || output.clarification !== null)
            invalid();
        return { kind: 'unsupported', message: SAFE_UNSUPPORTED };
    }
    invalid();
}
//# sourceMappingURL=provider-plan.js.map