// Shared safety checks for the three server proxy routes.
//
// All three exist for one reason: the browser cannot reach Internet
// Archive / FunkWhale / a user's WebDAV server directly because of CORS.
// That makes them the only pieces of dustic that fetch a URL chosen by the
// caller, which is exactly the shape of an SSRF or open-proxy bug. The
// rules below are what every one of them has to pass.

/** Hostnames that never belong to a public audio source. */
const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'ip6-localhost',
	'ip6-loopback',
	'metadata',
	'metadata.google.internal',
	'instance-data'
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function ipv4ToParts(hostname: string): number[] | null {
	const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const parts = m.slice(1).map(Number);
	return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** RFC1918 and every other range that is not routable on the public net. */
function isPrivateIPv4(parts: number[]): boolean {
	const [a, b] = parts;
	if (a === 0) return true; // "this network"
	if (a === 10) return true; // RFC1918
	if (a === 127) return true; // loopback
	if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
	if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
	if (a === 192 && b === 168) return true; // RFC1918
	if (a === 192 && b === 0) return true; // IETF protocol assignments
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
	if (a >= 224) return true; // multicast + reserved
	return false;
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or null if it does not
 * parse. Handles `::` compression and a trailing dotted-quad.
 */
function parseIPv6(literal: string): number[] | null {
	let text = literal.toLowerCase();

	// A trailing dotted-quad (::ffff:169.254.169.254) becomes two groups.
	const tail = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
	if (tail) {
		const quad = ipv4ToParts(tail[1]);
		if (!quad) return null;
		const hex = [(quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]]
			.map((n) => n.toString(16))
			.join(':');
		text = text.slice(0, -tail[1].length) + hex;
	}

	const halves = text.split('::');
	if (halves.length > 2) return null;

	const toGroups = (part: string) =>
		part === '' ? [] : part.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));

	const head = toGroups(halves[0]);
	const rest = halves.length === 2 ? toGroups(halves[1]) : [];
	if ([...head, ...rest].some(Number.isNaN)) return null;

	const groups =
		halves.length === 2
			? [...head, ...Array(8 - head.length - rest.length).fill(0), ...rest]
			: head;

	return groups.length === 8 ? groups : null;
}

function isPrivateIPv6(hostname: string): boolean {
	const groups = parseIPv6(hostname.replace(/^\[|\]$/g, ''));
	// Unparseable but colon-bearing: refuse rather than guess.
	if (!groups) return true;

	if (groups.every((g) => g === 0)) return true; // ::
	if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
	if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
	if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

	// IPv4-mapped (::ffff:a9fe:a9fe) and IPv4-compatible (::a.b.c.d): the
	// embedded address is what the connection actually reaches, and URL
	// parsing rewrites the dotted form to hex, so judge it numerically.
	const leadingZero = groups.slice(0, 5).every((g) => g === 0);
	if (leadingZero && (groups[5] === 0xffff || groups[5] === 0)) {
		const v4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
		return isPrivateIPv4(v4);
	}

	return false;
}

export interface ProxyTarget {
	ok: true;
	url: URL;
}
export interface ProxyRejection {
	ok: false;
	status: number;
	message: string;
}

/**
 * Validate a caller-supplied proxy target.
 *
 * Rejects anything that is not plain http(s), carries embedded
 * credentials, or points at a loopback / private / link-local address.
 * That last one is what keeps `?url=http://169.254.169.254/...` and
 * `?url=http://10.0.0.5/admin` from turning these routes into a window
 * onto the host's own network.
 *
 * Caveat worth knowing: this inspects the literal hostname, so a public
 * name that *resolves* to a private address (DNS rebinding) still gets
 * through. Closing that needs resolve-then-connect-by-IP, which the
 * Workers runtime does not offer; on Cloudflare the edge cannot reach
 * private space anyway, so the exposure is limited to self-hosted Node
 * deployments.
 */
export function checkProxyTarget(raw: string): ProxyTarget | ProxyRejection {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, status: 400, message: 'Invalid URL' };
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return { ok: false, status: 400, message: 'Unsupported protocol' };
	}
	if (url.username || url.password) {
		return { ok: false, status: 400, message: 'Credentials in URL are not allowed' };
	}

	const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
	if (!hostname) {
		return { ok: false, status: 400, message: 'Invalid URL' };
	}
	if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
		return { ok: false, status: 403, message: 'URL not allowed' };
	}

	const v4 = ipv4ToParts(hostname);
	if (v4 && isPrivateIPv4(v4)) {
		return { ok: false, status: 403, message: 'URL not allowed' };
	}
	if (hostname.includes(':') && isPrivateIPv6(hostname)) {
		return { ok: false, status: 403, message: 'URL not allowed' };
	}

	return { ok: true, url };
}

/**
 * True when the request plausibly came from the app itself.
 *
 * `Sec-Fetch-Site` is consulted first and, when present, decides on its own.
 * The browser computes it, so it needs no hostname: dustic is open source
 * and self-hosted, and the origin the server derives depends on the adapter
 * and on any proxy in front of it. Deciding from a server-derived origin
 * would make the proxies sensitive to deployment shape for no benefit.
 *
 * `Origin` is only a fallback, for browsers that send it without Fetch
 * Metadata (Safari before 16.4). There the comparison does need our own
 * origin, so a deployment whose derived origin differs from the name in the
 * address bar would refuse those browsers — thumbnails and FunkWhale audio
 * would fail for them, and nobody else.
 *
 * Requests carrying neither are allowed: same-origin media loads
 * legitimately omit both. This is therefore a guard against a third-party
 * page pointing an <img>, <audio> or fetch() at the proxy, not against a
 * scripted client, which can send whatever headers it likes.
 */
export function isSameOriginRequest(request: Request, appOrigin?: string): boolean {
	const site = request.headers.get('sec-fetch-site');
	if (site) return site === 'same-origin';

	const origin = request.headers.get('origin');
	if (origin && appOrigin) return origin === appOrigin;

	return true;
}



/**
 * Follow redirects by hand so every hop is re-validated. `redirect: 'follow'`
 * would let an allowed host bounce the request to somewhere the checks above
 * just rejected.
 */
export async function fetchFollowingSafeRedirects(
	target: URL,
	init: RequestInit,
	options: { maxRedirects?: number; isAllowedHost?: (url: URL) => boolean } = {}
): Promise<Response | ProxyRejection> {
	const { maxRedirects = 3, isAllowedHost } = options;
	let current = target;

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const response = await fetch(current.toString(), { ...init, redirect: 'manual' });

		const isRedirect = response.status >= 300 && response.status < 400;
		const location = response.headers.get('location');
		if (!isRedirect || !location) return response;

		let next: ProxyTarget | ProxyRejection;
		try {
			next = checkProxyTarget(new URL(location, current).toString());
		} catch {
			return { ok: false, status: 502, message: 'Invalid redirect target' };
		}
		if (!next.ok) return next;
		if (isAllowedHost && !isAllowedHost(next.url)) {
			return { ok: false, status: 403, message: 'Redirect target not allowed' };
		}
		current = next.url;
	}

	return { ok: false, status: 502, message: 'Too many redirects' };
}
