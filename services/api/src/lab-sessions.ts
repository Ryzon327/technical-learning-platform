import {
  AppError,
  assertLabSessionTransition,
  labSessionStateLabel,
  type LabDefinition,
  type LabSession,
  type LabSessionState,
  type RequestLabSessionInput
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { mockLabProvider } from "./mock-lab-provider";
import { createServerSupabaseClient, createUserScopedSupabaseClient } from "./supabase";

const liveStates: LabSessionState[] = [
  "requested","queued","provisioning","ready","active","validating","completed",
  "cleaning","degraded","recovery_required","expired","cleanup_failed"
];

const dep = (message:string) => new AppError({
  code:"DEPENDENCY_UNAVAILABLE", message, retryable:true
});

function mapSession(row: Record<string,unknown>): LabSession {
  const state = String(row.lifecycle_state) as LabSessionState;
  return {
    id:String(row.id),
    labDefinitionStableId:String(row.lab_definition_stable_id),
    labDefinitionVersion:Number(row.lab_definition_version),
    ...(row.provider_id ? {providerId:String(row.provider_id)} : {}),
    state,
    stateLabel:labSessionStateLabel(state),
    requestedAt:String(row.requested_at),
    ...(row.ready_at ? {readyAt:String(row.ready_at)} : {}),
    ...(row.active_at ? {activeAt:String(row.active_at)} : {}),
    ...(row.last_activity_at ? {lastActivityAt:String(row.last_activity_at)} : {}),
    ...(row.expires_at ? {expiresAt:String(row.expires_at)} : {}),
    ...(row.validation_state_reference ? {validationStateReference:String(row.validation_state_reference)} : {}),
    cleanupState:String(row.cleanup_state) as LabSession["cleanupState"],
    ...(row.failure_code ? {failureCode:String(row.failure_code)} : {}),
    ...(row.failure_message ? {failureMessage:String(row.failure_message)} : {}),
    ...(row.connection_metadata_reference ? {connectionMetadataReference:String(row.connection_metadata_reference)} : {})
  };
}

function mapDefinition(row: Record<string,unknown>): LabDefinition {
  return {
    stableId:String(row.stable_id),
    version:Number(row.version),
    name:String(row.name),
    description:String(row.description ?? ""),
    missionStableId:String(row.mission_stable_id),
    competencyStableIds:Array.isArray(row.competency_stable_ids) ? row.competency_stable_ids.map(String) : [],
    requiredCapabilities:Array.isArray(row.required_capabilities) ? row.required_capabilities.map(String) : [],
    resources:Array.isArray(row.resources) ? row.resources as LabDefinition["resources"] : [],
    accessMethods:Array.isArray(row.access_methods) ? row.access_methods as LabDefinition["accessMethods"] : [],
    estimatedDurationMinutes:Number(row.estimated_duration_minutes),
    sessionLimitMinutes:Number(row.session_limit_minutes),
    validationProfileStableId:String(row.validation_profile_stable_id),
    resetStrategy:String(row.reset_strategy) as LabDefinition["resetStrategy"],
    safety:row.safety as LabDefinition["safety"],
    accessibility:row.accessibility as LabDefinition["accessibility"],
    dataPersistencePolicy:String(row.data_persistence_policy) as LabDefinition["dataPersistencePolicy"],
    publicationState:String(row.publication_state) as LabDefinition["publicationState"]
  };
}

async function loadDefinition(accessToken:string,input:RequestLabSessionInput):Promise<LabDefinition> {
  const stableId=String(input.labDefinitionStableId ?? "").trim();
  if(!stableId) throw new AppError({code:"VALIDATION_ERROR",message:"Lab definition is required",retryable:false});
  const s=createUserScopedSupabaseClient(accessToken);
  let q=s.from("lab_definitions").select("stable_id,version,name,description,mission_stable_id,competency_stable_ids,required_capabilities,resources,access_methods,estimated_duration_minutes,session_limit_minutes,validation_profile_stable_id,reset_strategy,safety,accessibility,data_persistence_policy,publication_state").eq("stable_id",stableId).eq("publication_state","published").order("version",{ascending:false}).limit(1);
  if(input.labDefinitionVersion !== undefined){
    const version=Number(input.labDefinitionVersion);
    if(!Number.isInteger(version)||version<1) throw new AppError({code:"VALIDATION_ERROR",message:"Lab definition version must be a positive integer",retryable:false});
    q=q.eq("version",version);
  }
  const {data,error}=await q.maybeSingle();
  if(error) throw dep("Unable to load lab definition");
  if(!data) throw new AppError({code:"NOT_FOUND",message:"Published lab definition not found",retryable:false});
  return mapDefinition(data as Record<string,unknown>);
}

async function transition(userId:string,id:string,from:LabSessionState,to:LabSessionState,patch:Record<string,unknown>={}):Promise<void>{
  try { assertLabSessionTransition(from,to); }
  catch { throw new AppError({code:"CONFLICT",message:`Lab session cannot move from ${from} to ${to}`,retryable:false}); }
  const s=createServerSupabaseClient();
  const {data,error}=await s.from("lab_sessions").update({lifecycle_state:to,...patch}).eq("id",id).eq("user_id",userId).eq("lifecycle_state",from).select("id").maybeSingle();
  if(error) throw dep("Unable to update lab session state");
  if(!data) throw new AppError({code:"CONFLICT",message:"Lab session changed before this operation completed",retryable:true});
}

async function saveProviderRef(userId:string,id:string,providerId:string,providerSessionId:string){
  const s=createServerSupabaseClient();
  const {error}=await s.from("lab_session_provider_references").upsert({
    lab_session_id:id,user_id:userId,provider_id:providerId,provider_session_id:providerSessionId
  },{onConflict:"lab_session_id"});
  if(error) throw dep("Unable to persist lab provider reference");
}

async function getProviderRef(userId:string,id:string):Promise<{providerId:string;providerSessionId:string}|null>{
  const s=createServerSupabaseClient();
  const {data,error}=await s.from("lab_session_provider_references").select("provider_id,provider_session_id").eq("lab_session_id",id).eq("user_id",userId).maybeSingle();
  if(error) throw dep("Unable to load lab provider reference");
  return data ? {providerId:String(data.provider_id),providerSessionId:String(data.provider_session_id)} : null;
}

export async function getLabSession(accessToken:string,id:string):Promise<LabSession>{
  const s=createUserScopedSupabaseClient(accessToken);
  const {data,error}=await s.from("lab_sessions").select("id,lab_definition_stable_id,lab_definition_version,provider_id,lifecycle_state,requested_at,ready_at,active_at,last_activity_at,expires_at,validation_state_reference,cleanup_state,failure_code,failure_message,connection_metadata_reference").eq("id",id).maybeSingle();
  if(error) throw dep("Unable to load lab session");
  if(!data) throw new AppError({code:"NOT_FOUND",message:"Lab session not found",retryable:false});
  return mapSession(data as Record<string,unknown>);
}

export async function listLabSessions(accessToken:string):Promise<LabSession[]>{
  const s=createUserScopedSupabaseClient(accessToken);
  const {data,error}=await s.from("lab_sessions").select("id,lab_definition_stable_id,lab_definition_version,provider_id,lifecycle_state,requested_at,ready_at,active_at,last_activity_at,expires_at,validation_state_reference,cleanup_state,failure_code,failure_message,connection_metadata_reference").order("requested_at",{ascending:false});
  if(error) throw dep("Unable to load lab sessions");
  return (data ?? []).map(r=>mapSession(r as Record<string,unknown>));
}

export async function requestLabSession(accessToken:string,userId:string,input:RequestLabSessionInput):Promise<LabSession>{
  const definition=await loadDefinition(accessToken,input);
  const user=createUserScopedSupabaseClient(accessToken);
  const {data:existing,error:existingError}=await user.from("lab_sessions").select("id").eq("lab_definition_stable_id",definition.stableId).in("lifecycle_state",liveStates).limit(1);
  if(existingError) throw dep("Unable to check existing lab sessions");
  if((existing ?? []).length) throw new AppError({code:"CONFLICT",message:"An active lab session already exists for this lab",retryable:false});

  const expiresAt=new Date(Date.now()+definition.sessionLimitMinutes*60000).toISOString();
  const {data:created,error:createError}=await user.from("lab_sessions").insert({
    lab_definition_stable_id:definition.stableId,
    lab_definition_version:definition.version,
    lifecycle_state:"requested",
    cleanup_state:"not_required",
    expires_at:expiresAt
  }).select("id").single();

  if(createError||!created){
    if(createError?.code==="23505") throw new AppError({code:"CONFLICT",message:"An active lab session already exists for this lab",retryable:false});
    throw dep("Unable to create lab session");
  }

  const id=String(created.id);
  writeAuditEvent({eventType:"lab.session.requested",outcome:"success",actorId:userId,targetType:"lab_session",targetId:id});

  const capacity=await mockLabProvider.getCapacity();
  if(!capacity.available){
    await transition(userId,id,"requested","queued");
    return getLabSession(accessToken,id);
  }

  await transition(userId,id,"requested","provisioning",{provider_id:mockLabProvider.providerId,cleanup_state:"pending"});

  try{
    const ps=await mockLabProvider.provision({definition,userId});
    await saveProviderRef(userId,id,ps.providerId,ps.providerSessionId);
    const readyAt=new Date().toISOString();
    await transition(userId,id,"provisioning","ready",{ready_at:readyAt,last_activity_at:readyAt,failure_code:null,failure_message:null});
    writeAuditEvent({eventType:"lab.session.ready",outcome:"success",actorId:userId,targetType:"lab_session",targetId:id,metadata:{providerId:ps.providerId}});
  }catch(error){
    await transition(userId,id,"provisioning","provisioning_failed",{
      failure_code:error instanceof AppError ? error.code : "INTERNAL_ERROR",
      failure_message:"Lab preparation failed. You can retry later."
    });
    writeAuditEvent({eventType:"lab.session.provisioning_failed",outcome:"failure",actorId:userId,targetType:"lab_session",targetId:id});
  }

  return getLabSession(accessToken,id);
}

export async function startLabSession(accessToken:string,userId:string,id:string):Promise<LabSession>{
  const session=await getLabSession(accessToken,id);
  if(session.state==="active") return session;
  if(session.state!=="ready") throw new AppError({code:"CONFLICT",message:`Lab cannot start while it is ${session.stateLabel.toLowerCase()}`,retryable:false});
  const ref=await getProviderRef(userId,id);
  if(!ref||ref.providerId!=="mock") throw dep("Lab provider session is unavailable");
  await mockLabProvider.start(ref.providerSessionId);
  const activeAt=new Date().toISOString();
  await transition(userId,id,"ready","active",{active_at:activeAt,last_activity_at:activeAt});
  writeAuditEvent({eventType:"lab.session.started",outcome:"success",actorId:userId,targetType:"lab_session",targetId:id});
  return getLabSession(accessToken,id);
}

export async function endLabSession(accessToken:string,userId:string,id:string):Promise<LabSession>{
  const session=await getLabSession(accessToken,id);
  if(session.state==="terminated") return session;
  const ref=await getProviderRef(userId,id);

  if(!ref){
    if(["requested","queued","provisioning_failed","recovery_required","expired"].includes(session.state)){
      await transition(userId,id,session.state,"terminated",{cleanup_state:"complete"});
      return getLabSession(accessToken,id);
    }
    throw dep("Lab cleanup reference is unavailable");
  }

  if(ref.providerId!=="mock") throw dep("Unsupported lab provider");
  if(session.state==="cleaning") return session;

  await transition(userId,id,session.state,"cleaning",{cleanup_state:"cleaning"});
  try{
    await mockLabProvider.destroy(ref.providerSessionId);
    await transition(userId,id,"cleaning","terminated",{cleanup_state:"complete",last_activity_at:new Date().toISOString()});
    writeAuditEvent({eventType:"lab.session.terminated",outcome:"success",actorId:userId,targetType:"lab_session",targetId:id});
  }catch{
    await transition(userId,id,"cleaning","cleanup_failed",{
      cleanup_state:"failed",
      failure_code:"DEPENDENCY_UNAVAILABLE",
      failure_message:"Lab cleanup requires operational attention. The session is no longer available."
    });
    writeAuditEvent({eventType:"lab.session.cleanup_failed",outcome:"failure",actorId:userId,targetType:"lab_session",targetId:id});
  }
  return getLabSession(accessToken,id);
}
