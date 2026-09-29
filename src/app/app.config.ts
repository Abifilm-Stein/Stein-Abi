import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { HttpMediaGateway, LocalMediaGateway, MediaGateway } from './core/media/media-gateway';
import { isDemoMode } from './core/runtime-config';
import { GcsUploadTarget } from './core/upload/gcs-upload-target';
import { MockUploadTarget } from './core/upload/mock-upload-target';
import { UploadTarget } from './core/upload/upload-target';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withFetch()),

    // Backend bindings. Without a configured API the app runs fully
    // self-contained so the flow can be reviewed before infrastructure exists.
    { provide: UploadTarget, useClass: isDemoMode ? MockUploadTarget : GcsUploadTarget },
    { provide: MediaGateway, useClass: isDemoMode ? LocalMediaGateway : HttpMediaGateway },
  ],
};
