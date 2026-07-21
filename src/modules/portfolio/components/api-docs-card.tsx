import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  baseUrl: string;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs">
      <code>{children}</code>
    </pre>
  );
}

/**
 * The API's own documentation, rendered in-app rather than a separate file
 * that would drift the first time an endpoint changed — this is read by
 * whoever wires up neodott.com, which today is the same person reading this
 * page.
 */
export function ApiDocsCard({ baseUrl }: Props) {
  const exampleKey = 'YOUR_API_KEY';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Using the API from neodott.com</CardTitle>
        <CardDescription>
          Read-only, JSON. Every request needs the API key above in an <code>X-API-Key</code> header. Only
          published projects are ever returned — a draft never reaches this API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-1.5">
          <p className="font-medium">List published projects</p>
          <Code>{`GET ${baseUrl}/api/public/portfolio\nX-API-Key: ${exampleKey}`}</Code>
          <Code>{`curl -H "X-API-Key: ${exampleKey}" \\\n  ${baseUrl}/api/public/portfolio`}</Code>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">A single project, by slug</p>
          <Code>{`GET ${baseUrl}/api/public/portfolio/{slug}\nX-API-Key: ${exampleKey}`}</Code>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">Response shape</p>
          <Code>{`{
  "title": "Acme Rebrand",
  "slug": "acme-rebrand",
  "shortDescription": "A full brand refresh for Acme.",
  "aboutDescription": "The long write-up...",
  "category": "Branding",
  "technologies": [{ "name": "WordPress", "slug": "wordpress" }],
  "mainImageUrl": "${baseUrl}/api/public/portfolio/images/...",
  "images": ["${baseUrl}/api/public/portfolio/images/..."],
  "websiteUrl": "https://acme.com",
  "isLive": true,
  "publishedAt": "2026-07-21T00:00:00.000Z"
}`}</Code>
          <p className="text-muted-foreground">
            The list endpoint returns an array of the same shape. <code>websiteUrl</code> is only present when{' '}
            <code>isLive</code> is <code>true</code>.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">Images</p>
          <p className="text-muted-foreground">
            <code>mainImageUrl</code> and every URL in <code>images</code> are permanent — link to them
            directly, no signing or expiry to handle. They don&apos;t need the API key; only the JSON
            endpoints above do.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">Rate limit &amp; errors</p>
          <p className="text-muted-foreground">
            Requests are rate-limited per IP; a burst returns <code>429</code>. A missing or wrong key returns{' '}
            <code>401</code>. An unknown slug returns <code>404</code>.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
