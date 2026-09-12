import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Terms of Service -- SignalIQ" };

export default function TermsPage() {
  const filePath = path.join(process.cwd(), "legal", "terms.md");
  const markdown = fs.readFileSync(filePath, "utf-8");
  const html = marked.parse(markdown, { async: false });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardContent className="pt-6">
          <div className="legal-content" dangerouslySetInnerHTML={{ __html: html }} />
        </CardContent>
      </Card>
    </main>
  );
}
