import type { Metadata } from "next";
import { TagsClient } from "./tags-client";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  return <TagsClient />;
}
