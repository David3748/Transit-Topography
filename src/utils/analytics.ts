/**
 * Privacy-friendly event tracking via GoatCounter — cookie-less, no PII,
 * no consent banner required. No-ops in dev and when the GoatCounter
 * script hasn't loaded (blocked, offline, or unregistered site code).
 */

declare global {
    interface Window {
        goatcounter?: {
            count: (opts: { path: string; title?: string; event: boolean }) => void;
        };
    }
}

export function trackEvent(name: string): void {
    if (import.meta.env.DEV) return;
    try {
        window.goatcounter?.count({ path: name, event: true });
    } catch {
        // analytics must never break the app
    }
}
