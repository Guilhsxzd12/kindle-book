import { CreateAccountForm } from "@/components/CreateAccountForm";

export default async function CreateAccountPage({searchParams}:{searchParams:Promise<{codigo?:string}>}){
  const params=await searchParams;
  return <main className="oda-login-page"><CreateAccountForm initialCode={params.codigo||""}/></main>;
}
