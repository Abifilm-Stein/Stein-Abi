import { Component, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Account } from '../../core/account/account';
import { CATEGORIES, GRADES, gradeLabel } from '../../core/config';
import { SubmissionMetadata } from '../../core/models';

@Component({
  selector: 'app-submission-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <form class="card p-5 sm:p-6" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
      <h2 class="mb-1 text-xl font-bold">Wer und was ist zu sehen?</h2>
      <p class="mb-5 text-sm text-muted">
        Ohne diese Angaben landen die Dateien als namenloser Haufen beim Filmteam. Du kannst
        das Formular ausfüllen, während die Dateien noch hochladen.
      </p>

      <!-- Name and class come from the signed-in account, so they are shown
           rather than asked for. One field fewer on a phone keyboard. -->
      <p class="mb-6 rounded-lg bg-primary-soft px-3 py-2 text-sm">
        Wird hochgeladen als
        <strong class="font-semibold">{{ account().displayName }}</strong>
        <span class="text-muted">({{ account().schoolClass }})</span>
      </p>

      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="category" class="field-label">Anlass</label>
          <select
            id="category"
            class="field-input"
            formControlName="category"
            [attr.aria-invalid]="isInvalid('category') ? 'true' : null"
            [attr.aria-describedby]="isInvalid('category') ? 'err-category' : null"
          >
            <option value="">Bitte auswählen…</option>
            @for (option of categories; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
          @if (isInvalid('category')) {
            <p id="err-category" class="field-error" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>Bitte wähle einen Anlass aus.</span>
            </p>
          }
        </div>

        <div>
          <label for="grade" class="field-label">In welcher Stufe war das?</label>
          <select
            id="grade"
            class="field-input"
            formControlName="grade"
            [attr.aria-invalid]="isInvalid('grade') ? 'true' : null"
            [attr.aria-describedby]="isInvalid('grade') ? 'err-grade' : 'hint-grade'"
          >
            <option value="">Bitte auswählen…</option>
            @for (option of grades; track option) {
              <option [value]="option">{{ label(option) }}</option>
            }
          </select>
          @if (isInvalid('grade')) {
            <p id="err-grade" class="field-error" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>Bitte wähle die Stufe aus, in der die Aufnahme entstanden ist.</span>
            </p>
          } @else {
            <p id="hint-grade" class="mt-1.5 text-xs text-muted">
              Ungefähr genügt. Wenn du unsicher bist, nimm die wahrscheinlichere.
            </p>
          }
        </div>

        <div class="sm:col-span-2">
          <label for="description" class="field-label">
            Kurzbeschreibung <span class="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="description"
            class="field-input"
            rows="3"
            formControlName="description"
            placeholder="z. B. „Busfahrt nach Rom, Herr ⟨Name⟩ schläft im Hintergrund“"
          ></textarea>
        </div>
      </div>

      <hr class="my-6 border-line" />

      <fieldset>
        <legend class="mb-3 font-bold">Einwilligungen</legend>

        <label class="mb-3 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            class="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            formControlName="consentPersons"
          />
          <span>
            Alle erkennbaren Personen sind mit der Verwendung im Abifilm einverstanden.
          </span>
        </label>

        <label class="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            class="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            formControlName="consentPrivacy"
          />
          <span>
            Ich habe die
            <a routerLink="/datenschutz" class="font-semibold text-primary-ink underline"
              >Datenschutzerklärung</a
            >
            gelesen und bin mit der Speicherung einverstanden.
          </span>
        </label>

        @if (consentMissing()) {
          <p class="field-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>Beide Einwilligungen sind nötig, damit wir das Material verwenden dürfen.</span>
          </p>
        }
      </fieldset>

      <p class="mt-5 text-xs text-muted">
        Dein Material wird ausschließlich für den Abifilm verwendet — nicht für
        Abizeitung, Social Media oder andere Zwecke.
      </p>

      <div class="mt-8">
        <button type="submit" class="btn btn-primary w-full sm:w-auto" [disabled]="!canSubmit()">
          {{ saving() ? 'Wird gespeichert…' : 'Beitrag abschicken' }}
        </button>

        @if (blockedReason()) {
          <p class="mt-3 text-sm text-muted" role="status">{{ blockedReason() }}</p>
        }
      </div>
    </form>
  `,
})
export class SubmissionForm {
  readonly account = input.required<Account>();
  /** Files that finished transferring. Submitting with zero is pointless. */
  readonly completedCount = input.required<number>();
  /** Transfers still running -- the record must reference finished assets. */
  readonly pendingCount = input.required<number>();
  readonly saving = input(false);

  readonly submitted = output<SubmissionMetadata>();

  protected readonly categories = CATEGORIES;
  protected readonly grades = GRADES;
  protected readonly label = gradeLabel;

  private readonly attempted = signal(false);
  private readonly fb = new FormBuilder().nonNullable;

  protected readonly form = this.fb.group({
    category: ['', Validators.required],
    grade: ['', Validators.required],
    description: [''],
    consentPersons: [false, Validators.requiredTrue],
    consentPrivacy: [false, Validators.requiredTrue],
  });

  protected canSubmit(): boolean {
    return this.completedCount() > 0 && this.pendingCount() === 0 && !this.saving();
  }

  protected blockedReason(): string | null {
    if (this.saving()) return null;
    if (this.pendingCount() > 0) {
      const n = this.pendingCount();
      return `Noch ${n} ${n === 1 ? 'Datei wird' : 'Dateien werden'} übertragen. Du kannst abschicken, sobald alle fertig sind.`;
    }
    if (this.completedCount() === 0) return 'Wähle zuerst Fotos oder Videos aus.';
    return null;
  }

  protected isInvalid(name: 'category' | 'grade'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.attempted());
  }

  protected consentMissing(): boolean {
    const { consentPersons, consentPrivacy } = this.form.controls;
    return this.attempted() && (consentPersons.invalid || consentPrivacy.invalid);
  }

  protected onSubmit(): void {
    this.attempted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Move focus to the first problem so keyboard and screen-reader users
      // are not left guessing why nothing happened.
      queueMicrotask(() => {
        const firstError = document.querySelector<HTMLElement>(
          'form [aria-invalid="true"], form input.ng-invalid',
        );
        firstError?.focus();
      });
      return;
    }

    this.submitted.emit(this.form.getRawValue() as SubmissionMetadata);
  }
}
