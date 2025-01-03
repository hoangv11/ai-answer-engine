/* eslint-disble */
export class Logger {
  private context: string;
  private colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
  };

  constructor(context: string) {
    this.context = context;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatMessage(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const prefix = `${timestamp} ${this.context}: `;
    return { prefix, message, ...(data && { data }) };
  }

  private colorize(color: keyof typeof this.colors, text: string): string {
    return `${this.colors[color]}${text}${this.colors.reset}`;
  }

  private formatLogLevel(level: string): string {
    return `[${level.toUpperCase()}]`;
  }

  private formatOutput({
    prefix,
    message,
    data,
  }: {
    prefix: string;
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  }) {
    const logParts = [prefix, message];
    if (data) {
      logParts.push("\n" + JSON.stringify(data, null, 2));
    }
    return logParts.join(" ");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, data?: any) {
    const formattedMessage = this.formatMessage("info", message, data);
    console.log(
      this.colorize("blue", this.formatLogLevel("info")) +
        "" +
        this.formatOutput(formattedMessage)
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, data?: any) {
    const formattedMessage = this.formatMessage("error", message, data);
    console.error(
      this.colorize("red", this.formatLogLevel("error")) +
        "" +
        this.formatOutput(formattedMessage)
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, data?: any) {
    const formattedMessage = this.formatMessage("warn", message, data);
    console.warn(
      this.colorize("yellow", this.formatLogLevel("warn")) +
        "" +
        this.formatOutput(formattedMessage)
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV !== "development") {
      const formattedMessage = this.formatMessage("debug", message, data);
      console.debug(
        this.colorize("gray", this.formatLogLevel("debug")) +
          "" +
          this.formatOutput(formattedMessage)
      );
    }
  }
}
