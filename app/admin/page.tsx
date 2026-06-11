import { getAdminUser } from "@/lib/admin/auth";
import LoginScreen from "./_components/LoginScreen";
import CommandCenter from "./_components/CommandCenter";

// /admin is the Command Center (Overview in the BloomOS sidebar). Unauthed
// visitors get the login screen in the same slot — middleware deliberately
// leaves /admin itself ungated so this page can host both states. The
// previous client-side dashboard lives on at /admin/legacy until its tables
// move into their module pages.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getAdminUser();
  if (!user) return <LoginScreen />;
  return <CommandCenter />;
}
