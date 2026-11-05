import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpecEditor } from "@/components/spec/spec-editor";
import { requireStaff } from "@/lib/auth/current-user";
import { getSource } from "@/lib/source";

export const metadata: Metadata = { title: "Edit spec" };

export default async function EditPage({ params }: PageProps<"/apis/[slug]/edit">) {
  await requireStaff("designer");
  const { slug } = await params;
  const source = getSource();
  const sha = await source.resolve(source.defaultBranch);
  // Edit the file as it is on the default branch right now, not the last synced copy.
  const text = await source.readFile(sha, `apis/${slug}/openapi.yaml`);
  if (text === null) notFound();
  return <SpecEditor slug={slug} initial={text} isNew={false} sourceLabel={`${source.defaultBranch} @ ${sha.slice(0, 7)}`} sourceKind={source.kind} />;
}
