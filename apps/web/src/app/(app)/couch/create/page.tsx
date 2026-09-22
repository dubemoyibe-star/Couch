import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { CreateCouchForm } from "./create-couch-form";

export default async function CreateCouchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create a couch</h1>
      <CreateCouchForm />
    </div>
  );
}
