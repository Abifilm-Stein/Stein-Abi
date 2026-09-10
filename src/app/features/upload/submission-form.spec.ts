import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FormGroup } from '@angular/forms';
import { SubmissionForm, SubmissionMetadata } from './submission-form';

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
      uploaderName: 'Mia Beispiel',
      uploaderClass: 'Q2',
      category: 'Kursfahrt',
      takenAt: '2025-06',
      description: 'Busfahrt nach Rom',
      consentPersons: true,
      consentPrivacy: true,
      extendedUsage: false,
    });

  beforeEach(async () => {
    emitted = [];
    await TestBed.configureTestingModule({
      imports: [SubmissionForm],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SubmissionForm);
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

  it('requires a name and an occasion', () => {
    fillValid();
    formOf(fixture.componentInstance).patchValue({ uploaderName: '', category: '' });

    submit();
    expect(emitted.length).toBe(0);
  });

  it('emits the metadata once everything is filled in', () => {
    fillValid();
    submit();

    expect(emitted.length).toBe(1);
    expect(emitted[0].uploaderName).toBe('Mia Beispiel');
    expect(emitted[0].category).toBe('Kursfahrt');
    expect(emitted[0].consentPersons).toBe(true);
    expect(emitted[0].extendedUsage).toBe(false);
  });

  it('defaults extended usage to no', () => {
    expect(formOf(fixture.componentInstance).getRawValue().extendedUsage).toBe(false);
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
