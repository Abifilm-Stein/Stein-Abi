import { Component, effect, input, output, signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CATEGORIES, SCHOOL_CLASSES } from '../../core/config';
import { SubmissionDraft } from '../../core/models';

export type SubmissionMetadata = Omit<SubmissionDraft, 'assets'>;

@Component({
  selector: 'app-submission-form',
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  template: `
    <form class="card p-5 sm:p-6" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
      <h2 class="mb-1 text-xl font-bold">Wer und was ist zu sehen?</h2>
      <p class="mb-6 text-sm text-muted">
        Ohne diese Angaben landen die Dateien als namenloser Haufen beim Filmteam. Du kannst
        das Formular ausfüllen, während die Dateien noch hochladen.
      </p>

      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="uploaderName" class="field-label">Dein Name</label>
          <input
            id="uploaderName"
            class="field-input"
            formControlName="uploaderName"
            autocomplete="name"
            [attr.aria-invalid]="isInvalid('uploaderName') ? 'true' : null"
            [attr.aria-describedby]="isInvalid('uploaderName') ? 'err-uploaderName' : null"
          />
          @if (isInvalid('uploaderName')) {
            <p id="err-uploaderName" class="field-error" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>Bitte gib deinen Namen an, damit das Filmteam nachfragen kann.</span>
            </p>
          }
        </div>

        <div>
          <label for="uploaderClass" class="field-label">Stufe / Rolle</label>
          <select id="uploaderClass" class="field-input" formControlName="uploaderClass">
            @for (option of schoolClasses; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>

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
          <label for="takenAt" class="field-label">Wann war das?</label>
          <input
            id="takenAt"
            type="month"
            class="field-input"
            formControlName="takenAt"
            [max]="currentMonth"
            [attr.aria-invalid]="isInvalid('takenAt') ? 'true' : null"
            [attr.aria-describedby]="'hint-takenAt'"
          />
          <p id="hint-takenAt" class="mt-1.5 text-xs text-muted">
            Monat und Jahr genügen. Vorbelegt aus dem Dateidatum.
          </p>
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

      <fieldset class="mt-6">
        <legend class="mb-1 font-bold">Nutzung außerhalb des Abifilms</legend>
        <p class="mb-3 text-sm text-muted">
          Darf das Material auch für Abizeitung oder Social Media verwendet werden?
        </p>
        <div class="flex gap-5 text-sm">
          <label class="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              class="size-4 accent-[var(--primary)]"
              formControlName="extendedUsage"
              [value]="false"
            />
            <span>Nein, nur Abifilm</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              class="size-4 accent-[var(--primary)]"
              formControlName="extendedUsage"
              [value]="true"
            />
            <span>Ja, auch darüber hinaus</span>
          </label>
        </div>
      </fieldset>

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
  /** Files that finished transferring. Submitting with zero is pointless. */
  readonly completedCount = input.required<number>();
  /** Transfers still running -- the record must reference finished assets. */
  readonly pendingCount = input.required<number>();
  readonly saving = input(false);
  /** `YYYY-MM` guess from the picked files, used to prefill the date. */
  readonly suggestedMonth = input<string | undefined>(undefined);

  readonly submitted = output<SubmissionMetadata>();

  protected readonly categories = CATEGORIES;
  protected readonly schoolClasses = SCHOOL_CLASSES;
  protected readonly currentMonth = new Date().toISOString().slice(0, 7);

  private readonly attempted = signal(false);

  private readonly fb = new FormBuilder().nonNullable;

  protected readonly form = this.fb.group({
    uploaderName: ['', [Validators.required, Validators.minLength(2)]],
    uploaderClass: [SCHOOL_CLASSES[0] as string, Validators.required],
    category: ['', Validators.required],
    takenAt: ['', Validators.required],
    description: [''],
    consentPersons: [false, Validators.requiredTrue],
    consentPrivacy: [false, Validators.requiredTrue],
    extendedUsage: [false],
  });

  constructor() {
    effect(() => {
      const suggestion = this.suggestedMonth();
      const control = this.form.controls.takenAt;
      // Only fill an untouched empty field -- never overwrite a manual entry.
      if (suggestion && control.pristine && control.value === '') {
        control.setValue(suggestion);
      }
    });
  }

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

  protected isInvalid(name: 'uploaderName' | 'category' | 'takenAt'): boolean {
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
