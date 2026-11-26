import { escapeHtml } from '../../mail/templates/escape-html';

/** Link types the email landing page supports (research R3, R4). */
export const LINK_TYPES = ['verify-email', 'reset-password'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const TITLES: Readonly<Record<LinkType, string>> = {
  'verify-email': 'Verify your email',
  'reset-password': 'Reset your password',
};

/** Type guard for supported link types. */
export function isLinkType(value: string): value is LinkType {
  return (LINK_TYPES as readonly string[]).includes(value);
}

/** The deep link that opens the app, e.g. `flashtrainer://verify-email?token=…`. */
export function deepLinkFor(scheme: string, type: LinkType, token: string): string {
  return `${scheme}://${type}?token=${encodeURIComponent(token)}`;
}

function shell(title: string, body: string, head = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Flash Trainer</title>
${head}<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 48px 16px;
         background: #f6f7f9; color: #1d1f23; text-align: center; }
  main { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px;
         padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  a.button { display: inline-block; margin-top: 16px; padding: 12px 24px; border-radius: 8px;
             background: #2f6fed; color: #fff; text-decoration: none; font-weight: 600; }
  p.hint { color: #5b6170; font-size: 14px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/**
 * Landing page for an email link: immediately tries to open the app, with a button as a
 * fallback (some browsers only follow custom-scheme links on a tap). No JavaScript, so it
 * works under the production Content-Security-Policy. It never changes any state.
 */
export function landingPage(type: LinkType, deepLink: string): string {
  const href = escapeHtml(deepLink);
  return shell(
    TITLES[type],
    `<h1>${escapeHtml(TITLES[type])}</h1>
<p>Opening the Flash Trainer app…</p>
<a class="button" href="${href}">Open Flash Trainer</a>
<p class="hint">If nothing happens, open this link on the phone where the app is installed.</p>`,
    `<meta http-equiv="refresh" content="0;url=${href}">\n`,
  );
}

/** Error page for an unknown link type or a link without a token. */
export function errorPage(message: string): string {
  return shell('Link not valid', `<h1>Link not valid</h1><p>${escapeHtml(message)}</p>`);
}
