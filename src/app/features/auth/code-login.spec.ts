import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DEMO_CODES, SessionService } from '../../core/account/session.service';
import { CodeLogin } from './code-login';

@Component({ template: 'upload' })
class UploadStub {}

/**
 * Covers the DOM path, not just the service: typing a code into the field and
 * submitting the form has to actually sign the student in. The service tests
 * pass on their own, so a login failure would live exactly here.
 */
describe('CodeLogin', () => {
  let fixture: ComponentFixture<CodeLogin>;
  let session: SessionService;
  let router: Router;

  const input = () => fixture.nativeElement.querySelector('#code') as HTMLInputElement;

  const type = async (value: string) => {
    const field = input();
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  const submit = async () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [CodeLogin],
      providers: [
        provideHttpClient(),
        provideRouter([
          { path: 'upload', component: UploadStub },
          { path: 'meine-beitraege', component: UploadStub },
        ]),
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(CodeLogin);
    await fixture.whenStable();
  });

  it('signs in with a demo code typed exactly as printed', async () => {
    await type(DEMO_CODES[0].code);
    await submit();

    expect(session.isSignedIn()).toBe(true);
    expect(session.account()?.displayName).toBe(DEMO_CODES[0].name);
  });

  it('signs in when the code is typed without dashes', async () => {
    await type(DEMO_CODES[0].code.replace(/-/g, ''));
    await submit();

    expect(session.isSignedIn()).toBe(true);
  });

  it('signs in when the code is typed in lower case', async () => {
    await type(DEMO_CODES[1].code.toLowerCase());
    await submit();

    expect(session.isSignedIn()).toBe(true);
    expect(session.account()?.displayName).toBe(DEMO_CODES[1].name);
  });

  it('groups the code while typing', async () => {
    await type('DEMAQ2MJA234');
    expect(input().value).toBe('DEMA-Q2MJ-A234');
  });

  it('keeps the submit button disabled until the code is complete', async () => {
    const button = () =>
      fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    await type('DEMA-Q2');
    expect(button().disabled).toBe(true);

    await type(DEMO_CODES[0].code);
    expect(button().disabled).toBe(false);
  });

  it('reports an unknown code without signing in', async () => {
    await type('ZZZZ-ZZZZ-ZZZZ');
    await submit();

    expect(session.isSignedIn()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('kennen wir nicht');
  });

  it('navigates onward after a successful sign-in', async () => {
    await type(DEMO_CODES[0].code);
    await submit();
    await fixture.whenStable();

    expect(router.url).toBe('/upload');
  });

  it('offers the demo codes as one-click buttons that sign in', async () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button.font-mono',
      ),
    );
    expect(buttons.length).toBe(DEMO_CODES.length);

    buttons[0].click();
    await fixture.whenStable();

    expect(session.isSignedIn()).toBe(true);
  });
});
