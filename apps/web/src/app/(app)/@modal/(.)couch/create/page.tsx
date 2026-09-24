import { redirect } from "next/navigation";
import { CreateCouchDialog } from "@/components/create-couch-dialog";
import { getCurrentUser } from "@/lib/session";

// Soft navigation to /couch/create (a link from inside the app) opens the form
// over the current page. A direct visit or refresh renders the full page instead.
export default async function CreateCouchModal() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return <CreateCouchDialog />;
}
