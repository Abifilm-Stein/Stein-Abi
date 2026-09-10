/**
 * Deploy-time configuration, injected by the inline script in `index.html`.
 *
 * Keeping it out of the bundle means one build artifact serves every
 * environment. Nothing secret belongs here -- it ships to the browser.
 */
export interface RuntimeConfig {
  /** tus 1.0.0 creation endpoint for resumable uploads. */
  uploadEndpoint: string;
  /** Base URL of the submissions API. */
  apiBaseUrl: string;
}

declare global {
  interface Window {
    __STEINABI__?: Partial<RuntimeConfig>;
  }
}

const injected = (typeof window !== 'undefined' && window.__STEINABI__) || {};

export const runtimeConfig: RuntimeConfig = {
  uploadEndpoint: injected.uploadEndpoint?.trim() ?? '',
  apiBaseUrl: injected.apiBaseUrl?.trim() ?? '',
};

/**
 * True while no backend is configured. In this state uploads are simulated,
 * the access code is checked in the browser and submissions live in
 * `localStorage` -- none of which is secure. The UI shows a permanent banner
 * so a demo build can never be mistaken for a production deployment.
 */
export const isDemoMode = runtimeConfig.uploadEndpoint === '' || runtimeConfig.apiBaseUrl === '';
