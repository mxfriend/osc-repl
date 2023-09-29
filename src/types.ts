import { OSCArgument, OSCType, OSCValue } from '@mxfriend/osc';
import { ReplRunner } from './replRunner';

export type Command = (repl: ReplRunner, ...args: string[]) => void | Promise<void>;
export type CommandMap = Record<string, Command>;

export type Parser = (repl: ReplRunner, args: string[]) => OSCArgument;
export type ParserMap = Record<string, Parser>;

export type Formatter<T extends OSCType> = (repl: ReplRunner, arg: OSCValue<T>) => string;
export type FormatterMap = {
  [T in OSCType]?: Formatter<T>;
};
