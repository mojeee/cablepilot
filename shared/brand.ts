// Product constants shared by the main process and the renderer: links, the trial length and the
// public key that verifies licence keys (LICENSE.md, sections 2 and 3).

export const SITE_URL = 'https://cablepilot.agentflowbind.com';
export const REPO_URL = 'https://github.com/mojeee/cablepilot';
/** The website's pricing section, where a licence key is requested. */
export const BUY_URL = `${SITE_URL}/#pricing`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE.md`;

/** Days of free use from the first start on a computer (LICENSE.md, section 2.3). */
export const TRIAL_DAYS = 30;

/** Ed25519 public key that verifies licence keys. The private key never enters the repository (scripts/make-license.mjs). */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAStlPODW/X6RcMdIi5IGvBvnyQq6QoRQUw6fzfZZqlhQ=
-----END PUBLIC KEY-----`;
