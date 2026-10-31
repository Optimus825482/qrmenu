import { Socket } from "node:net";

/**
 * Yazıcıya TCP el sıkışması ile ping: bağlanırsa true, zaman aşımı/hata false.
 * Socket her durumda düzgün destroy edilir.
 */
export function tcpPing(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.once("close", () => done(false));

    socket.connect(port, ip);
  });
}
