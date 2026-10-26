import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCookieUrlFromDomain } from './subdomain.management.ts';

describe('authentication cookie domain', () => {
  for (const url of [
    'https://postiz-example.laravel.cloud',
    'https://social.artisan.build',
    'https://app.example.co.uk',
    'http://localhost:4200',
  ]) {
    it(`omits the Domain attribute for ${url}`, () => {
      assert.equal(getCookieUrlFromDomain(url), undefined);
    });
  }
});
