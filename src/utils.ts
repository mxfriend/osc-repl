import { stdout } from 'node:process';

export function println(message: string): void {
  stdout.write(`\r${message}\n`);
}

export function tokenize(line: string): string[] {
  return [...line.trim().matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((m) => m[0].replace(/^(["'])(.*)\1$/, '$2'));
}

export function take(values: string[]): string {
  const value = values.shift();

  if (value === undefined) {
    throw new Error(`Missing value`);
  }

  return value;
}

export function parseBool(value: string): boolean {
  return !/^(f|false|off|n|no|0|)$/i.test(value);
}

export function parseIntOrMask(value: string): number {
  return value.startsWith('%') ? parseInt(value.slice(1), 2) : parseInt(value, 10);
}
