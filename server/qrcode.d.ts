// qrcode paketi kendi tiplerini yayınlamıyor; köprüde yalnızca toString(svg) kullanılır.
declare module "qrcode" {
  export function toString(
    text: string,
    opts?: { type?: "svg" | "utf8" | "terminal"; margin?: number; width?: number },
  ): Promise<string>;
  const _default: { toString: typeof toString };
  export default _default;
}
