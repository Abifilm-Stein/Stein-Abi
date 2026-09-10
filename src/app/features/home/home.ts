import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ABI_YEAR, SCHOOL_NAME, SUBMISSION_DEADLINE } from '../../core/config';
import { SubmissionGateway } from '../../core/submissions/submission-gateway';

const WANTED = [
  {
    title: 'Originaldateien',
    text: 'Direkt vom Handy, nicht über WhatsApp weitergeleitet — dort wird alles komprimiert.',
  },
  {
    title: 'Auch Unspektakuläres',
    text: 'Pausenhof, Bus, Wartezeiten. Genau das macht später den Film aus.',
  },
  {
    title: 'Quer und hochkant',
    text: 'Beides ist brauchbar. Hochkant lässt sich im Schnitt verwenden, also lieber mitschicken.',
  },
  {
    title: 'Alte Aufnahmen',
    text: 'Klassenfahrten aus Stufe 6 sind Gold wert. Grabt in euren Galerien.',
  },
];

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="mb-14">
      <p class="mb-3 inline-block rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary-ink">
        Abifilm {{ abiYear }}
      </p>

      <h1 class="mb-4 max-w-3xl text-4xl font-bold sm:text-5xl">
        Wir sammeln
        <span class="text-primary-ink">Fotos und Videos</span>
        für unseren Abifilm.
      </h1>

      <p class="mb-8 max-w-2xl text-lg text-muted">
        Acht Jahre {{ schoolName }} in einem Film — und dafür brauchen wir dein
        Material. Hochladen dauert keine zwei Minuten, ein Konto brauchst du nicht.
      </p>

      <div class="flex flex-wrap items-center gap-4">
        <a routerLink="/upload" class="btn btn-primary text-lg"> Jetzt hochladen </a>
        <div class="text-sm">
          <p class="font-semibold">Einsendeschluss</p>
          <p class="text-muted">{{ deadline }}</p>
        </div>
      </div>

      @if (count() !== null) {
        <p class="mt-8 text-sm text-muted" role="status">
          Bereits
          <span class="text-base font-bold text-primary-ink">{{ count() }}</span>
          {{ count() === 1 ? 'Beitrag' : 'Beiträge' }} gesammelt. Danke dafür.
        </p>
      }
    </section>

    <section class="mb-14" aria-labelledby="wanted">
      <h2 id="wanted" class="mb-5 text-2xl font-bold">Was wir suchen</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        @for (item of wanted; track item.title) {
          <div class="card p-5">
            <h3 class="mb-1.5 font-bold">{{ item.title }}</h3>
            <p class="text-sm text-muted">{{ item.text }}</p>
          </div>
        }
      </div>
    </section>

    <section class="card p-5 sm:p-6" aria-labelledby="privacy-teaser">
      <h2 id="privacy-teaser" class="mb-3 text-xl font-bold">Was mit deinen Dateien passiert</h2>
      <ul class="space-y-2 text-sm text-muted">
        <li>Nur das Abifilm-Team sieht die Uploads — nicht die ganze Stufe.</li>
        <li>Gespeichert wird ausschließlich auf Servern in der EU.</li>
        <li>Nach der Abiturfeier wird alles vollständig gelöscht.</li>
        <li>Du kannst deine Einwilligung jederzeit zurückziehen.</li>
      </ul>
      <a
        routerLink="/datenschutz"
        class="mt-4 inline-block text-sm font-semibold text-primary-ink underline"
      >
        Ausführliche Datenschutzerklärung
      </a>
    </section>
  `,
})
export class Home implements OnInit {
  private readonly gateway = inject(SubmissionGateway);

  protected readonly abiYear = ABI_YEAR;
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly wanted = WANTED;
  protected readonly count = signal<number | null>(null);

  protected readonly deadline = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(SUBMISSION_DEADLINE);

  ngOnInit(): void {
    // A failed counter must not break the landing page: it stays hidden.
    this.gateway
      .count()
      .then((value) => this.count.set(value))
      .catch(() => this.count.set(null));
  }
}
