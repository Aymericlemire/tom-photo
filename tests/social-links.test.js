import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredSocialLinks } from '../src/lib/social-links.js';

test('social links only include configured profile URLs', () => {
  const links = [
    { label: 'Instagram', url: 'https://www.instagram.com/' },
    { label: 'Facebook', url: 'https://www.facebook.com/tomphoto' },
    { label: 'Invalid', url: 'javascript:alert(1)' },
    { label: '', url: 'https://example.com/profile' }
  ];

  assert.deepEqual(configuredSocialLinks(links), [links[1]]);
});

test('social link filtering handles missing or malformed lists', () => {
  assert.deepEqual(configuredSocialLinks(undefined), []);
  assert.deepEqual(configuredSocialLinks([{ label: 'Instagram', url: 'not a URL' }]), []);
});
