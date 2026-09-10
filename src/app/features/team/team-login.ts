import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { isDemoMode } from '../../core/runtime-config';

@Component({
  selector: 'app-team-login',
  imports: [FormsModule],
  template: `
    <div class="card mx-auto max-w-md p-6">
      <h1 class="mb-1 text-2xl font-bold">Team-Login</h1>
      <p class="mb-6 text-sm text-muted">Nur für das Abifilm-Team des Jahrgangs.</p>

      <form (ngSubmit)="submit()">
        <div class="mb-4">
          <label for="email" class="field-label">E-Mail</label>
          <input
            id="email"
            name="email"
            type="email"
            class="field-input"
            autocomplete="email"
            [(ngModel)]="email"
          />
        </div>

        <div class="mb-4">
          <label for="password" class="field-label">Passwort</label>
          <input
            id="password"
            name="password"
            type="password"
            class="field-input"
            autocomplete="current-password"
            [(ngModel)]="password"
            [attr.aria-invalid]="failed() ? 'true' : null"
            [attr.aria-describedby]="failed() ? 'login-error' : null"
          />
        </div>

        @if (failed()) {
          <p id="login-error" class="field-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>E-Mail oder Passwort stimmen nicht.</span>
          </p>
        }

        <button type="submit" class="btn btn-primary mt-2 w-full" [disabled]="auth.pending()">
          {{ auth.pending() ? 'Anmelden…' : 'Anmelden' }}
        </button>
      </form>

      @if (demoMode) {
        <p class="mt-5 rounded-lg bg-warn-soft p-3 text-xs" style="color: var(--warn)">
          <strong>Demo-Modus.</strong> Anmeldung mit
          <span class="font-mono">team&#64;example.de</span> /
          <span class="font-mono">abifilm</span>. Die Prüfung läuft im Browser und ist
          <strong>keine Sicherheitsmaßnahme</strong> — produktiv muss der Server die Sitzung
          ausgeben und die Rolle bei jedem Zugriff durchsetzen.
        </p>
      }
    </div>
  `,
})
export class TeamLogin {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly demoMode = isDemoMode;
  protected email = '';
  protected password = '';
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.isSignedIn()) void this.router.navigate(['/team/uebersicht']);
    });
  }

  protected async submit(): Promise<void> {
    this.failed.set(false);
    const ok = await this.auth.signIn(this.email, this.password);
    if (!ok) this.failed.set(true);
  }
}
