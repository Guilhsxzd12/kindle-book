import "server-only";
import { createHash,randomBytes } from "node:crypto";

export type InvitePlan="monthly"|"lifetime";

export function normalizeInviteCode(value:string){
  return value.toUpperCase().replace(/[^A-F0-9]/g,"");
}

export function hashInviteCode(value:string){
  return createHash("sha256").update(normalizeInviteCode(value)).digest("hex");
}

export function generateInviteCode(){
  const raw=randomBytes(16).toString("hex").toUpperCase();
  return raw.match(/.{1,8}/g)?.join("-")||raw;
}

export function inviteRegistrationUrl(code:string){
  const base=(process.env.NEXT_PUBLIC_SITE_URL||"https://estantevirtual.shop").replace(/\/+$/,"");
  return `${base}/criar-conta?codigo=${encodeURIComponent(code)}`;
}
