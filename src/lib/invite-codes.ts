import "server-only";
import { createHash,randomInt } from "node:crypto";

export type InvitePlan="monthly"|"lifetime";

export function normalizeInviteCode(value:string){
  return value.toUpperCase().replace(/[^A-F0-9]/g,"");
}

export function hashInviteCode(value:string){
  return createHash("sha256").update(normalizeInviteCode(value)).digest("hex");
}

export function generateInviteCode(){
  return String(randomInt(100000,1000000));
}

export function inviteRegistrationUrl(code:string){
  const base=(process.env.NEXT_PUBLIC_SITE_URL||"https://estantevirtual.shop").replace(/\/+$/,"");
  return `${base}/criar-conta?codigo=${encodeURIComponent(code)}`;
}
