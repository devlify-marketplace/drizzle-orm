import { interimToDDL } from 'src/dialects/mssql/ddl';
import { fromDatabase } from 'src/dialects/mssql/introspect';
import { ddlToTypeScript } from 'src/dialects/mssql/typescript';
import type { DB } from 'src/utils';
import { expect, test } from 'vitest';

// Exercise the pull pipeline with the metadata returned by SQL Server when
// VIEW DEFINITION is unavailable, without requiring a database login fixture.
const introspectComputedColumn = async (definition: string | null, persisted: boolean) => {
	const db: DB = {
		query: async <T>(query: string) => {
			let rows: Record<string, unknown>[];
			if (query.includes('FROM sys.schemas')) {
				rows = [{ schema_name: 'dbo', schema_id: 1 }];
			} else if (query.includes('sys.tables')) {
				rows = [{ object_id: 100, schema_id: 1, name: 't' }];
			} else if (query.includes('FROM sys.columns col')) {
				rows = ['a', 'c'].map((name, index) => ({
					column_id: index + 1,
					table_object_id: 100,
					name,
					system_type_id: 231,
					max_length_bytes: 6,
					precision: 0,
					scale: 0,
					is_nullable: true,
					is_identity: false,
					is_computed: name === 'c',
					default_object_id: 0,
					seed_value: null,
					increment_value: null,
					type: 'nvarchar',
					generated_always_definition: name === 'c' ? definition : null,
					generated_is_persisted: persisted,
					rel_kind: 'U',
				}));
			} else if (/sys\.(views|check_constraints|default_constraints|foreign_keys|indexes)\b/.test(query)) {
				rows = [];
			} else {
				throw new Error(`Unexpected introspection query: ${query}`);
			}
			return rows as T[];
		},
	};
	return fromDatabase(db, () => true);
};

for (const persisted of [false, true]) {
	test.each([null, ''])(
		`pulls a computed column without a visible definition (persisted: ${persisted}, definition: %s)`,
		async (definition) => {
			const schema = await introspectComputedColumn(definition, persisted);
			const computed = schema.columns.find((column) => column.name === 'c');
			// Keep introspected metadata intact; only TypeScript emission should omit it.
			expect(computed?.generated).toEqual({ as: definition, type: persisted ? 'persisted' : 'virtual' });
			const { ddl, errors } = interimToDDL(schema);
			expect(errors).toEqual([]);
			const { file } = ddlToTypeScript(ddl, schema.viewColumns, 'preserve');
			expect(file).toContain('a: nvarchar({ length: 3 }),');
			expect(file).toContain('c: nvarchar({ length: 3 }),');
			expect(file).not.toContain('.generatedAlwaysAs(');
		},
	);
}

test.each([false, true])('preserves a visible computed definition (persisted: %s)', async (persisted) => {
	const schema = await introspectComputedColumn('([a])', persisted);
	const { ddl, errors } = interimToDDL(schema);
	expect(errors).toEqual([]);
	const { file } = ddlToTypeScript(ddl, schema.viewColumns, 'preserve');
	expect(file).toContain('c: nvarchar({ length: 3 }).generatedAlwaysAs(sql`([a])`)');
	expect(file).toContain('a: nvarchar({ length: 3 }),');
});

test.each([false, true])('escapes a visible computed definition (persisted: %s)', async (persisted) => {
	const schema = await introspectComputedColumn("([a]+'`\\${value}')", persisted);
	const { ddl, errors } = interimToDDL(schema);
	expect(errors).toEqual([]);
	const { file } = ddlToTypeScript(ddl, schema.viewColumns, 'preserve');
	expect(file).toContain(".generatedAlwaysAs(sql`([a]+'\\`\\\\\\${value}')`)");
});
