import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isDemoMode } from './core/runtime-config';
import { SiteFooter } from './shared/site-footer';
import { SiteHeader } from './shared/site-header';

@Component({
  imports: [RouterOutlet, SiteHeader, SiteFooter],
  selector: 'app-root',
  templateUrl: './app.html',
  host: { class: 'flex min-h-dvh flex-col' },
})
export class App {
  protected readonly demoMode = isDemoMode;
}
