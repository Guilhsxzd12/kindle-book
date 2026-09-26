import { requireApproved } from "@/lib/auth";
import { StableSiteShell } from "@/components/StableSiteShell";
import { CloudflareLibrary } from "@/components/CloudflareLibrary";

type LibraryQuery={q?:string;categoria?:string;pagina?:string;todos?:string};

export default async function LibraryPage({searchParams}:{searchParams:Promise<LibraryQuery>}){
  const {profile}=await requireApproved();
  const {q="",categoria="",pagina="1",todos=""}=await searchParams;
  const parsed=Number.parseInt(pagina,10);
  const page=Number.isFinite(parsed)&&parsed>0?parsed:1;
  const displayName=(profile.full_name?.split(" ")[0]||profile.username||"Leitor").trim();

  return <StableSiteShell isAdmin={profile.role==="admin"}>
    <CloudflareLibrary
      q={q.trim()}
      categoria={categoria.trim()}
      pagina={page}
      todos={todos==="1"}
      displayName={displayName}
    />
  </StableSiteShell>;
}
