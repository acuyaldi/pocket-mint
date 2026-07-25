import { type EntityReferenceInput, type NormalizedEntityReference } from './types';
type ParsedReference = {
    readonly ok: true;
    readonly reference: EntityReferenceInput;
    readonly normalized: NormalizedEntityReference;
} | {
    readonly ok: false;
    readonly kind: 'unsupported_entity_type';
} | {
    readonly ok: false;
    readonly kind: 'invalid_reference';
    readonly entityType?: EntityReferenceInput['entityType'];
};
export declare function parseEntityReferenceInput(value: unknown): ParsedReference;
export {};
