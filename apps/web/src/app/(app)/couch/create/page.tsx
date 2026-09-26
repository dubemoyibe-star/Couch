import { redirect } from "next/navigation";
import { Armchair } from "lucide-react";
import { Card } from "@/components/ui/card";
import { parseDefaultVisibility } from "@/lib/default-visibility";
import { getCurrentUser } from "@/lib/session";
import { CreateCouchForm } from "./create-couch-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create a couch" };

export default async function CreateCouchPage({ searchParams }: PageProps<"/couch/create">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <Card as="section" className="flex w-full max-w-md flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
          >
            <Armchair className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-text">Create a couch</h1>
          <p className="text-sm text-text-muted">Give it a name, then invite friends with a link.</p>
        </div>
        <CreateCouchForm defaultVisibility={parseDefaultVisibility((await searchParams).visibility)} />
      </Card>
    </div>
  );
}
