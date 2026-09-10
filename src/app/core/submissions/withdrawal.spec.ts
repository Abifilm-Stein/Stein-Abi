import { TestBed } from '@angular/core/testing';
import { Submission, SubmissionDraft } from '../models';
import { LocalSubmissionGateway, SubmissionGateway } from './submission-gateway';

const ACCOUNT = 'acc-mia';
const OTHER_ACCOUNT = 'acc-jonas';

function draft(overrides: Partial<SubmissionDraft> = {}): SubmissionDraft {
  return {
    accountId: ACCOUNT,
    uploaderName: 'Mia Beispiel',
    uploaderClass: 'Q2',
    category: 'Kursfahrt',
    grade: 'Q1',
    description: '',
    consentPersons: true,
    consentPrivacy: true,
    assets: [
      {
        storagePath: 'a/1.jpg',
        originalFilename: '1.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      },
    ],
    ...overrides,
  };
}

describe('Withdrawal requests', () => {
  let gateway: SubmissionGateway;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: SubmissionGateway, useClass: LocalSubmissionGateway }],
    });
    gateway = TestBed.inject(SubmissionGateway);
  });

  const only = async (): Promise<Submission> => (await gateway.listMine(ACCOUNT))[0];

  it('does not delete the submission when a request is filed', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Person möchte nicht vorkommen');

    const mine = await gateway.listMine(ACCOUNT);
    expect(mine.length).toBe(1);
    expect(mine[0].withdrawal?.status).toBe('offen');
    expect(mine[0].withdrawal?.reason).toBe('Person möchte nicht vorkommen');
  });

  it('shows the request to the team with who asked and how many files', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Bitte entfernen');

    const requests = await gateway.listWithdrawalRequests();
    expect(requests.length).toBe(1);
    expect(requests[0].uploaderName).toBe('Mia Beispiel');
    expect(requests[0].assetCount).toBe(1);
    expect(requests[0].status).toBe('offen');
  });

  it('ignores a request for a submission belonging to someone else', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, OTHER_ACCOUNT, 'Nicht meins');

    expect((await gateway.listWithdrawalRequests()).length).toBe(0);
  });

  it('does not file a second open request for the same submission', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Erster Antrag');
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Zweiter Antrag');

    expect((await gateway.listWithdrawalRequests()).length).toBe(1);
  });

  it('deletes the submission once the team completes the request', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Bitte entfernen');

    const [request] = await gateway.listWithdrawalRequests();
    await gateway.resolveWithdrawal(request.id, 'erledigt', 'Clip aus Szene 4 entfernt');

    expect((await gateway.listMine(ACCOUNT)).length).toBe(0);

    const [closed] = await gateway.listWithdrawalRequests();
    expect(closed.status).toBe('erledigt');
    expect(closed.resolutionNote).toBe('Clip aus Szene 4 entfernt');
    // The request survives the submission as the audit trail.
    expect(closed.uploaderName).toBe('Mia Beispiel');
  });

  it('keeps the material when the person takes the request back', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Doch nicht sicher');

    const [request] = await gateway.listWithdrawalRequests();
    await gateway.resolveWithdrawal(request.id, 'zurueckgenommen', 'Mia stimmt zu');

    const mine = await gateway.listMine(ACCOUNT);
    expect(mine.length).toBe(1);
    // No longer flagged, so the team may use it again.
    expect(mine[0].withdrawal).toBeUndefined();
  });

  it('lets the person take back their own open request', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Versehen');

    const request = (await only()).withdrawal;
    await gateway.cancelWithdrawal(request!.id, ACCOUNT);

    expect((await only()).withdrawal).toBeUndefined();
    expect((await gateway.listWithdrawalRequests())[0].status).toBe('zurueckgenommen');
  });

  it('does not let someone else take back a request', async () => {
    const created = await gateway.create(draft());
    await gateway.requestWithdrawal(created.id, ACCOUNT, 'Bitte entfernen');

    const request = (await only()).withdrawal;
    await gateway.cancelWithdrawal(request!.id, OTHER_ACCOUNT);

    expect((await only()).withdrawal?.status).toBe('offen');
  });

  it('sorts open requests before closed ones', async () => {
    const first = await gateway.create(draft());
    const second = await gateway.create(draft());

    await gateway.requestWithdrawal(first.id, ACCOUNT, 'Antrag eins');
    await gateway.requestWithdrawal(second.id, ACCOUNT, 'Antrag zwei');

    const [one] = await gateway.listWithdrawalRequests();
    await gateway.resolveWithdrawal(one.id, 'erledigt', '');

    const requests = await gateway.listWithdrawalRequests();
    expect(requests[0].status).toBe('offen');
  });
});
