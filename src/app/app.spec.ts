import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the shell with a skip link and the legal footer links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('a[href="#inhalt"]')?.textContent).toContain('Zum Inhalt');

    const footerLinks = Array.from(element.querySelectorAll('footer a')).map((a) =>
      a.textContent?.trim(),
    );
    expect(footerLinks).toContain('Datenschutz');
    expect(footerLinks).toContain('Impressum');
  });
});
