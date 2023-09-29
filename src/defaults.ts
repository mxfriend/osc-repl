import { osc } from '@mxfriend/osc';
import { CommandMap, FormatterMap, ParserMap } from './types';
import { parseBool, parseIntOrMask, println, take } from './utils';

const $printBuffers = Symbol('print buffers');
const $timers = Symbol('timers');

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
    repl.data[$timers] ??= new Map();
    repl.data[$timers].set(addr, setInterval(() => repl.send(addr, args), parseFloat(interval) * 1000).unref());
    println('Timer set.');
  },
  stop: (repl, addr) => {
      clearInterval(repl.data[$timers]?.get(addr));
      repl.data[$timers]?.delete(addr);
      println('Timer cleared.');
  },
  buffers: (repl, on) => {
    repl.data[$printBuffers] = /^(on|true|1|yes)$/.test(on);
    println(`Verbose buffers are ${repl.data[$printBuffers] ? 'on' : 'off'}.`);
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
