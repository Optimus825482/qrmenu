import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";

export type SmtpStubMode = "accept" | { reply: number; text: string } | "down";

/**
 * In-process SMTP server for tests (no real network, no auth). `accept` stores every message in `received`;
 * `{ reply, text }` refuses the message with that SMTP code (4xx transient, 5xx permanent); `down` binds a
 * port and closes it again, so connections are refused.
 */
export async function startSmtpStub(
  mode: SmtpStubMode = "accept",
): Promise<{ port: number; received: ParsedMail[]; close(): Promise<void> }> {
  const received: ParsedMail[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS", "AUTH"],
    logger: false,
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        if (typeof mode === "object") {
          callback(Object.assign(new Error(mode.text), { responseCode: mode.reply }));
          return;
        }
        simpleParser(Buffer.concat(chunks)).then(
          (mail) => {
            received.push(mail);
            callback();
          },
          (error: Error) => callback(error),
        );
      });
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.server.address() as AddressInfo).port;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  if (mode === "down") await close();
  return { port, received, close: mode === "down" ? async () => {} : close };
}
