import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Book,BookRequest,Category,Profile } from "@/lib/types";

export default async function AdminPage(){
  const {supabase}=await requireAdmin();
  const admin=createAdminSupabaseClient();
  const [{data:books},{data:coverlessBooks},{data:categories},{data:profiles},{data:requests},{data:telegram}]=await Promise.all([
    supabase.from("books").select("*,categories(name)").or("cover_url.is.null,description.is.null,author.eq.,title.eq.").order("created_at",{ascending:false}).limit(500),
    supabase.from("books").select("*,categories(name)").is("cover_url",null).order("created_at",{ascending:false}).limit(1000),
    supabase.from("categories").select("*").order("name"),
    admin.from("profiles").select("id,email,full_name,username,role,approved").order("created_at",{ascending:false}),
    admin.from("book_requests").select("*").order("created_at",{ascending:false}),
    admin.from("telegram_accounts").select("user_id,username")
  ]);
  const profileMap=new Map((profiles||[]).map(p=>[p.id,p]));
  const telegramMap=new Map((telegram||[]).map(row=>[row.user_id,row.username]));
  const requestRows=(requests||[]).map(request=>({...request,requester_name:profileMap.get(request.user_id)?.full_name||null,requester_email:profileMap.get(request.user_id)?.email||null,telegram_username:telegramMap.get(request.user_id)||null})) as BookRequest[];
  return <AppShell><main className="container admin-page"><div className="page-head"><div><span className="eyebrow">GESTÃO DO ACERVO</span><h1>Painel administrativo</h1><p>Pedidos, correções do acervo, categorias, usuários e Google Drive.</p></div></div><AdminDashboard initialBooks={(books||[]) as Book[]} initialCoverlessBooks={(coverlessBooks||[]) as Book[]} initialCategories={(categories||[]) as Category[]} initialProfiles={(profiles||[]) as Profile[]} initialRequests={requestRows}/></main></AppShell>;
}
