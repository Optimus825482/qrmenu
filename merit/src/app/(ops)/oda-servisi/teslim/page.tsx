import { redirect } from "next/navigation";

export default function TeslimRedirectPage() {
  redirect("/oda-servisi?sekme=teslim");
}
