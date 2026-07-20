import { describe, expect, it } from 'vitest';

import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes only fields that need it and doubles embedded quotes', () => {
    const csv = toCsv(
      ['name', 'note'],
      [
        ['Acme', 'plain'],
        ['Foo, Inc', 'has "quotes"'],
        ['Line\nbreak', null],
      ],
    );

    expect(csv).toBe(
      ['name,note', 'Acme,plain', '"Foo, Inc","has ""quotes"""', '"Line\nbreak",'].join('\r\n'),
    );
  });
});
