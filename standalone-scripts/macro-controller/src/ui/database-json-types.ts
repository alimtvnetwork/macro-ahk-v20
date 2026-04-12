/**
 * MacroLoop Controller — JSON Schema Types & Sample
 *
 * Shared type definitions for the Raw JSON schema tab
 * and the sample schema constant.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

export interface JsonColumnDef {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN';
  nullable?: boolean;
  unique?: boolean;
  default?: string;
  validation?: ValidationRules;
}

export interface JsonForeignKey {
  column: string;
  references: { table: string; column: string };
  onDelete?: string;
  onUpdate?: string;
}

export interface JsonTableDef {
  name: string;
  ifNotExists?: boolean;
  columns: JsonColumnDef[];
  foreignKeys?: JsonForeignKey[];
}

export interface JsonMigration {
  table: string;
  action: 'addColumn' | 'dropColumn' | 'renameColumn';
  column?: JsonColumnDef;
  oldName?: string;
  newName?: string;
}

export interface JsonSchema {
  $schema?: string;
  tables?: JsonTableDef[];
  migrations?: JsonMigration[];
}

export const SAMPLE_SCHEMA: JsonSchema = {
  $schema: 'marco-db-schema/v1',
  tables: [
    {
      name: 'Customers',
      ifNotExists: true,
      columns: [
        { name: 'Name', type: 'TEXT', nullable: false },
        { name: 'Email', type: 'TEXT', nullable: false, unique: true },
        { name: 'Status', type: 'TEXT', default: "'active'" },
      ],
    },
  ],
  migrations: [
    {
      table: 'Customers',
      action: 'addColumn',
      column: { name: 'Phone', type: 'TEXT', nullable: true },
    },
  ],
};
