import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/Sidebar";
import { getActiveOrg } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const org = await getActiveOrg();
  // Middleware already gates auth; this guards the org requirement.
  if (!org) redirect("/onboarding");

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar orgName={org.name} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">{children}</div>
      </div>
    </div>
  );
}
