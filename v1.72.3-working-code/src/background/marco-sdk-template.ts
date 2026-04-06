/**
 * Marco Extension — SDK Injection Template
 *
 * Generates the self-contained IIFE that creates `window.marco`
 * in the page context before user scripts execute.
 *
 * IMPORTANT: Scripts run in MAIN world where chrome.runtime is undefined.
 * All communication uses window.postMessage through the content script relay.
 * See spec/12-chrome-extension/42-user-script-logging-and-data-bridge.md
 */

/* ------------------------------------------------------------------ */
/*  Template Context                                                   */
/* ------------------------------------------------------------------ */

interface SdkContext {
    projectId: string;
    scriptId: string;
    configId: string;
    urlRuleId: string;
}

/* ------------------------------------------------------------------ */
/*  Template Builder                                                   */
/* ------------------------------------------------------------------ */

/** Builds the SDK IIFE string for injection into a page (MAIN world). */
export function buildMarcoSdkScript(ctx: SdkContext): string {
    const safeProjectId = escapeForTemplate(ctx.projectId);
    const safeScriptId = escapeForTemplate(ctx.scriptId);
    const safeConfigId = escapeForTemplate(ctx.configId);
    const safeUrlRuleId = escapeForTemplate(ctx.urlRuleId);

    return `(function(){
if(window.marco){
if(!window.RiseupAsiaMacroExt){window.RiseupAsiaMacroExt={Projects:{}};}
else if(!window.RiseupAsiaMacroExt.Projects){window.RiseupAsiaMacroExt.Projects={};}
return;
}
var __root=window.RiseupAsiaMacroExt;
if(!__root){__root={Projects:{}};window.RiseupAsiaMacroExt=__root;}
if(!__root.Projects){__root.Projects={};}
var __ctx={projectId:"${safeProjectId}",scriptId:"${safeScriptId}",configId:"${safeConfigId}",urlRuleId:"${safeUrlRuleId}"};
var __reqCounter=0;
var __pending={};
function __genId(){return"marco-sdk-"+(++__reqCounter)+"-"+Date.now();}
function sendMsg(m){return new Promise(function(resolve,reject){var rid=__genId();__pending[rid]={resolve:resolve,reject:reject};m.source="marco-controller";m.requestId=rid;try{window.postMessage(m,"*");}catch(e){delete __pending[rid];reject(e);}setTimeout(function(){if(__pending[rid]){delete __pending[rid];reject(new Error("Marco SDK message timeout"));}},10000);});}
window.addEventListener("message",function(evt){if(evt.source!==window)return;var d=evt.data;if(!d||d.source!=="marco-extension"||d.type!=="RESPONSE")return;var rid=d.requestId;if(!rid||!__pending[rid])return;var p=__pending[rid];delete __pending[rid];var payload=d.payload;if(payload&&payload.isOk===false){p.reject(new Error(payload.errorMessage||"SDK message failed"));}else{p.resolve(payload);}});
function logFn(level){return function(message,metadata){sendMsg({type:"USER_SCRIPT_LOG",payload:{level:level,source:"user-script",category:"USER",action:"log",detail:String(message),metadata:metadata?JSON.stringify(metadata):null,projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId,pageUrl:window.location.href,timestamp:new Date().toISOString()}}).catch(function(){});};}
function nsKey(k){return __ctx.projectId+"::"+k;}
function globalKey(k){return "__global__::"+k;}
window.marco={
log:{info:logFn("INFO"),warn:logFn("WARN"),error:logFn("ERROR"),debug:logFn("DEBUG"),write:function(opts){sendMsg({type:"USER_SCRIPT_LOG",payload:{level:opts.level||"INFO",source:"user-script",category:opts.category||"USER",action:opts.action||"log",detail:String(opts.message),metadata:opts.metadata?JSON.stringify(opts.metadata):null,projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId,pageUrl:window.location.href,timestamp:new Date().toISOString()}}).catch(function(){});}},
store:{
set:function(k,v){return sendMsg({type:"USER_SCRIPT_DATA_SET",key:nsKey(k),value:v,projectId:__ctx.projectId,scriptId:__ctx.scriptId});},
get:function(k){return sendMsg({type:"USER_SCRIPT_DATA_GET",key:nsKey(k)}).then(function(r){return r.value;});},
delete:function(k){return sendMsg({type:"USER_SCRIPT_DATA_DELETE",key:nsKey(k)});},
keys:function(){return sendMsg({type:"USER_SCRIPT_DATA_KEYS",prefix:__ctx.projectId+"::"}).then(function(r){return r.keys;});},
getAll:function(){return sendMsg({type:"USER_SCRIPT_DATA_GET_ALL",prefix:__ctx.projectId+"::"}).then(function(r){return r.entries;});},
clear:function(){return sendMsg({type:"USER_SCRIPT_DATA_CLEAR",prefix:__ctx.projectId+"::"});},
setGlobal:function(k,v){return sendMsg({type:"USER_SCRIPT_DATA_SET",key:globalKey(k),value:v,projectId:"__global__",scriptId:__ctx.scriptId});},
getGlobal:function(k){return sendMsg({type:"USER_SCRIPT_DATA_GET",key:globalKey(k)}).then(function(r){return r.value;});},
deleteGlobal:function(k){return sendMsg({type:"USER_SCRIPT_DATA_DELETE",key:globalKey(k)});},
keysGlobal:function(){return sendMsg({type:"USER_SCRIPT_DATA_KEYS",prefix:"__global__::"}).then(function(r){return r.keys;});}
},
kv:{
get:function(k){return sendMsg({type:"KV_GET",projectId:__ctx.projectId,key:k}).then(function(r){return r.value;});},
set:function(k,v){return sendMsg({type:"KV_SET",projectId:__ctx.projectId,key:k,value:typeof v==="string"?v:JSON.stringify(v)});},
delete:function(k){return sendMsg({type:"KV_DELETE",projectId:__ctx.projectId,key:k});},
list:function(){return sendMsg({type:"KV_LIST",projectId:__ctx.projectId}).then(function(r){return r.entries;});}
},
context:Object.freeze({projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId})
};
Object.freeze(window.marco.log);
Object.freeze(window.marco.store);
Object.freeze(window.marco.kv);
Object.freeze(window.marco);
})();`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Escapes a string for safe embedding in a JS template literal. */
function escapeForTemplate(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}
