import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitSaaSMakerFeedback } from './saasmaker-feedback';

afterEach(() => vi.unstubAllGlobals());

describe('submitSaaSMakerFeedback', () => {
  it('sends the widget payload to the hosted API with the publishable project key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitSaaSMakerFeedback(
      {
        type: 'feedback',
        title: 'Useful search results',
        description: 'The recommendation was helpful.',
        email: 'reader@example.com',
        name: 'Reader',
        page: { url: 'https://starboard.codevetter.com', title: 'Starboard' },
      },
      'pk_public_test_key'
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sassmaker.com/v1/feedback');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ 'X-Project-Key': 'pk_public_test_key' });
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(JSON.parse(body.get('feedback') as string)).toMatchObject({
      type: 'feedback',
      title: 'Useful search results',
      description: 'The recommendation was helpful.',
      submitter_email: 'reader@example.com',
      submitter_name: 'Reader',
      page: { url: 'https://starboard.codevetter.com', title: 'Starboard' },
      source: 'widget',
    });
  });

  it('surfaces hosted API failures to the widget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(
      submitSaaSMakerFeedback(
        {
          type: 'bug',
          title: 'Unexpected result',
          description: 'A result was unexpected.',
          page: { url: 'https://starboard.codevetter.com', title: 'Starboard' },
        },
        'pk_public_test_key'
      )
    ).rejects.toThrow('Feedback service returned HTTP 403.');
  });
});
