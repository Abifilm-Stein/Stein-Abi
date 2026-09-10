import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { isDemoMode } from './core/runtime-config';
import {
  HttpSubmissionGateway,
  LocalSubmissionGateway,
  SubmissionGateway,
} from './core/submissions/submission-gateway';
import { MockUploadTarget } from './core/upload/mock-upload-target';
import { TusUploadTarget } from './core/upload/tus-upload-target';
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

    // Backend bindings. Without a configured endpoint the app runs fully
    // self-contained so the flow can be reviewed before infrastructure exists.
    { provide: UploadTarget, useClass: isDemoMode ? MockUploadTarget : TusUploadTarget },
    {
      provide: SubmissionGateway,
      useClass: isDemoMode ? LocalSubmissionGateway : HttpSubmissionGateway,
    },
  ],
};
