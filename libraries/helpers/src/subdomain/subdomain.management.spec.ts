import { getCookieUrlFromDomain } from './subdomain.management';

describe('authentication cookie domain', () => {
  it.each([
    ['https://postiz-example.laravel.cloud', '.postiz-example.laravel.cloud'],
    ['https://app.example.co.uk', '.example.co.uk'],
    ['http://localhost:4200', 'localhost'],
  ])('scopes cookies to the registrable site for %s', (url, expected) => {
    expect(getCookieUrlFromDomain(url)).toBe(expected);
  });
});
