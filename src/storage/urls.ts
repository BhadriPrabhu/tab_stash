export function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        // Lowercase protocol and host, keep path and query as-is
        u.protocol = u.protocol.toLowerCase();
        u.hostname = u.hostname.toLowerCase();
        
        let path = u.pathname;
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        u.pathname = path;
        u.hash = ''; // strip hash
        return u.toString();
    } catch {
        // Fallback for invalid URLs
        let clean = url.toLowerCase();
        clean = clean.split('#')[0];
        if (clean.endsWith('/')) clean = clean.slice(0, -1);
        return clean;
    }
}