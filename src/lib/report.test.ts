import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError, setErrorSink } from './report';

describe('reportError', () => {
  afterEach(() => { setErrorSink(null); vi.restoreAllMocks(); });

  it('journalise toujours et transmet au service de suivi s\'il est configuré', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    setErrorSink(sink);
    const err = new Error('boom');
    reportError(err, { where: 'test' });
    expect(log).toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(err, { where: 'test' });
  });

  it('ne lève jamais d\'exception, même si le service de suivi échoue', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorSink(() => { throw new Error('sink cassé'); });
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});
