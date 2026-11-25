export type FieldQueueStatus = "queued" | "syncing" | "synced" | "failed" | "conflict" | "needs-review";
export type FieldDraft = { id: string; principalId: string; projectId: string; assignmentId: string; assignmentLabel?: string; kind: string; note: string; capturedAt: string; latitude?: number; longitude?: number; accuracy?: number; gpsCapturedAt?: string; evidenceName?: string; evidenceType?: string; evidenceSize?: number; evidenceBlob?: Blob; checksum?: string; status: FieldQueueStatus; lastError?: string; };
const DB_NAME = "pke-field-local"; const DB_VERSION = 3; const STORE = "drafts"; const ASSIGNMENT_STORE = "assignment-cache";\nexport type FieldAssignmentCache = { cacheKey:string; principalId:string; projectId:string; cachedAt:string; assignments:Array<{id:string;title:string;status:string;priority?:string;due_at?:string|null;assignee_user_id?:string|null;owner_role_code?:string}>; };
export async function createFieldDraft(input: Omit<FieldDraft,"id"|"capturedAt"|"status"|"checksum">): Promise<FieldDraft> {
 let checksum:string|undefined;
 if(input.evidenceBlob && typeof crypto!=="undefined" && crypto.subtle){const digest=await crypto.subtle.digest("SHA-256",await input.evidenceBlob.arrayBuffer());checksum=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
 return {...input,id:crypto.randomUUID(),capturedAt:new Date().toISOString(),status:"queued",...(checksum?{checksum}:{})};
}
export function openFieldDraftDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==="undefined")return reject(new Error("IndexedDB unavailable"));const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;let s:IDBObjectStore;if(!db.objectStoreNames.contains(STORE)){s=db.createObjectStore(STORE,{keyPath:"id"});s.createIndex("projectId","projectId");s.createIndex("status","status");s.createIndex("principalId","principalId");}else{s=request.transaction!.objectStore(STORE);if(!s.indexNames.contains("principalId"))s.createIndex("principalId","principalId");}if(!db.objectStoreNames.contains(ASSIGNMENT_STORE)){const a=db.createObjectStore(ASSIGNMENT_STORE,{keyPath:"cacheKey"});a.createIndex("principalId","principalId");a.createIndex("projectId","projectId");}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error("Cannot open local draft store"));});}
export async function saveFieldDraft(draft:FieldDraft):Promise<void>{const db=await openFieldDraftDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(draft);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();}
export async function listFieldDrafts(principalId:string,projectId:string):Promise<FieldDraft[]>{const db=await openFieldDraftDb();const rows=await new Promise<FieldDraft[]>((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).index("principalId").getAll(principalId);req.onsuccess=()=>resolve(req.result as FieldDraft[]);req.onerror=()=>reject(req.error);});db.close();return rows.filter(r=>r.projectId===projectId).sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt));}
export async function deleteFieldDraft(id:string):Promise<void>{const db=await openFieldDraftDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}

export async function deleteFieldDrafts(principalId:string,projectId:string):Promise<number>{
 const db=await openFieldDraftDb();
 let deleted=0;
 await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  const store=tx.objectStore(STORE);
  const request=store.index("principalId").getAll(principalId);
  request.onsuccess=()=>{for(const row of request.result as FieldDraft[]){if(row.projectId===projectId){store.delete(row.id);deleted++;}}};
  request.onerror=()=>reject(request.error);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 db.close();return deleted;
}

export async function saveFieldAssignmentCache(principalId:string,projectId:string,assignments:FieldAssignmentCache["assignments"]):Promise<void>{
 const db=await openFieldDraftDb(),cacheKey=principalId+"::"+projectId;
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(ASSIGNMENT_STORE,"readwrite");tx.objectStore(ASSIGNMENT_STORE).put({cacheKey,principalId,projectId,cachedAt:new Date().toISOString(),assignments} satisfies FieldAssignmentCache);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();
}
export async function getFieldAssignmentCache(principalId:string,projectId:string):Promise<FieldAssignmentCache|null>{
 const db=await openFieldDraftDb(),cacheKey=principalId+"::"+projectId;
 const row=await new Promise<FieldAssignmentCache|null>((resolve,reject)=>{const tx=db.transaction(ASSIGNMENT_STORE,"readonly");const req=tx.objectStore(ASSIGNMENT_STORE).get(cacheKey);req.onsuccess=()=>resolve((req.result as FieldAssignmentCache|undefined)??null);req.onerror=()=>reject(req.error);});db.close();return row;
}
export async function deleteFieldAssignmentCache(principalId:string,projectId:string):Promise<void>{
 const db=await openFieldDraftDb(),cacheKey=principalId+"::"+projectId;
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(ASSIGNMENT_STORE,"readwrite");tx.objectStore(ASSIGNMENT_STORE).delete(cacheKey);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();
}
