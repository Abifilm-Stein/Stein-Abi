import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Account } from '../../core/account/account';
import { SubmissionMetadata } from '../../core/models';
import { SubmissionForm } from './submission-form';

const ACCOUNT: Account = { id: 'acc-1', displayName: 'Mia Beispiel', schoolClass: 'Q2' };

describe('SubmissionForm', () => {
  let fixture: ComponentFixture<SubmissionForm>;
  let emitted: SubmissionMetadata[];

  /** The form is `protected`; reaching it keeps these tests readable. */
  const formOf = (component: SubmissionForm): FormGroup =>
    (component as unknown as { form: FormGroup }).form;

  const submit = () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
  };

  const fillValid = () =>
    formOf(fixture.componentInstance).patchValue({
      category: 'Kursfahrt',
      takenAt: '2025-06',
      description: 'Busfahrt nach Rom',
      consentPersons: true,
      consentPrivacy: true,
    });

  beforeEach(async () => {
    emitted = [];
    await TestBed.configureTestingModule({
      imports: [SubmissionForm],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SubmissionForm);
    fixture.componentRef.setInput('account', ACCOUNT);
    fixture.componentRef.setInput('completedCount', 2);
    fixture.componentRef.setInput('pendingCount', 0);
    fixture.componentInstance.submitted.subscribe((value) => emitted.push(value));
    await fixture.whenStable();
  });

  it('does not submit an empty form', () => {
    submit();
    expect(emitted.length).toBe(0);
  });

  it('blocks submission when the consent checkboxes are unticked', () => {
    fillValid();
    formOf(fixture.componentInstance).patchValue({
      consentPersons: false,
      consentPrivacy: false,
    });

    submit();
    expect(emitted.length).toBe(0);
  });

  it('blocks submission when only one consent is given', () => {
    fillValid();
    formOf(fixture.componentInstance).patchValue({ consentPrivacy: false });

    submit();
    expect(emitted.length).toBe(0);
  });

  it('requires an occasion and a date', () => {
    fillValid();
    formOf(fixture.componentInstance).patchValue({ category: '', takenAt: '' });

    submit();
    expect(emitted.length).toBe(0);
  });

  it('emits the metadata once everything is filled in', () => {
    fillValid();
    submit();

    expect(emitted.length).toBe(1);
    expect(emitted[0].category).toBe('Kursfahrt');
    expect(emitted[0].consentPersons).toBe(true);
  });

  it('shows the signed-in account instead of asking for a name', async () => {
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Mia Beispiel');
    expect(text).toContain('Q2');
    // The name must NOT be a form field any more.
    expect(fixture.nativeElement.querySelector('#uploaderName')).toBeNull();
  });

  it('does not offer any usage beyond the film', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // The material is collected for the Abifilm only. There must be no field
    // that could later be read as permission for anything else.
    expect(fixture.nativeElement.querySelector('input[type="radio"]')).toBeNull();
    expect(text).not.toContain('auch darüber hinaus');
    expect(formOf(fixture.componentInstance).contains('extendedUsage')).toBe(false);
  });

  it('cannot be submitted while transfers are still running', async () => {
    fixture.componentRef.setInput('pendingCount', 3);
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('cannot be submitted with no finished uploads', async () => {
    fixture.componentRef.setInput('completedCount', 0);
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
