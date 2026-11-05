import { notFound, redirect } from "next/navigation";
import { loadVersion } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function ApiIndex({ params }: PageProps<"/apis/[slug]">) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const found = await loadVersion(user, slug, "latest");
  if (!found) {
    if (!user) redirect(`/login?next=/apis/${slug}`);
    notFound();
  }
  const v = found.version;
  redirect(`/apis/${slug}/${v.channel === "main" ? "main" : v.version}`);
}
