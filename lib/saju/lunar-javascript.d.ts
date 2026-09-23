declare module "lunar-javascript" {
  class EightChar {
    setSect(value: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
  }

  class Lunar {
    getEightChar(): EightChar;
  }

  class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
  }

  const lunar: { Solar: typeof Solar };
  export default lunar;
}
