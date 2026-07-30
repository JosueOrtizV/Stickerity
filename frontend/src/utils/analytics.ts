declare global {
  interface Window {
    dataLayer: any[];
  }
}

export function getDomainFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'invalid_url';
  }
}

export function trackEvent(eventName: string, payload: Record<string, any> = {}): void {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...payload,
      timestamp: new Date().toISOString()
    });

    if (import.meta.env.DEV) {
      console.log(`[Analytics Track] ${eventName}:`, payload);
    }
  }
}
