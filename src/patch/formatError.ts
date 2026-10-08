export class PatchFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchFormatError";
  }
}
