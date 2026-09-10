import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessService } from '../../core/access/access.service';
import { isDemoMode } from '../../core/runtime-config';

@Component({
  selector: 'app-access-gate',
  imports: [FormsModule],
  template: `
    <div class="card mx-auto max-w-md p-6">
      <h2 class="mb-1 text-xl font-bold">Zugangscode</h2>
      <p class="mb-5 text-sm text-muted">
        Den Code hat euer Abifilm-Team über die Stufenverteiler geschickt. Über den
        Einladungslink ist er schon eingetragen.
      </p>

      <form (ngSubmit)="submit()">
        <label for="code" class="field-label">Code</label>
        <input
          id="code"
          name="code"
          class="field-input font-mono tracking-widest uppercase"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          [(ngModel)]="code"
          [attr.aria-invalid]="failed() ? 'true' : null"
          [attr.aria-describedby]="failed() ? 'code-error' : null"
        />

        @if (failed()) {
          <p id="code-error" class="field-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>Dieser Code stimmt nicht. Bitte prüfe die Schreibweise.</span>
          </p>
        }

        <button type="submit" class="btn btn-primary mt-4 w-full" [disabled]="access.checking()">
          {{ access.checking() ? 'Prüfen…' : 'Weiter zum Upload' }}
        </button>
      </form>

      @if (demoMode) {
        <p class="mt-4 rounded-lg bg-warn-soft p-3 text-xs" style="color: var(--warn)">
          Demo-Modus: Der Code lautet <strong class="font-mono">ABIFILM26</strong>. Er wird im
          Browser geprüft und schützt nichts — produktiv übernimmt das der Server.
        </p>
      }
    </div>
  `,
})
export class AccessGate {
  protected readonly access = inject(AccessService);
  protected readonly demoMode = isDemoMode;

  protected code = '';
  protected readonly failed = signal(false);

  protected async submit(): Promise<void> {
    this.failed.set(false);
    const unlocked = await this.access.unlock(this.code);
    if (!unlocked) this.failed.set(true);
  }
}
