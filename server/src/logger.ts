import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export enum LogChannel {
  SERVER = 'SERVER',
  SOCKET = 'SOCKET',
  MATCH = 'MATCH',
  QUEUE = 'QUEUE',
  ROOM = 'ROOM',
  REDIS = 'REDIS',
  RATE = 'RATE',
  SECURITY = 'SECURITY',
  CORS = 'CORS',
  SDP = 'SDP',
  ICE = 'ICE',
  CHAT = 'CHAT',
  MEDIA = 'MEDIA',
  STATE = 'STATE',
}

interface LogEntry {
  timestamp: string;
  channel: string;
  level: string;
  message: string;
  data?: any;
}

class Logger {
  private level: LogLevel;
  private enableColors: boolean;
  private enableJson: boolean;

  constructor() {
    const levelStr = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.level = LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.INFO;
    this.enableColors = process.env.LOG_COLORS?.toLowerCase() !== 'false';
    this.enableJson = process.env.LOG_JSON?.toLowerCase() === 'true';
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: LogLevel, channel: LogChannel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    
    if (this.enableJson) {
      const entry: LogEntry = {
        timestamp,
        channel,
        level: levelStr,
        message,
        data,
      };
      return JSON.stringify(entry);
    }

    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[90m',
      [LogLevel.INFO]: '\x1b[36m',
      [LogLevel.WARN]: '\x1b[33m',
      [LogLevel.ERROR]: '\x1b[31m',
    };

    const reset = '\x1b[0m';
    const channelColor = '\x1b[35m';

    let format = '';
    if (this.enableColors) {
      format = `${colors[level]}[${timestamp}]${reset} ${channelColor}[${channel}]${reset} ${levelStr.padEnd(5)}: ${message}`;
    } else {
      format = `[${timestamp}] [${channel}] ${levelStr.padEnd(5)}: ${message}`;
    }

    if (data !== undefined) {
      if (typeof data === 'object') {
        format += `\n  ${JSON.stringify(data, null, 2)}`;
      } else {
        format += ` | ${data}`;
      }
    }

    return format;
  }

  private log(level: LogLevel, channel: LogChannel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, channel, message, data);
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(channel: LogChannel, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, channel, message, data);
  }

  info(channel: LogChannel, message: string, data?: any): void {
    this.log(LogLevel.INFO, channel, message, data);
  }

  warn(channel: LogChannel, message: string, data?: any): void {
    this.log(LogLevel.WARN, channel, message, data);
  }

  error(channel: LogChannel, message: string, data?: any): void {
    this.log(LogLevel.ERROR, channel, message, data);
  }

  logError(channel: LogChannel, message: string, error: unknown, data?: any): void {
    let errorMsg = 'Unknown error';
    let stack: string | undefined;
    
    if (error instanceof Error) {
      errorMsg = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      errorMsg = error;
    }
    
    this.log(LogLevel.ERROR, channel, message, { error: errorMsg, stack, ...data });
  }

  logConnection(socketId: string, event: string, data?: any): void {
    this.info(LogChannel.SOCKET, `${event} | socket=${socketId}`, data);
  }

  logRoom(roomId: string, action: string, data?: any): void {
    this.info(LogChannel.ROOM, `${action} | room=${roomId}`, data);
  }

  logMatch(socketId1: string, socketId2: string, roomId: string): void {
    this.info(LogChannel.MATCH, `Matched ${socketId1} <-> ${socketId2} in room ${roomId}`);
  }

  logRateLimit(socketId: string, event: string, allowed: boolean, remaining: number): void {
    const status = allowed ? 'ALLOWED' : 'BLOCKED';
    this.warn(LogChannel.RATE, `${status} | socket=${socketId} event=${event} remaining=${remaining}`);
  }

  logSecurity(action: string, details: string, data?: any): void {
    this.warn(LogChannel.SECURITY, `${action} | ${details}`, data);
  }

  logCors(origin: string, allowed: boolean): void {
    const status = allowed ? 'ALLOWED' : 'BLOCKED';
    this.info(LogChannel.CORS, `${status} | origin=${origin}`);
  }
}

export const logger = new Logger();

export const logMiddleware = (channel: LogChannel) => {
  return (message: string, data?: any) => logger.info(channel, message, data);
};
