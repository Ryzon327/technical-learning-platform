import {
  AppError,
  deriveLabValidationState,
  type LabProvider,
  type LabAccessDelivery,
  type LabResetResult,
  type LabValidationCheckResult,
  type LabValidationRunResult
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { getLabProvider } from "./lab-provider-registry";
import { getLabSession } from "./lab-sessions";
import { createServerSupabaseClient, createUserScopedSupabaseClient } from "./supabase";

const dep = (message:string) => new AppError({ code:"DEPENDENCY_UNAVAILABLE", message, retryable:true });

/**
 * Loads the authoritative persisted provider reference for a session and
 * resolves the owning provider implementation.
 *
 * Rollout policy is never consulted here: an existing session must remain
 * accessible, resettable and validatable regardless of the current rollout
 * state of its provider.
 */
async function providerRef(userId:string, sessionId:string):Promise<{providerId:string;providerSessionId:string;provider:LabProvider}> {
  const s=createServerSupabaseClient();
  const {data,error}=await s.from("lab_session_provider_references").select("provider_id,provider_session_id").eq("lab_session_id",sessionId).eq("user_id",userId).maybeSingle();
  if(error) throw dep("Unable to load lab provider reference");
  if(!data) throw new AppError({code:"NOT_FOUND",message:"Lab provider session not found",retryable:false});
  const providerId=String(data.provider_id);
  const providerSessionId=String(data.provider_session_id);
  let provider:LabProvider;
  try { provider=getLabProvider(providerId); }
  catch { throw dep("The configured lab provider is not available in this build"); }
  return { providerId, providerSessionId, provider };
}

export async function getLabAccessDelivery(accessToken:string,userId:string,sessionId:string):Promise<LabAccessDelivery>{
  const session=await getLabSession(accessToken,sessionId);
  if(!["ready","active"].includes(session.state)) throw new AppError({code:"CONFLICT",message:"Lab access is available only when the session is ready or active",retryable:false});
  const ref=await providerRef(userId,sessionId);
  const connection=await ref.provider.getConnection(ref.providerSessionId);
  return {
    sessionId,
    method:connection.method,
    endpoint:connection.endpoint,
    ...(connection.username?{username:connection.username}:{}),
    ...(connection.expiresAt||session.expiresAt?{expiresAt:connection.expiresAt??session.expiresAt}:{}),
    instructions:[
      "Use only the access method shown for this lab session.",
      "Do not attempt to access provider management interfaces.",
      "Access ends when the lab session is terminated or expires."
    ]
  };
}

export async function resetLabSession(accessToken:string,userId:string,sessionId:string):Promise<LabResetResult>{
  const session=await getLabSession(accessToken,sessionId);
  if(!["ready","active","degraded"].includes(session.state)) throw new AppError({code:"CONFLICT",message:"This lab cannot be reset in its current state",retryable:false});
  const ref=await providerRef(userId,sessionId);
  const server=createServerSupabaseClient();
  const {data:state,error:stateError}=await server.from("lab_session_runtime_state").select("reset_count").eq("lab_session_id",sessionId).maybeSingle();
  if(stateError) throw dep("Unable to read lab reset state");
  const resetCount=Number(state?.reset_count??0);
  if(resetCount>=5) throw new AppError({code:"RATE_LIMITED",message:"This lab has reached its reset limit for the current session",retryable:false});
  await ref.provider.reset(ref.providerSessionId);
  const resetAt=new Date().toISOString();
  const nextCount=resetCount+1;
  const {error:runtimeError}=await server.from("lab_session_runtime_state").upsert({lab_session_id:sessionId,user_id:userId,reset_count:nextCount,last_reset_at:resetAt},{onConflict:"lab_session_id"});
  if(runtimeError) throw dep("Unable to persist lab reset state");
  const {error:sessionError}=await server.from("lab_sessions").update({lifecycle_state:"ready",ready_at:resetAt,active_at:null,last_activity_at:resetAt,failure_code:null,failure_message:null}).eq("id",sessionId).eq("user_id",userId);
  if(sessionError) throw dep("Unable to update lab after reset");
  writeAuditEvent({eventType:"lab.session.reset",outcome:"success",actorId:userId,targetType:"lab_session",targetId:sessionId,metadata:{resetCount:nextCount}});
  return {sessionId,state:"ready",resetAt,resetCount:nextCount};
}

export async function validateLabSession(accessToken:string,userId:string,sessionId:string):Promise<LabValidationRunResult>{
  const session=await getLabSession(accessToken,sessionId);
  if(!["ready","active"].includes(session.state)) throw new AppError({code:"CONFLICT",message:"Lab validation is available only for a ready or active session",retryable:false});
  const ref=await providerRef(userId,sessionId);
  const user=createUserScopedSupabaseClient(accessToken);
  const {data:definition,error:defError}=await user.from("lab_definitions").select("validation_profile_stable_id").eq("stable_id",session.labDefinitionStableId).eq("version",session.labDefinitionVersion).maybeSingle();
  if(defError) throw dep("Unable to load lab validation reference");
  if(!definition) throw new AppError({code:"NOT_FOUND",message:"Lab definition not found",retryable:false});
  const profileStableId=String(definition.validation_profile_stable_id);
  const {data:checks,error:checksError}=await user.from("lab_validation_checks").select("stable_id,probe_id,title,explanation,required,sort_order").eq("profile_stable_id",profileStableId).eq("publication_state","published").order("sort_order",{ascending:true});
  if(checksError) throw dep("Unable to load lab validation checks");
  if(!(checks??[]).length) throw new AppError({code:"NOT_FOUND",message:"Published validation checks not found",retryable:false});

  const results:LabValidationCheckResult[]=[];
  for(const check of checks??[]){
    try{
      // Deterministic, provider-executed probe. Pass/fail derives only from this
      // structured result; no model or heuristic participates in grading.
      const probe=await ref.provider.runValidationProbe(ref.providerSessionId,String(check.probe_id));
      results.push({checkStableId:String(check.stable_id),title:String(check.title),required:Boolean(check.required),passed:probe.passed,state:probe.passed?"passed":"failed",explanation:probe.passed?String(check.explanation):`${String(check.explanation)} This requirement is not complete yet.`});
    }catch{
      results.push({checkStableId:String(check.stable_id),title:String(check.title),required:Boolean(check.required),state:"technical_error",explanation:"The validator could not complete this check. This is a technical error and does not count as a student failure."});
    }
  }

  const state=deriveLabValidationState(results);
  const checkedAt=new Date().toISOString();
  const server=createServerSupabaseClient();
  const {data:run,error:runError}=await server.from("lab_validation_runs").insert({lab_session_id:sessionId,user_id:userId,profile_stable_id:profileStableId,state,checked_at:checkedAt}).select("id").single();
  if(runError||!run) throw dep("Unable to persist lab validation run");
  const runId=String(run.id);
  const {error:resultError}=await server.from("lab_validation_results").insert(results.map((result)=>({validation_run_id:runId,lab_session_id:sessionId,user_id:userId,check_stable_id:result.checkStableId,title:result.title,required:result.required,state:result.state,passed:result.passed??null,explanation:result.explanation})));
  if(resultError) throw dep("Unable to persist lab validation results");
  await server.from("lab_sessions").update({validation_state_reference:runId,last_activity_at:checkedAt}).eq("id",sessionId).eq("user_id",userId);
  writeAuditEvent({eventType:"lab.session.validated",outcome:state==="technical_error"?"failure":"success",actorId:userId,targetType:"lab_session",targetId:sessionId,metadata:{validationRunId:runId,state}});
  return {id:runId,sessionId,state,checkedAt,results};
}

export async function listLabValidationRuns(accessToken:string,sessionId:string):Promise<LabValidationRunResult[]>{
  await getLabSession(accessToken,sessionId);
  const user=createUserScopedSupabaseClient(accessToken);
  const {data:runs,error:runsError}=await user.from("lab_validation_runs").select("id,state,checked_at").eq("lab_session_id",sessionId).order("checked_at",{ascending:false});
  if(runsError) throw dep("Unable to load lab validation history");
  const output:LabValidationRunResult[]=[];
  for(const run of runs??[]){
    const {data:results,error}=await user.from("lab_validation_results").select("check_stable_id,title,required,state,passed,explanation").eq("validation_run_id",String(run.id)).order("created_at",{ascending:true});
    if(error) throw dep("Unable to load lab validation results");
    output.push({id:String(run.id),sessionId,state:String(run.state) as LabValidationRunResult["state"],checkedAt:String(run.checked_at),results:(results??[]).map((r)=>({checkStableId:String(r.check_stable_id),title:String(r.title),required:Boolean(r.required),...(r.passed===null?{}:{passed:Boolean(r.passed)}),state:String(r.state) as LabValidationCheckResult["state"],explanation:String(r.explanation)}))});
  }
  return output;
}
