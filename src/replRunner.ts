import { isOSCType, OSCArgument, OSCType, OSCValue, SubscriptionHandler } from '@mxfriend/osc';
import { UdpOSCPeer, UdpOSCPort, UdpOSCPortOptions } from '@mxfriend/osc/udp';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { ReadLine } from 'readline';
import { defaultCommands, defaultFormatters, defaultParsers } from './defaults';
import { CommandMap, FormatterMap, ParserMap } from './types';
import { println, tokenize } from './utils';

export class ReplRunner {
  public readonly data: Record<symbol, any> = {};
  public peer?: UdpOSCPeer;

  private readonly port: UdpOSCPort;
  private readonly subscriptions: Map<string, Set<SubscriptionHandler>> = new Map();
  private readonly io: ReadLine;
  private readonly commands: CommandMap = {};
  private readonly parsers: ParserMap = {};
  private readonly formatters: FormatterMap = {};
  private terminating: boolean = false;

  constructor(options?: UdpOSCPortOptions) {
    this.port = new UdpOSCPort(options);
    this.io = createInterface({
      input: stdin,
      output: stdout,
      prompt: '# ',
      tabSize: 2,
      removeHistoryDuplicates: true,
    });

    this.registerCommands(defaultCommands);
    this.registerParsers(defaultParsers);
    this.registerFormatters(defaultFormatters);
  }

  async run(): Promise<void> {
    this.io.on('close', () => this.terminate());

    this.io.on('line', async (line) => {
      try {
        const [command, args] = this.parseLine(line);

        if (command === undefined) {
          this.io.prompt();
          return;
        }

        if (/^@/.test(command)) {
          const name = command.slice(1);

          if (name in this.commands) {
            await this.commands[name](this, ...(args ?? []));
          } else {
            println(`Unknown command: ${command}`);
          }
        } else {
          await this.port.send(command, args, this.peer);
        }
      } catch (e) {
        println(e.message);
      }

      this.terminating || this.io.prompt();
    });

    this.port.on('message', (msg, peer) => {
      const handlers = this.subscriptions.get(msg.address);

      if (!handlers) {
        println(`> ${msg.address} ${this.formatArgs(msg.args).join(' ')}`);
        this.io.prompt(true);
        return;
      }

      for (const handler of handlers) {
        handler(msg, peer);
      }
    });

    await this.port.open();
    this.io.prompt();
  }

  registerCommands(commands: CommandMap): void {
    Object.assign(this.commands, commands);
  }

  registerParsers(parsers: ParserMap): void {
    Object.assign(this.parsers, parsers);
  }

  registerFormatters(formatters: FormatterMap): void {
    Object.assign(this.formatters, formatters);
  }

  getCommands(): Readonly<CommandMap> {
    return this.commands;
  }

  parseLine(line: string): [command?: string, args?: any[]] {
    if (!line.length) {
      return [];
    }

    const [command, ...args] = tokenize(line);

    if (/^\s*$/.test(command)) {
      return [];
    } else if (!args.length) {
      return [command];
    }

    return [command, /^@/.test(command) ? args : this.parseArgs(...args as [string, ...string[]])];
  }

  parseArgs(types: string | null | undefined, ...values: string[]): OSCArgument[] | undefined {
    if (types === null || types === undefined || !types.length) {
      return undefined;
    }

    const args: OSCArgument[] = [];

    for (let i = 0; i < types.length; ++i) {
      const parser = this.parsers[types.charAt(i)];

      if (!parser) {
        throw new Error(`Unknown type: '${types.charAt(i)}'`);
      }

      args.push(parser(this, values));
    }

    return args;
  }

  formatArgs(args: OSCArgument[]): string[] {
    const formatted: string[] = [];

    for (const arg of args) {
      if (arg.type in this.formatters) {
        formatted.push((this.formatters[arg.type] as any)(this, arg.value));
      } else {
        formatted.push('?');
      }
    }

    return formatted;
  }

  subscribe(address: string, handler: SubscriptionHandler): void {
    const handlers = this.subscriptions.get(address) ?? new Set();
    this.subscriptions.set(address, handlers);
    handlers.add(handler);
  }

  unsubscribe(address?: string, handler?: SubscriptionHandler): void {
    if (address === undefined) {
      return this.subscriptions.clear();
    }

    const handlers = this.subscriptions.get(address);

    if (handler) {
      handlers?.delete(handler);
    } else {
      handlers?.clear();
    }

    if (handlers && !handlers.size) {
      this.subscriptions.delete(address);
    }
  }

  async send(address: string, args?: OSCArgument[]): Promise<void> {
    await this.port.send(address, args, this.peer);
  }

  async query<T extends OSCType>(address: string, type: T): Promise<OSCValue<T>> {
    const tmr = setInterval(async () => {
      await this.send(address);
    }, 50);

    return new Promise((resolve, reject) => {
      const to = setTimeout(reject, 5000);

      this.subscribe(address, ({ args: [arg] }) => {
        if (!isOSCType(arg, type)) {
          return;
        }

        clearInterval(tmr);
        clearTimeout(to);
        resolve(arg.value as OSCValue<T>);
      });
    });
  }

  async terminate(): Promise<void> {
    if (this.terminating) {
      return;
    }

    this.terminating = true;

    println('Bye!');

    this.io.removeAllListeners();
    this.io.close();
    this.port.off();

    await this.port.close();
  }
}
