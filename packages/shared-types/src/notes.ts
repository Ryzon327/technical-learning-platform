export type NoteContextType = "learning_path" | "course" | "module" | "mission" | "competency" | "lab_definition" | "lab_session" | "content_asset";
export interface NoteContextReference { contextType: NoteContextType; stableId: string; version?: number; }
export interface StudentNote { id:string; title:string; body:string; contexts:NoteContextReference[]; createdAt:string; updatedAt:string; }
export interface CreateStudentNoteInput { title?:string; body?:string; contexts?:NoteContextReference[]; }
export interface UpdateStudentNoteInput { title?:string; body?:string; contexts?:NoteContextReference[]; }
export function normalizeNoteTitle(value:unknown):string { const v=String(value??"").trim(); if(v.length>200) throw new Error("Note title must be 200 characters or fewer"); return v; }
export function normalizeNoteBody(value:unknown):string { const v=String(value??""); if(v.length>100000) throw new Error("Note body is too large"); return v; }
export function noteContainsUnsafeMarkup(body:string):boolean { return /<\s*script\b|javascript\s*:|on[a-z]+\s*=/i.test(body); }
