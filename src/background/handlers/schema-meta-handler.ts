/**
 * Marco Extension — Schema Meta Handler (Issue 85)
 *
 * Message handlers for APPLY_JSON_SCHEMA and GENERATE_SCHEMA_DOCS.
 * Bridges the schema-meta-engine to the Options UI via message passing.
 *
 * @see .lovable/memory/architecture/schema-meta-engine.md — Schema meta engine
 * @see spec/05-chrome-extension/67-project-scoped-database-and-rest-api.md — Project DB & REST API
 */

import {
    initProjectDb,
    getProjectDb,
    flushProjectDb,
    hasProjectDb,
} from "../project-db-manager";

import {
    ensureMetaTables,
    applyJsonSchema,
    generateMarkdownDocs,
    generatePrismaSchema,
    getMetaTables,
    getMetaColumns,
    getMetaRelations,
    type JsonSchemaDef,
} from "../schema-meta-engine";

import { type MessageRequest } from "../../shared/messages";
import type { JsonRecord } from "./handler-types";

/* ------------------------------------------------------------------ */
/*  APPLY_JSON_SCHEMA                                                  */
/* ------------------------------------------------------------------ */

interface ApplyJsonSchemaMessage extends MessageRequest {
    project: string;
    schema: JsonSchemaDef;
}

export async function handleApplyJsonSchema(msg: MessageRequest): Promise<{ isOk: boolean; result?: ReturnType<typeof applyJsonSchema>; errorMessage?: string }> {
    const { project, schema } = msg as ApplyJsonSchemaMessage;

    if (!project || typeof project !== "string") {
        return { isOk: false, errorMessage: "Missing 'project' (slug)" };
    }
    if (!schema || !Array.isArray(schema.tables)) {
        return { isOk: false, errorMessage: "Missing or invalid 'schema' (JsonSchemaDef)" };
    }

    // Ensure project DB is initialized
    if (!hasProjectDb(project)) {
        await initProjectDb(project);
    }
    const db = getProjectDb(project);
    ensureMetaTables(db);

    const result = applyJsonSchema(db, schema);
    await flushProjectDb(project);

    return {
        isOk: true,
        result,
    };
}

/* ------------------------------------------------------------------ */
/*  GENERATE_SCHEMA_DOCS                                               */
/* ------------------------------------------------------------------ */

interface GenerateSchemaDocsMessage extends MessageRequest {
    project: string;
    format?: "markdown" | "prisma" | "both" | "meta";
}

interface SchemaDocsResponse {
    isOk: boolean;
    errorMessage?: string;
    markdown?: string;
    prisma?: string;
    tables?: ReturnType<typeof getMetaTables>;
    columns?: ReturnType<typeof getMetaColumns>;
    relations?: ReturnType<typeof getMetaRelations>;
}

export async function handleGenerateSchemaDocs(msg: MessageRequest): Promise<SchemaDocsResponse> {
    const { project, format = "both" } = msg as GenerateSchemaDocsMessage;

    if (!project || typeof project !== "string") {
        return { isOk: false, errorMessage: "Missing 'project' (slug)" };
    }

    if (!hasProjectDb(project)) {
        await initProjectDb(project);
    }
    const db = getProjectDb(project);
    ensureMetaTables(db);

    const response: SchemaDocsResponse = { isOk: true };

    if (format === "markdown" || format === "both") {
        response.markdown = generateMarkdownDocs(db);
    }

    if (format === "prisma" || format === "both") {
        response.prisma = generatePrismaSchema(db);
    }

    if (format === "meta") {
        response.tables = getMetaTables(db);
        response.columns = getMetaColumns(db);
        response.relations = getMetaRelations(db);
    }

    return response;
}
