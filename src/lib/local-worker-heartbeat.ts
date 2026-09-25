import "server-only";
import {createAdminSupabaseClient} from "@/lib/supabase/admin";

export async function touchLocalWorker(){
  try{
    const db=createAdminSupabaseClient();
    await db.from("app_integrations").upsert({
      provider:"local_worker",
      refresh_token:null,
      account_email:"LeituraVerso Worker",
      updated_at:new Date().toISOString()
    },{onConflict:"provider"});
  }catch(error){
    console.warn("[local-worker-heartbeat]",error instanceof Error?error.message:String(error));
  }
}
