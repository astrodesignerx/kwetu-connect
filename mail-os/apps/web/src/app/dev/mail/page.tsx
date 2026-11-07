import { notFound } from "next/navigation";

export default async function MailDevelopmentPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { default: MailFixture } = await import("./fixture");
  return <MailFixture />;
}
