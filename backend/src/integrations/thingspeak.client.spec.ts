import { ThingSpeakClient } from './thingspeak.client';

describe('ThingSpeak read-only transport', () => {
  const config = { channelId: '123', readApiKey: 'PRIVATE123' };
  function setup(data: unknown, status = 200) {
    const request = jest.fn(async () => new Response(JSON.stringify(data), { status }));
    return { request, client: new ThingSpeakClient(config, request) };
  }
  const feed = {
    entry_id: 9,
    created_at: '2026-11-25T12:00:00Z',
    field1: '0042',
    field2: null,
    field3: '0',
    field4: 'false',
  };

  it('reads the official fixed HTTPS endpoint without interpreting fields', async () => {
    const { client, request } = setup({ channel: { id: 123 }, feeds: [feed] });
    const snapshot = await client.readLatest();
    expect(snapshot.mappingStatus).toBe('pending');
    expect(snapshot.entry?.fields).toEqual({
      field1: '0042',
      field2: null,
      field3: '0',
      field4: 'false',
      field5: null,
      field6: null,
      field7: null,
      field8: null,
    });
    const [url, options] = request.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://api.thingspeak.com');
    expect(url.pathname).toBe('/channels/123/feeds.json');
    expect(url.searchParams.get('api_key')).toBe(config.readApiKey);
    expect(url.searchParams.get('results')).toBe('1');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(options.signal).toBeDefined();
  });

  it('supports public channels without a key', async () => {
    const request = jest.fn(
      async () => new Response(JSON.stringify({ channel: { id: 123 }, feeds: [] })),
    );
    await new ThingSpeakClient({ channelId: '123', readApiKey: '' }, request).readLatest();
    const [url] = request.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.has('api_key')).toBe(false);
  });

  it('accepts an empty channel without fabricating measurements', async () => {
    const { client } = setup({ channel: { id: 123 }, feeds: [] });
    expect((await client.readLatest()).entry).toBeNull();
  });

  it.each(['', '0', '../other', '1?api_key=x', '9007199254740992'])(
    'rejects invalid channel %s before any network request',
    async (channelId) => {
      const { request } = setup({});
      await expect(
        new ThingSpeakClient({ ...config, channelId }, request).readLatest(),
      ).rejects.toThrow('THINGSPEAK_CHANNEL_ID');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed keys before making a request', async () => {
    const { request } = setup({});
    await expect(
      new ThingSpeakClient({ ...config, readApiKey: 'bad&key' }, request).readLatest(),
    ).rejects.toThrow('formato inválido');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])('sanitizes provider failure %s', async (status) => {
    const { client } = setup({ secret: config.readApiKey }, status);
    await expect(client.readLatest()).rejects.toThrow('No se pudo leer ThingSpeak');
  });

  it('does not propagate network errors containing a secret', async () => {
    const request = jest.fn(async () => {
      throw new Error(config.readApiKey);
    });
    const client = new ThingSpeakClient(config, request);
    try {
      await client.readLatest();
      throw new Error('Expected rejection');
    } catch (error) {
      expect(String(error)).not.toContain(config.readApiKey);
      expect(String(error)).toContain('No se pudo leer ThingSpeak');
    }
  });

  it.each([
    -1,
    { channel: { id: 456 }, feeds: [] },
    { channel: { id: 123 }, feeds: [feed, feed] },
    { channel: { id: 123 }, feeds: [{ ...feed, entry_id: 0 }] },
    { channel: { id: 123 }, feeds: [{ ...feed, created_at: 'yesterday' }] },
    { channel: { id: 123 }, feeds: [{ ...feed, field1: 42 }] },
  ])('rejects invalid payloads without interpreting them', async (data) => {
    await expect(setup(data).client.readLatest()).rejects.toThrow('inválid');
  });

  it('bounds response size', async () => {
    const { client } = setup({ data: 'x'.repeat(256 * 1024) });
    await expect(client.readLatest()).rejects.toThrow('No se pudo leer ThingSpeak');
  });

  it('sanitizes invalid JSON', async () => {
    const request = jest.fn(async () => new Response('not json'));
    await expect(new ThingSpeakClient(config, request).readLatest()).rejects.toThrow(
      'No se pudo leer ThingSpeak',
    );
  });
});
