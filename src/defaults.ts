import { osc } from '@mxfriend/osc';
import { ReplRunner } from './replRunner';
import { CommandMap, FormatterMap, ParserMap } from './types';
import { parseBool, parseIntOrMask, println, take } from './utils';

const $printBuffers = Symbol('print buffers');
const $cleanup = Symbol('cleanup');
const $last = Symbol('last');

export const defaultCommands: CommandMap = {
  connect: (repl, ip, port) => {
    if (!ip?.length || !port?.length) {
      throw new Error(`Usage: @connect <ip> <port>`);
    }

    println(`Connecting to ${ip}:${port}.`);

    repl.peer = {
      ip,
      port: parseInt(port, 10),
    };
  },
  disconnect: (repl) => {
    if (repl.peer) {
      println(`Disconnecting from ${repl.peer.ip}:${repl.peer.port}.`);
      repl.peer = undefined;
    } else {
      println('Not connected to any peer at the moment');
    }
  },
  every: async (repl, interval, addr, types, ...values) => {
    const args = repl.parseArgs(types, ...values);
    await repl.send(addr, args);
    repl.data[$last] = addr;
    repl.data[$cleanup] ??= new Map();
    repl.data[$cleanup].set(addr, periodic(parseFloat(interval) * 1000, async () => repl.send(addr, args)));
    println('Timer set.');
  },
  stop: (repl, addr) => {
    addr ??= repl.data[$last];
    repl.data[$cleanup]?.get(addr)?.();
    repl.data[$cleanup]?.delete(addr);
    delete repl.data[$last];
    println('Timer cleared.');
  },
  fade: async (repl, duration, address, from, to) => {
    const [start, end] = await parseFade(repl, address, from, to);
    const a = end - start;
    const d = parseFloat(duration) * 1000;

    repl.data[$last] = address;
    repl.data[$cleanup] ??= new Map();
    repl.data[$cleanup].set(address, periodic(20, async (dt) => {
      const v = start + dt / d * a;
      await repl.send(address, osc.compose('f', v));
      return dt <= d;
    }));
  },
  sin: async (repl, period, address, min, max) => {
    const lo = parseFloat(min);
    const hi = parseFloat(max);
    const a = hi - lo;
    const T = parseFloat(period) * 1000;
    const rpms = 2 * Math.PI / T;

    repl.data[$last] = address;
    repl.data[$cleanup] ??= new Map();
    repl.data[$cleanup].set(address, periodic(20, async (dt) => {
      const v = lo + a * (.5 + .5 * Math.sin(rpms * dt));
      await repl.send(address, osc.compose('f', v));
    }));
  },
  tri: async (repl, period, address, min, max) => {
    const lo = parseFloat(min);
    const hi = parseFloat(max);
    const a = 2 * (hi - lo);
    const T = parseFloat(period) * 1000;

    repl.data[$last] = address;
    repl.data[$cleanup] ??= new Map();
    repl.data[$cleanup].set(address, periodic(20, async (dt) => {
      const v = lo + a * Math.abs(dt / T - Math.floor(.5 + dt / T));
      await repl.send(address, osc.compose('f', v));
    }));
  },
  buffers: (repl, on) => {
    repl.data[$printBuffers] = /^(on|true|1|yes)$/.test(on);
    println(`Verbose buffers are ${repl.data[$printBuffers] ? 'on' : 'off'}.`);
  },
  help: (repl) => {
    for (const [command, cb] of Object.entries(repl.getCommands())) {
      const args = cb.length ? cb.toString().match(/^\s*(?:async\s*)?\([^,)]*,\s*([^)]+)\)/) : null;
      println(`  @${command}${args ? ` ${args[1]}` : ''}`);
    }
  },
  quit: async (repl) => {
    await repl.terminate();
  },
};

export const defaultParsers: ParserMap = {
  's': (repl, values) => osc.string(take(values)),
  'i': (repl, values) => osc.int(parseIntOrMask(take(values))),
  'f': (repl, values) => osc.float(parseFloat(take(values))),
  'B': (repl, values) => osc.bool(parseBool(take(values))),
  'N': () => osc.null(),
};

export const defaultFormatters: FormatterMap = {
  's': (repl, v) => `"${v.replace(/"/g, '\\"')}"`,
  'i': (repl, v) => v.toString(),
  'f': (repl, v) => v.toString(),
  'B': (repl, v) => v ? 'true' : 'false',
  'N': () => 'null',
  'b': (repl, v) => repl.data[$printBuffers] ? v.toString('hex' as any) : `<${v.byteLength}B>`,
};

async function parseFade(repl: ReplRunner, address: string, from: string, to: string): Promise<[number, number]> {
  switch (from) {
    case 'to':
      return [await repl.query(address, 'f'), parseFloat(to)];
    case 'in':
      return [0, .75];
    case 'out':
      return [await repl.query(address, 'f'), 0];
    default:
      return [parseFloat(from), parseFloat(to)];
  }
}

type PeriodicCb = (dt: number) => Promise<boolean | void>;

function periodic(interval: number, cb: PeriodicCb): () => void {
  let tmr: NodeJS.Timeout;
  let stopped = false;

  const t0 = Date.now();
  let tn = t0 + interval;

  tmr = setTimeout(async function run() {
    const t = Date.now();

    if (await cb(t - t0) === false) {
      stopped = true;
    }

    if (!stopped) {
      tn += interval;
      tmr = setTimeout(run, tn - Date.now()).unref();
    }
  }, tn - Date.now()).unref();

  return () => {
    clearTimeout(tmr);
    stopped = true;
  };
}
