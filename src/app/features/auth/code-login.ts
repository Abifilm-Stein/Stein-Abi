import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { formatCode, isCompleteCode, isValidCode, normalizeCode } from '../../core/account/account';
import { DEMO_CODES, SessionService, SignInResult } from '../../core/account/session.service';
import { isDemoMode } from '../../core/runtime-config';

@Component({
  selector: 'app-code-login',
  template: `
    <div class="card mx-auto max-w-md p-6">
      <h1 class="mb-1 text-2xl font-bold">Anmelden</h1>
      <p class="mb-6 text-sm text-muted">
        Gib den persönlichen Code ein, den du vom Abifilm-Team bekommen hast. Ein Konto musst
        du nicht anlegen — der Code ist deine Anmeldung.
      </p>

      <form (ngSubmit)="submit()" novalidate>
        <label for="code" class="field-label">Dein Code</label>
        <input
          id="code"
          name="code"
          class="field-input text-center font-mono text-lg tracking-[0.2em] uppercase"
          inputmode="text"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="ABCD-EFGH-JKMN"
          [value]="display()"
          (input)="onInput($event)"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? 'code-error' : 'code-hint'"
        />

        @if (error()) {
          <p id="code-error" class="field-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{{ error() }}</span>
          </p>
        } @else {
          <p id="code-hint" class="mt-1.5 text-xs text-muted">
            12 Zeichen, Bindestriche und Groß-/Kleinschreibung sind egal.
          </p>
        }

        <label class="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            class="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            [checked]="remember()"
            (change)="remember.set(!remember())"
          />
          <span>
            Angemeldet bleiben
            <span class="mt-0.5 block text-xs text-muted">
              Nur auf deinem eigenen Gerät. An einem Schul- oder Familienrechner würde sonst
              die nächste Person deine Beiträge sehen.
            </span>
          </span>
        </label>

        <button
          type="submit"
          class="btn btn-primary mt-5 w-full"
          [disabled]="session.pending() || !complete()"
        >
          {{ session.pending() ? 'Wird geprüft…' : 'Anmelden' }}
        </button>
      </form>

      <p class="mt-5 text-xs text-muted">
        Code verloren oder er funktioniert nicht? Melde dich beim Abifilm-Team, wir stellen
        dir einen neuen aus.
      </p>

      @if (demoMode) {
        <div class="mt-5 rounded-lg bg-warn-soft p-3 text-xs" style="color: var(--warn)">
          <p class="mb-2">
            <strong>Demo-Modus.</strong> Diese Codes funktionieren. Die Prüfung läuft im
            Browser und ist <strong>keine Sicherheitsmaßnahme</strong> — produktiv vergleicht
            der Server den Hash und begrenzt Versuche.
          </p>
          <ul class="space-y-1">
            @for (entry of demoCodes; track entry.code) {
              <li>
                <button
                  type="button"
                  class="font-mono underline"
                  (click)="useDemoCode(entry.code)"
                >
                  {{ entry.code }}
                </button>
                — {{ entry.name }}
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class CodeLogin {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly demoMode = isDemoMode;
  protected readonly demoCodes = DEMO_CODES;

  private readonly raw = signal('');
  protected readonly remember = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Grouped while typing, so the field mirrors the printed slip. */
  protected readonly display = computed(() => formatCode(this.raw()));
  protected readonly complete = computed(() => isCompleteCode(this.raw()));

  constructor() {
    effect(() => {
      if (this.session.isSignedIn()) void this.goToTarget();
    });
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.raw.set(normalizeCode(input.value));
    this.error.set(null);
    // Reflect the normalised value immediately; `display()` drives the field
    // but the DOM has already applied the raw keystroke.
    input.value = this.display();
  }

  protected useDemoCode(code: string): void {
    this.raw.set(normalizeCode(code));
    void this.submit();
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (!isValidCode(this.raw())) {
      this.error.set(
        'Dieser Code enthält Zeichen, die nicht vorkommen können. Bitte prüfe die Schreibweise.',
      );
      return;
    }

    const result = await this.session.signIn(this.raw(), this.remember());
    if (result !== 'ok') this.error.set(messageFor(result));
  }

  private async goToTarget(): Promise<void> {
    const target = new URLSearchParams(location.search).get('weiter');
    // Only same-origin relative paths, never an absolute URL from the query
    // string -- otherwise this is an open redirect.
    const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : '/upload';
    await this.router.navigateByUrl(safe);
  }
}

function messageFor(result: SignInResult): string {
  switch (result) {
    case 'unknown-code':
      return 'Diesen Code kennen wir nicht. Bitte prüfe die Schreibweise.';
    case 'invalid-format':
      return 'Der Code ist unvollständig.';
    default:
      return 'Die Anmeldung hat nicht funktioniert. Bitte versuche es gleich noch einmal.';
  }
}
