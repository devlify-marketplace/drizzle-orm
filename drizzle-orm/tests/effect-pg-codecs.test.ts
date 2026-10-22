import { expect, test } from 'vitest';
import { effectPgCodecs } from '~/effect-postgres/codecs.ts';

const arrayTypes = [
	'bool',
	'bytea',
	'char',
	'varchar',
	'text',
	'smallint',
	'int',
	'bigint',
	'bigint:number',
	'bigint:string',
	'smallserial',
	'serial',
	'bigserial',
	'bigserial:number',
	'float4',
	'float8',
] as const;

test.each(arrayTypes)('normalizes empty %s array parameters', (type) => {
	expect(effectPgCodecs[type]?.normalizeParamArray?.([], 1)).toBe('{}');
});

test.each(['bigint', 'bigserial'] as const)('normalizes string-decoded %s results to bigint', (type) => {
	expect(effectPgCodecs[type]?.normalize?.('9007199254740993')).toBe(9007199254740993n);
	expect(effectPgCodecs[type]?.normalize?.(9007199254740993n)).toBe(9007199254740993n);
});

test('normalizes string-decoded bigint arrays without losing precision', () => {
	expect(effectPgCodecs.bigint?.normalizeArray?.(['9007199254740993', null, '-9007199254740993'], 1))
		.toEqual([9007199254740993n, null, -9007199254740993n]);
});
