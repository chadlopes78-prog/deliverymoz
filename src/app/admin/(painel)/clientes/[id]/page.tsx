import { redirect } from "next/navigation";

export default async function LegacyCustomer({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/utilizadores/${(await params).id}`);
}
