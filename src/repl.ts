#!/usr/bin/env node

import { parseArgs } from 'util';
import { ReplRunner } from './replRunner';

const args = parseArgs({
  options: {
    localIp: {
      type: 'string',
      short: 'i',
    },
    localPort: {
      type: 'string',
      short: 'p',
    },
    broadcast: {
      type: 'boolean',
      short: 'b',
    },
  },
  allowPositionals: true,
  strict: true,
});

const { localIp: localAddress, localPort: localPortStr, broadcast } = args.values;
const localPort = localPortStr?.length ? parseInt(localPortStr, 10) : undefined;
const [remoteAddress, remotePortStr] = args.positionals;
const remotePort = remotePortStr?.length ? parseInt(remotePortStr, 10) : undefined;

const runner = new ReplRunner({
  localAddress,
  localPort,
  remoteAddress,
  remotePort,
  broadcast,
});

(async () => {
  await runner.run();
})();
