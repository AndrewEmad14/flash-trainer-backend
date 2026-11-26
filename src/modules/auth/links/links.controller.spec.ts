import type { Response } from 'express';
import type { AppConfigService } from '../../../config/app-config.service';
import { LinksController } from './links.controller';
import { deepLinkFor, isLinkType, landingPage } from './links.page';

const fakeResponse = () => {
  const res = {
    statusCode: 0,
    body: '',
    headers: {} as Record<string, string>,
    type: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
  };
  res.type.mockReturnValue(res);
  res.setHeader.mockImplementation((k: string, v: string) => {
    res.headers[k] = v;
    return res;
  });
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.send.mockImplementation((body: string) => {
    res.body = body;
    return res;
  });
  return res;
};

describe('LinksController', () => {
  const config = { links: { deepLinkScheme: 'flashtrainer' } } as AppConfigService;
  const controller = new LinksController(config);

  it('should render the landing page with the deep link and no-store caching', () => {
    const res = fakeResponse();

    controller.open('verify-email', 'a+b/c', res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toContain('flashtrainer://verify-email?token=a%2Bb%2Fc');
  });

  it('should return a 404 page for an unknown type', () => {
    const res = fakeResponse();

    controller.open('nope', 'x', res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('flashtrainer://');
  });

  it.each([undefined, '', ['a', 'b']])('should return a 400 page for token %p', (token) => {
    const res = fakeResponse();

    controller.open('reset-password', token, res as unknown as Response);

    expect(res.statusCode).toBe(400);
  });
});

describe('links.page', () => {
  it('should recognise only the supported link types', () => {
    expect(isLinkType('verify-email')).toBe(true);
    expect(isLinkType('reset-password')).toBe(true);
    expect(isLinkType('admin')).toBe(false);
  });

  it('should URL-encode the token in the deep link', () => {
    expect(deepLinkFor('flashtrainer', 'verify-email', 'x y&z')).toBe(
      'flashtrainer://verify-email?token=x%20y%26z',
    );
  });

  it('should HTML-escape the deep link and use no JavaScript', () => {
    const html = landingPage('verify-email', 'flashtrainer://verify-email?token="><script>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('http-equiv="refresh"');
  });
});
