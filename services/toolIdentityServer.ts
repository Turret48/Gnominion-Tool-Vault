import { createHash } from 'crypto';

export const computeToolId = (rootDomain: string) => {
  return createHash('sha256').update(rootDomain).digest('hex');
};
