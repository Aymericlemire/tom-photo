import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryCategoryForHomeCard } from '../src/lib/gallery-links.js';

const gallery = {
  categories: ['Portrait', 'Drone et Vidéos', 'Mariage'],
  cards: [
    { title: 'Portrait solo', category: 'Portrait', group: 'Portrait seul' },
    { title: 'Vue par drone', category: 'Drone et Vidéos', group: 'Drone' },
    { title: 'Mariage', category: 'Mariage', group: '' }
  ]
};

test('home gallery cards link to their matching category or group', () => {
  assert.equal(galleryCategoryForHomeCard({ title: 'Portrait' }, gallery), 'Portrait');
  assert.equal(galleryCategoryForHomeCard({ title: 'Drone' }, gallery), 'Drone et Vidéos');
  assert.equal(galleryCategoryForHomeCard({ title: 'Mariage' }, gallery), 'Mariage');
});

test('home gallery cards without a matching category keep the full gallery link', () => {
  assert.equal(galleryCategoryForHomeCard({ title: 'Nouveau projet' }, gallery), '');
  assert.equal(galleryCategoryForHomeCard({ title: '' }, gallery), '');
});
