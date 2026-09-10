import { Routes } from '@angular/router';
import { sessionGuard } from './core/account/session.service';
import { teamGuard } from './core/auth/auth.service';
import { Home } from './features/home/home';
import { UploadPage } from './features/upload/upload-page';

const SUFFIX = ' – SteinAbi';

/**
 * `/` and `/upload` load eagerly: they are the entire student path and must
 * not wait on a second chunk. Everything else is lazy.
 */
export const routes: Routes = [
  { path: '', component: Home, title: 'Fotos & Videos gesucht' + SUFFIX },
  {
    path: 'upload',
    component: UploadPage,
    title: 'Hochladen' + SUFFIX,
    canActivate: [sessionGuard],
  },
  {
    path: 'anmelden',
    title: 'Anmelden' + SUFFIX,
    loadComponent: () => import('./features/auth/code-login').then((m) => m.CodeLogin),
  },
  {
    path: 'meine-beitraege',
    title: 'Meine Beiträge' + SUFFIX,
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/mine/my-submissions').then((m) => m.MySubmissions),
  },
  {
    path: 'upload/danke',
    title: 'Danke' + SUFFIX,
    loadComponent: () => import('./features/upload/thanks').then((m) => m.Thanks),
  },
  {
    path: 'datenschutz',
    title: 'Datenschutzerklärung' + SUFFIX,
    loadComponent: () => import('./features/legal/privacy').then((m) => m.Privacy),
  },
  {
    path: 'impressum',
    title: 'Impressum' + SUFFIX,
    loadComponent: () => import('./features/legal/imprint').then((m) => m.Imprint),
  },
  {
    path: 'einwilligung',
    title: 'Einwilligung der Erziehungsberechtigten' + SUFFIX,
    loadComponent: () =>
      import('./features/legal/parental-consent').then((m) => m.ParentalConsent),
  },
  {
    path: 'team',
    title: 'Team-Login' + SUFFIX,
    loadComponent: () => import('./features/team/team-login').then((m) => m.TeamLogin),
  },
  {
    path: 'team/uebersicht',
    title: 'Beiträge' + SUFFIX,
    canActivate: [teamGuard],
    loadComponent: () => import('./features/team/team-dashboard').then((m) => m.TeamDashboard),
  },
  {
    path: 'team/rueckzuege',
    title: 'Rückzugsanträge' + SUFFIX,
    canActivate: [teamGuard],
    loadComponent: () =>
      import('./features/team/withdrawal-requests').then((m) => m.WithdrawalRequests),
  },
  {
    path: '**',
    title: 'Seite nicht gefunden' + SUFFIX,
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
