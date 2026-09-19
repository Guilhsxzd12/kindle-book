import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

function safeNext(value?:string){return value&&value.startsWith("/")&&!value.startsWith("//")?value:undefined;}

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string;created?:string}>}){
  const params=await searchParams;const next=safeNext(params.next);const created=params.created==="1";
  const v=await getViewer();
  if(v.user&&(v.profile?.role==="admin"||v.profile?.approved))redirect(next||"/biblioteca");
  return <main className="oda-login-page"><LoginForm next={next} created={created}/></main>;
}
