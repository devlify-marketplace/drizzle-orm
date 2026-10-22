import { PgClient } from '@effect/sql-pg';
import * as PgTypes from '@effect/sql-pg/PgTypes';
import { expect, it } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { bigint, bigserial, boolean, bytea, integer, pgTable, text } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';

const types = PgTypes.makeRegistry();
types.register<string>(PgTypes.OID.int8, {
	decode: (bytes) => Result.succeed(new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0).toString()),
	encode: (value) => {
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setBigInt64(0, BigInt(value));
		return Result.succeed(bytes);
	},
});

const PgClientLive = PgClient.layer({
	url: Redacted.make(process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55433/drizzle'),
	types,
});

it.layer(PgClientLive)('effect-postgres codec regressions', (it) => {
	it.effect('inserts and updates empty arrays without changing populated bytea arrays', () =>
		Effect.gen(function*() {
			const db = yield* PgDrizzle.makeWithDefaults();
			const table = pgTable('effect_pg_empty_arrays', {
				tags: text().array().notNull(),
				ids: integer().array().notNull(),
				flags: boolean().array().notNull(),
				bytes: bytea().array().notNull(),
			});

			yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.execute(sql`
						create temporary table ${table} (tags text[] not null, ids integer[] not null,
							flags boolean[] not null, bytes bytea[] not null) on commit drop
					`);
					const empty = { tags: [], ids: [], flags: [], bytes: [] };
					expect(yield* tx.insert(table).values(empty).returning()).toEqual([empty]);

					const populated = {
						tags: ['a,b', '"quoted"'],
						ids: [1, -2],
						flags: [true, false],
						bytes: [Buffer.from([0, 255, 44, 34, 92])],
					};
					expect(yield* tx.update(table).set(populated).returning()).toEqual([populated]);
					expect(yield* tx.update(table).set(empty).returning()).toEqual([empty]);
				})
			);
		}));

	it.effect('preserves bigint modes when the PgClient int8 decoder returns strings', () =>
		Effect.gen(function*() {
			const db = yield* PgDrizzle.makeWithDefaults();
			const table = pgTable('effect_pg_bigint_modes', {
				big: bigint({ mode: 'bigint' }).notNull(),
				serial: bigserial({ mode: 'bigint' }),
				arr: bigint({ mode: 'bigint' }).array().notNull(),
			});
			const value = 9007199254740993n;
			const row = { big: value, serial: value, arr: [value, -value] };

			yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.execute(sql`
						create temporary table ${table} (big bigint not null, serial bigserial not null,
							arr bigint[] not null) on commit drop
					`);
					expect(yield* tx.insert(table).values(row).returning()).toEqual([row]);
					expect(yield* tx.select().from(table)).toEqual([row]);
				})
			);
		}));
});
