// Canonical-host redirect: send the stable Pages subdomain to the apex domain
// so Google never indexes a duplicate. Per-deploy preview hashes
// (e.g. abc123.isitpolite.pages.dev) pass through unchanged for testing.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'isitpolite.pages.dev') {
    url.hostname = 'isitpolite.com';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
