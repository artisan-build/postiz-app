import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCookieUrlFromDomain } from './subdomain.management.ts';

describe('authentication cookie domain', () => {
  for (const [url, expected] of [
    ['https://postiz-example.laravel.cloud', 'postiz-example.laravel.cloud'],
    ['https://social.artisan.build', 'social.artisan.build'],
    ['https://app.example.co.uk', 'app.example.co.uk'],
    ['http://localhost:4200', 'localhost'],
  ]) {
    it(`scopes cookies to the request host for ${url}`, () => {
      assert.equal(getCookieUrlFromDomain(url), expected);
    });
  }
});
