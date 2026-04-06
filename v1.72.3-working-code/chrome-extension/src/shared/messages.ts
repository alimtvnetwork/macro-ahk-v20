/**
 * Marco Extension — Message Types (Re-export)
 *
 * Canonical source: src/shared/messages.ts
 */
export {
    MessageType,
} from "../../../src/shared/messages";

export type {
    TokenStatus,
    ConfigStatus,
    BootTiming,
    StatusResponse,
    HealthStatusResponse,
    NetworkStatusRequest,
    NetworkRequestEntry,
    NetworkRequestMessage,
    GetStatusRequest,
    GetHealthRequest,
    OkResponse,
    ErrorResponse,
    MessageRequest,
    UserScriptLogRequest,
    UserScriptDataSetRequest,
    UserScriptDataGetRequest,
    UserScriptDataDeleteRequest,
    UserScriptDataKeysRequest,
    UserScriptDataGetAllRequest,
    UserScriptDataClearRequest,
    TrackedMessageEvent,
} from "../../../src/shared/messages";
