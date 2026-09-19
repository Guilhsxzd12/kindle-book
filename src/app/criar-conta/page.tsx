import { redirect } from "next/navigation";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { getViewer } from "@/lib/auth";

export default async function CreateAccountPage({searchParams}:{searchParams:Promise<{codigo?:string}>}){
  const params=await searchParams;
  const viewer=await getViewer();
  if(viewer.user)redirect("/biblioteca");
  return <main className="oda-login-page"><CreateAccountForm initialCode={params.codigo||""}/></main>;
}
